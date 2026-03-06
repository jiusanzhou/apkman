/**
 * APK Parse Worker
 *
 * Runs heavy parsing tasks off the main thread:
 * - ZIP extraction
 * - AndroidManifest.xml (AXML) parsing
 * - DEX file parsing
 * - resources.arsc parsing
 * - Signature parsing
 */

import JSZip from 'jszip';

// We need to inline the parsers since workers can't use module aliases.
// Post messages back with results.

type WorkerMessage =
  | { type: 'parse'; buffer: ArrayBuffer; fileName: string; fileSize: number }
  | { type: 'cancel' };

type WorkerResponse =
  | { type: 'progress'; phase: string; percent: number }
  | { type: 'result'; data: SerializedApkData }
  | { type: 'error'; message: string };

interface SerializedApkData {
  fileName: string;
  fileSize: number;
  manifestXml: string;
  manifest: unknown;
  dexFiles: { name: string; data: unknown }[];
  resourceTable: unknown;
  signatureInfo: unknown;
  signatureScheme: string;
  fileEntries: { path: string; isDir: boolean; size: number; compressedSize: number }[];
  zipBuffer: ArrayBuffer;
}

const ctx = self as unknown as Worker;

ctx.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type !== 'parse') return;

  const { buffer, fileName, fileSize } = e.data;

  try {
    // Phase 1: ZIP extraction
    postProgress('Extracting ZIP...', 5);
    const zip = await JSZip.loadAsync(buffer);

    // Build file entries list
    const fileEntries: SerializedApkData['fileEntries'] = [];
    for (const [path, entry] of Object.entries(zip.files)) {
      fileEntries.push({
        path,
        isDir: entry.dir,
        size: (entry as unknown as Record<string, Record<string, number>>)._data?.uncompressedSize || 0,
        compressedSize: (entry as unknown as Record<string, Record<string, number>>)._data?.compressedSize || 0,
      });
    }

    postProgress('Parsing manifest...', 15);

    // Phase 2: Parse AndroidManifest.xml
    let manifestXml = '';
    let manifest: unknown = null;
    try {
      const manifestFile = zip.file('AndroidManifest.xml');
      if (manifestFile) {
        const manifestBuffer = await manifestFile.async('arraybuffer');
        // We'll use dynamic import for parsers
        const { parseAXML, parseManifest } = await import('../lib/parsers/axml');
        const doc = parseAXML(manifestBuffer);
        manifestXml = doc.xml;
        manifest = parseManifest(doc);
      }
    } catch (err) {
      console.error('Worker: Failed to parse manifest:', err);
    }

    // Phase 3: Parse DEX files
    postProgress('Parsing DEX files...', 30);
    const dexFileNames = Object.keys(zip.files).filter(f => f.match(/^classes\d*\.dex$/)).sort();
    const dexFiles: { name: string; data: unknown }[] = [];

    for (let i = 0; i < dexFileNames.length; i++) {
      const dexPath = dexFileNames[i];
      postProgress(`Parsing ${dexPath}...`, 30 + (i / dexFileNames.length) * 40);

      try {
        const dexFile = zip.file(dexPath);
        if (dexFile) {
          const dexBuffer = await dexFile.async('arraybuffer');
          const { parseDex } = await import('../lib/parsers/dex');
          const dex = parseDex(dexBuffer);
          dexFiles.push({ name: dexPath, data: dex });
        }
      } catch (err) {
        console.error(`Worker: Failed to parse ${dexPath}:`, err);
      }
    }

    // Phase 4: Parse resources
    postProgress('Parsing resources...', 75);
    let resourceTable: unknown = null;
    try {
      const resFile = zip.file('resources.arsc');
      if (resFile) {
        const resBuffer = await resFile.async('arraybuffer');
        const { parseResourceTable } = await import('../lib/parsers/resources');
        resourceTable = parseResourceTable(resBuffer);
      }
    } catch (err) {
      console.error('Worker: Failed to parse resources:', err);
    }

    // Phase 5: Parse signatures
    postProgress('Parsing signatures...', 90);
    let signatureInfo: unknown = null;
    const { detectSignatureScheme } = await import('../lib/parsers/signature');
    const signatureScheme = detectSignatureScheme(buffer);

    try {
      const metaInf = Object.keys(zip.files).filter(
        f => f.startsWith('META-INF/') && (f.endsWith('.RSA') || f.endsWith('.DSA') || f.endsWith('.EC'))
      );
      if (metaInf.length > 0) {
        const sigFile = zip.file(metaInf[0]);
        if (sigFile) {
          const sigBuffer = await sigFile.async('arraybuffer');
          const { parseSignature } = await import('../lib/parsers/signature');
          signatureInfo = await parseSignature(new Uint8Array(sigBuffer), metaInf[0]);
        }
      }
    } catch (err) {
      console.error('Worker: Failed to parse signature:', err);
    }

    postProgress('Complete!', 100);

    const result: SerializedApkData = {
      fileName,
      fileSize,
      manifestXml,
      manifest,
      dexFiles,
      resourceTable,
      signatureInfo,
      signatureScheme,
      fileEntries,
      zipBuffer: buffer,
    };

    ctx.postMessage({ type: 'result', data: result } as WorkerResponse);
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'Worker parse failed',
    } as WorkerResponse);
  }
};

function postProgress(phase: string, percent: number) {
  ctx.postMessage({ type: 'progress', phase, percent } as WorkerResponse);
}
