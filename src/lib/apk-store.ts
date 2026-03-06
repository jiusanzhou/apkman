/**
 * APK Store - Central state management for parsed APK data
 * With IndexedDB caching for previously analyzed APKs.
 */

import JSZip from 'jszip';
import { parseAXML, parseManifest, type ManifestInfo } from './parsers/axml';
import { parseDex, type DexFile } from './parsers/dex';
import { parseResourceTable, type ResourceTable } from './parsers/resources';
import { parseSignature, detectSignatureScheme, type SignatureInfo } from './parsers/signature';
import { computeHash, getCachedApk, cacheApk, listCachedApks, deleteCachedApk } from './apk-cache';

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
  size: number;
  compressedSize: number;
}

export interface ApkData {
  fileName: string;
  fileSize: number;
  fileTree: FileTreeNode;
  zip: JSZip;
  manifest: ManifestInfo | null;
  manifestXml: string;
  dexFiles: Map<string, DexFile>;
  resourceTable: ResourceTable | null;
  signatureInfo: SignatureInfo | null;
  signatureScheme: string;
  fileCache: Map<string, ArrayBuffer>;
  hash: string;
  fromCache: boolean;
}

export interface CachedApkSummary {
  hash: string;
  fileName: string;
  fileSize: number;
  timestamp: number;
}

let currentData: ApkData | null = null;

export function getApkData(): ApkData | null {
  return currentData;
}

export async function loadApk(file: File): Promise<ApkData> {
  const buffer = await file.arrayBuffer();
  const hash = await computeHash(buffer);

  // Check cache
  const cached = await getCachedApk(hash);
  if (cached) {
    console.log(`Cache hit for ${file.name} (${hash.slice(0, 8)})`);
    const zip = await JSZip.loadAsync(cached.zipBuffer);
    const fileTree = buildFileTree(zip);
    
    // Restore dexFiles Map
    const dexFiles = new Map<string, DexFile>();
    if (cached.dexFiles) {
      for (const df of cached.dexFiles) {
        dexFiles.set(df.name, df.data as DexFile);
      }
    }

    const data: ApkData = {
      fileName: cached.fileName,
      fileSize: cached.fileSize,
      fileTree,
      zip,
      manifest: cached.manifest as ManifestInfo | null,
      manifestXml: cached.manifestXml,
      dexFiles,
      resourceTable: cached.resourceTable as ResourceTable | null,
      signatureInfo: cached.signatureInfo as SignatureInfo | null,
      signatureScheme: cached.signatureScheme,
      fileCache: new Map(),
      hash,
      fromCache: true,
    };

    currentData = data;
    return data;
  }

  // Fresh parse
  const zip = await JSZip.loadAsync(buffer);
  const fileTree = buildFileTree(zip);

  const data: ApkData = {
    fileName: file.name,
    fileSize: file.size,
    fileTree,
    zip,
    manifest: null,
    manifestXml: '',
    dexFiles: new Map(),
    resourceTable: null,
    signatureInfo: null,
    signatureScheme: detectSignatureScheme(buffer),
    fileCache: new Map(),
    hash,
    fromCache: false,
  };

  currentData = data;

  // Parse contents
  await parseApkContents(data);

  // Cache the results (async, non-blocking)
  cacheApk({
    hash,
    fileName: file.name,
    fileSize: file.size,
    timestamp: Date.now(),
    manifestXml: data.manifestXml,
    manifest: data.manifest,
    dexFiles: Array.from(data.dexFiles.entries()).map(([name, d]) => ({ name, data: d })),
    resourceTable: data.resourceTable,
    signatureInfo: data.signatureInfo,
    signatureScheme: data.signatureScheme,
    zipBuffer: buffer,
  }).catch(e => console.warn('Failed to cache APK:', e));

  return data;
}

export async function loadCachedApk(hash: string): Promise<ApkData | null> {
  const cached = await getCachedApk(hash);
  if (!cached) return null;

  const zip = await JSZip.loadAsync(cached.zipBuffer);
  const fileTree = buildFileTree(zip);

  const dexFiles = new Map<string, DexFile>();
  if (cached.dexFiles) {
    for (const df of cached.dexFiles) {
      dexFiles.set(df.name, df.data as DexFile);
    }
  }

  const data: ApkData = {
    fileName: cached.fileName,
    fileSize: cached.fileSize,
    fileTree,
    zip,
    manifest: cached.manifest as ManifestInfo | null,
    manifestXml: cached.manifestXml,
    dexFiles,
    resourceTable: cached.resourceTable as ResourceTable | null,
    signatureInfo: cached.signatureInfo as SignatureInfo | null,
    signatureScheme: cached.signatureScheme,
    fileCache: new Map(),
    hash,
    fromCache: true,
  };

  currentData = data;
  return data;
}

export { listCachedApks, deleteCachedApk };

function buildFileTree(zip: JSZip): FileTreeNode {
  const root: FileTreeNode = {
    name: '/',
    path: '',
    isDirectory: true,
    children: [],
    size: 0,
    compressedSize: 0,
  };

  const dirs = new Map<string, FileTreeNode>();
  dirs.set('', root);

  const files = Object.keys(zip.files).sort();

  for (const filePath of files) {
    const zipEntry = zip.files[filePath];
    const parts = filePath.split('/').filter(p => p.length > 0);

    let currentPath = '';
    let parentNode = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (isLast && !zipEntry.dir) {
        const node: FileTreeNode = {
          name: part,
          path: currentPath,
          isDirectory: false,
          children: [],
          size: (zipEntry as unknown as Record<string, Record<string, number>>)._data?.uncompressedSize || 0,
          compressedSize: (zipEntry as unknown as Record<string, Record<string, number>>)._data?.compressedSize || 0,
        };
        parentNode.children.push(node);
      } else {
        let dirNode = dirs.get(currentPath);
        if (!dirNode) {
          dirNode = {
            name: part,
            path: currentPath,
            isDirectory: true,
            children: [],
            size: 0,
            compressedSize: 0,
          };
          dirs.set(currentPath, dirNode);
          parentNode.children.push(dirNode);
        }
        parentNode = dirNode;
      }
    }
  }

  const sortChildren = (node: FileTreeNode) => {
    node.children.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      if (child.isDirectory) sortChildren(child);
    }
  };
  sortChildren(root);

  return root;
}

async function parseApkContents(data: ApkData): Promise<void> {
  const promises: Promise<void>[] = [];

  promises.push(
    (async () => {
      try {
        const manifestFile = data.zip.file('AndroidManifest.xml');
        if (manifestFile) {
          const buffer = await manifestFile.async('arraybuffer');
          const doc = parseAXML(buffer);
          data.manifestXml = doc.xml;
          data.manifest = parseManifest(doc);
        }
      } catch (e) {
        console.error('Failed to parse AndroidManifest.xml:', e);
      }
    })()
  );

  const dexFiles = Object.keys(data.zip.files).filter(
    f => f.match(/^classes\d*\.dex$/)
  );
  for (const dexPath of dexFiles) {
    promises.push(
      (async () => {
        try {
          const dexFile = data.zip.file(dexPath);
          if (dexFile) {
            const buffer = await dexFile.async('arraybuffer');
            const dex = parseDex(buffer);
            data.dexFiles.set(dexPath, dex);
          }
        } catch (e) {
          console.error(`Failed to parse ${dexPath}:`, e);
        }
      })()
    );
  }

  promises.push(
    (async () => {
      try {
        const resFile = data.zip.file('resources.arsc');
        if (resFile) {
          const buffer = await resFile.async('arraybuffer');
          data.resourceTable = parseResourceTable(buffer);
        }
      } catch (e) {
        console.error('Failed to parse resources.arsc:', e);
      }
    })()
  );

  promises.push(
    (async () => {
      try {
        const metaInf = Object.keys(data.zip.files).filter(
          f => f.startsWith('META-INF/') && (
            f.endsWith('.RSA') || f.endsWith('.DSA') || f.endsWith('.EC')
          )
        );
        if (metaInf.length > 0) {
          const sigFile = data.zip.file(metaInf[0]);
          if (sigFile) {
            const buffer = await sigFile.async('arraybuffer');
            data.signatureInfo = await parseSignature(
              new Uint8Array(buffer),
              metaInf[0]
            );
          }
        }
      } catch (e) {
        console.error('Failed to parse signature:', e);
      }
    })()
  );

  await Promise.allSettled(promises);
}

export async function getFileContent(path: string): Promise<ArrayBuffer | null> {
  if (!currentData) return null;

  const cached = currentData.fileCache.get(path);
  if (cached) return cached;

  const file = currentData.zip.file(path);
  if (!file) return null;

  const buffer = await file.async('arraybuffer');
  currentData.fileCache.set(path, buffer);
  return buffer;
}

export function getFileExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function isImageFile(path: string): boolean {
  const ext = getFileExtension(path);
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'].includes(ext);
}

export function isBinaryXml(path: string): boolean {
  return path.startsWith('res/') && path.endsWith('.xml');
}

export function isTextFile(path: string): boolean {
  const ext = getFileExtension(path);
  return ['txt', 'xml', 'json', 'properties', 'cfg', 'conf', 'ini', 'md',
    'pro', 'gradle', 'kt', 'java', 'smali', 'sf', 'mf', 'version'].includes(ext);
}
