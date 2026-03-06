/**
 * Export APK analysis results as a downloadable ZIP file.
 * Includes decoded manifest, resource files, and Smali source.
 */

import JSZip from 'jszip';
import { type ApkData } from './apk-store';

export interface ExportProgress {
  phase: string;
  current: number;
  total: number;
}

export async function exportAsZip(
  data: ApkData,
  onProgress?: (progress: ExportProgress) => void
): Promise<Blob> {
  const zip = new JSZip();
  const rootFolder = zip.folder(data.fileName.replace('.apk', ''))!;

  // 1. Add decoded AndroidManifest.xml
  onProgress?.({ phase: 'Adding manifest...', current: 0, total: 4 });
  if (data.manifestXml) {
    rootFolder.file('AndroidManifest.xml', data.manifestXml);
  }

  // 2. Add resource XML files from the APK (decoded binary XML where possible)
  onProgress?.({ phase: 'Adding resources...', current: 1, total: 4 });
  const resFolder = rootFolder.folder('res')!;
  const resFiles = Object.keys(data.zip.files).filter(f => f.startsWith('res/') && f.endsWith('.xml'));

  for (const resPath of resFiles) {
    const zipEntry = data.zip.file(resPath);
    if (zipEntry) {
      try {
        const buffer = await zipEntry.async('arraybuffer');
        // Try to decode binary XML
        const { parseAXML } = await import('./parsers/axml');
        try {
          const doc = parseAXML(buffer);
          resFolder.file(resPath.replace('res/', ''), doc.xml);
        } catch {
          // Not binary XML, add raw content
          resFolder.file(resPath.replace('res/', ''), buffer);
        }
      } catch {
        // Skip files that fail
      }
    }
  }

  // 3. Add string resources as JSON
  onProgress?.({ phase: 'Adding string resources...', current: 2, total: 4 });
  if (data.resourceTable) {
    const stringEntries: Record<string, string> = {};
    for (const entry of data.resourceTable.stringResources) {
      stringEntries[entry.name] = entry.value;
    }
    rootFolder.file('resources/strings.json', JSON.stringify(stringEntries, null, 2));
  }

  // 4. Add Smali source for all DEX classes
  onProgress?.({ phase: 'Adding Smali source...', current: 3, total: 4 });
  const smaliFolder = rootFolder.folder('smali')!;
  let classIndex = 0;

  for (const [dexName, dex] of data.dexFiles) {
    const dexPrefix = data.dexFiles.size > 1 ? dexName.replace('.dex', '') + '/' : '';

    for (const cls of dex.classes) {
      // Convert Lcom/example/Class; to com/example/Class.smali
      const classPath = cls.className
        .replace(/^L/, '')
        .replace(/;$/, '') + '.smali';

      smaliFolder.file(dexPrefix + classPath, cls.smali);
      classIndex++;
    }
  }

  // Generate ZIP
  onProgress?.({ phase: 'Generating ZIP...', current: 4, total: 4 });
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
