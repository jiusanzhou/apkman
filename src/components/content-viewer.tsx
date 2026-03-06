'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { type ApkData, getFileContent, isImageFile, isBinaryXml, isTextFile, getFileExtension, formatFileSize } from '@/lib/apk-store';
import { parseAXML } from '@/lib/parsers/axml';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeViewer } from '@/components/code-viewer';
import { decompileClass } from '@/lib/decompiler';

interface ContentViewerProps {
  data: ApkData;
  selectedFile: string | null;
  activeTab: string;
  searchSelectedClass?: string | null;
  onSearchSelectedClassHandled?: () => void;
}

export function ContentViewer({ data, selectedFile, activeTab, searchSelectedClass, onSearchSelectedClassHandled }: ContentViewerProps) {
  // Show tab-based content when no file is selected
  if (activeTab === 'manifest' && !selectedFile) {
    return <ManifestViewer data={data} />;
  }
  if (activeTab === 'dex' && !selectedFile) {
    return <DexViewer data={data} searchSelectedClass={searchSelectedClass} onSearchSelectedClassHandled={onSearchSelectedClassHandled} />;
  }
  if (activeTab === 'resources' && !selectedFile) {
    return <ResourcesViewer data={data} />;
  }
  if (activeTab === 'signatures' && !selectedFile) {
    return <SignatureViewer data={data} />;
  }
  if (!selectedFile) {
    return <WelcomeView data={data} />;
  }
  return <FileContentViewer data={data} path={selectedFile} />;
}

function WelcomeView({ data }: { data: ApkData }) {
  const manifest = data.manifest;

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">{data.fileName}</h2>
          <p className="text-muted-foreground">Select a file from the tree or a tab to begin analysis.</p>
        </div>

        {manifest && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoCard label="Package" value={manifest.packageName} />
            <InfoCard label="Version" value={`${manifest.versionName} (${manifest.versionCode})`} />
            <InfoCard label="Min SDK" value={`API ${manifest.minSdkVersion}`} />
            <InfoCard label="Target SDK" value={`API ${manifest.targetSdkVersion}`} />
            <InfoCard label="File Size" value={formatFileSize(data.fileSize)} />
            <InfoCard label="DEX Files" value={`${data.dexFiles.size}`} />
            <InfoCard label="Classes" value={`${Array.from(data.dexFiles.values()).reduce((s, d) => s + d.classCount, 0)}`} />
            <InfoCard label="Permissions" value={`${manifest.permissions.length}`} />
          </div>
        )}

        {manifest && manifest.permissions.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-2">Permissions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {manifest.permissions.map((perm) => (
                <div key={perm.name} className="flex items-start gap-2 p-2 rounded bg-muted/30">
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {perm.name.includes('.')
                      ? perm.name.split('.').pop()
                      : perm.name}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{perm.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {manifest && (
          <div>
            <h3 className="text-lg font-semibold mb-2">Application</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Debuggable:</span> {manifest.application.debuggable ? 'Yes' : 'No'}</div>
              <div><span className="text-muted-foreground">Allow Backup:</span> {manifest.application.allowBackup ? 'Yes' : 'No'}</div>
              <div><span className="text-muted-foreground">RTL Support:</span> {manifest.application.supportsRtl ? 'Yes' : 'No'}</div>
              <div><span className="text-muted-foreground">Signature:</span> {data.signatureScheme}</div>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/30 border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-mono font-medium mt-0.5 break-all">{value}</p>
    </div>
  );
}

function ManifestViewer({ data }: { data: ApkData }) {
  if (!data.manifestXml) {
    return <div className="p-6 text-muted-foreground">Parsing AndroidManifest.xml...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b flex items-center gap-2 shrink-0">
        <span className="font-medium text-sm">AndroidManifest.xml</span>
        <Badge variant="secondary">Decoded from Binary XML</Badge>
      </div>
      <div className="flex-1 min-h-0">
        <CodeViewer code={data.manifestXml} language="xml" />
      </div>
    </div>
  );
}

function DexViewer({ data, searchSelectedClass, onSearchSelectedClassHandled }: { data: ApkData; searchSelectedClass?: string | null; onSearchSelectedClassHandled?: () => void }) {
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'smali' | 'java'>('java');
  const [javaCode, setJavaCode] = useState<string | null>(null);
  const [javaLoading, setJavaLoading] = useState(false);
  const [javaError, setJavaError] = useState<string | null>(null);

  // Handle search navigation
  useEffect(() => {
    if (searchSelectedClass) {
      setSelectedClass(searchSelectedClass);
      onSearchSelectedClassHandled?.();
    }
  }, [searchSelectedClass, onSearchSelectedClassHandled]);

  const allClasses = useMemo(() => {
    const classes: { dexName: string; className: string; smali: string }[] = [];
    for (const [dexName, dex] of data.dexFiles) {
      for (const cls of dex.classes) {
        classes.push({
          dexName,
          className: cls.className,
          smali: cls.smali,
        });
      }
    }
    return classes.sort((a, b) => a.className.localeCompare(b.className));
  }, [data.dexFiles]);

  // Cache for decompiled Java code
  const javaCacheRef = useRef(new Map<string, string>());

  // Decompile selected class when switching to Java view
  useEffect(() => {
    if (!selectedClass || viewMode !== 'java') return;

    const cached = javaCacheRef.current.get(selectedClass);
    if (cached) {
      setJavaCode(cached);
      return;
    }

    setJavaLoading(true);
    setJavaError(null);
    setJavaCode(null);

    // Find which DEX file contains this class
    const classInfo = allClasses.find(c => c.className === selectedClass);
    if (!classInfo) return;

    const dexFile = data.zip.file(classInfo.dexName);
    if (!dexFile) return;

    dexFile.async('arraybuffer').then(async (buffer) => {
      try {
        const java = await decompileClass(buffer, selectedClass);
        javaCacheRef.current.set(selectedClass, java);
        setJavaCode(java);
      } catch (e) {
        setJavaError(e instanceof Error ? e.message : String(e));
      } finally {
        setJavaLoading(false);
      }
    });
  }, [selectedClass, viewMode, allClasses, data.zip]);

  if (data.dexFiles.size === 0) {
    return <div className="p-6 text-muted-foreground">Parsing DEX files...</div>;
  }

  const selected = selectedClass
    ? allClasses.find(c => c.className === selectedClass)
    : null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b flex items-center gap-2 shrink-0">
        <span className="font-medium text-sm">DEX Decompiler</span>
        <Badge variant="secondary">
          {allClasses.length} classes
        </Badge>
        {data.dexFiles.size > 1 && (
          <Badge variant="outline">{data.dexFiles.size} DEX files</Badge>
        )}
        <div className="ml-auto flex items-center gap-1 bg-muted rounded-md p-0.5">
          <button
            onClick={() => setViewMode('java')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              viewMode === 'java' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Java
          </button>
          <button
            onClick={() => setViewMode('smali')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              viewMode === 'smali' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Smali
          </button>
        </div>
      </div>
      <div className="flex-1 flex min-h-0">
        {/* Class list */}
        <ScrollArea className="w-80 border-r shrink-0 h-full">
          <div className="p-2 space-y-0.5">
            {allClasses.map((cls) => {
              const simpleName = cls.className.replace(/^L/, '').replace(/;$/, '').replace(/\//g, '.');
              return (
                <button
                  key={cls.className}
                  onClick={() => setSelectedClass(cls.className)}
                  className={`w-full text-left text-xs font-mono py-1 px-2 rounded truncate hover:bg-muted/50 ${
                    selectedClass === cls.className ? 'bg-primary/10 text-primary' : ''
                  }`}
                >
                  {simpleName}
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Code viewer */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {!selected ? (
            <div className="p-6 text-muted-foreground">
              Select a class to view its decompiled source.
            </div>
          ) : viewMode === 'smali' ? (
            <CodeViewer code={selected.smali} language="smali" />
          ) : javaLoading ? (
            <div className="flex items-center gap-3 p-6 text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              Decompiling to Java...
            </div>
          ) : javaError ? (
            <div className="p-6">
              <div className="text-destructive text-sm mb-2">Decompilation failed</div>
              <pre className="text-xs text-muted-foreground bg-muted/30 p-3 rounded overflow-auto">{javaError}</pre>
              <button onClick={() => setViewMode('smali')} className="mt-3 text-xs text-primary hover:underline">
                View Smali instead
              </button>
            </div>
          ) : javaCode ? (
            <CodeViewer code={javaCode} language="java" />
          ) : (
            <div className="p-6 text-muted-foreground">
              Select a class to decompile.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResourcesViewer({ data }: { data: ApkData }) {
  const [filter, setFilter] = useState('');

  if (!data.resourceTable) {
    return <div className="p-6 text-muted-foreground">Parsing resources.arsc...</div>;
  }

  const rt = data.resourceTable;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b flex items-center gap-2 shrink-0">
        <span className="font-medium text-sm">Resources</span>
        <Badge variant="secondary">{rt.entries.length} entries</Badge>
        <Badge variant="outline">{rt.stringPool.length} strings</Badge>
      </div>

      <Tabs defaultValue="strings" className="flex-1 flex flex-col min-h-0">
        <TabsList className="shrink-0 mx-4 mt-2 w-fit">
          <TabsTrigger value="strings">String Resources</TabsTrigger>
          <TabsTrigger value="all">All Resources</TabsTrigger>
          <TabsTrigger value="stringpool">String Pool</TabsTrigger>
        </TabsList>

        <TabsContent value="strings" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 px-2 font-medium text-muted-foreground">ID</th>
                    <th className="text-left py-1 px-2 font-medium text-muted-foreground">Name</th>
                    <th className="text-left py-1 px-2 font-medium text-muted-foreground">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {rt.stringResources.map((entry, i) => (
                    <tr key={i} className="border-b border-muted/30 hover:bg-muted/20">
                      <td className="py-1 px-2 font-mono text-muted-foreground">{entry.id}</td>
                      <td className="py-1 px-2 font-mono">{entry.name}</td>
                      <td className="py-1 px-2 max-w-md truncate">{entry.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="all" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-4">
              <div className="mb-2">
                <input
                  type="text"
                  placeholder="Filter by name or type..."
                  className="w-full max-w-sm px-3 py-1.5 text-sm bg-muted/30 border rounded"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 px-2 font-medium text-muted-foreground">ID</th>
                    <th className="text-left py-1 px-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-left py-1 px-2 font-medium text-muted-foreground">Name</th>
                    <th className="text-left py-1 px-2 font-medium text-muted-foreground">Value</th>
                    <th className="text-left py-1 px-2 font-medium text-muted-foreground">Config</th>
                  </tr>
                </thead>
                <tbody>
                  {rt.entries
                    .filter(e => !filter || e.name.includes(filter) || e.type.includes(filter))
                    .slice(0, 1000)
                    .map((entry, i) => (
                      <tr key={i} className="border-b border-muted/30 hover:bg-muted/20">
                        <td className="py-1 px-2 font-mono text-muted-foreground">{entry.id}</td>
                        <td className="py-1 px-2">
                          <Badge variant="outline" className="text-[10px]">{entry.type}</Badge>
                        </td>
                        <td className="py-1 px-2 font-mono">{entry.name}</td>
                        <td className="py-1 px-2 max-w-xs truncate">{entry.value}</td>
                        <td className="py-1 px-2 text-muted-foreground">{entry.config}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {rt.entries.length > 1000 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Showing first 1000 of {rt.entries.length} entries. Use the filter to narrow results.
                </p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="stringpool" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 px-2 font-medium text-muted-foreground w-16">#</th>
                    <th className="text-left py-1 px-2 font-medium text-muted-foreground">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {rt.stringPool.slice(0, 2000).map((str, i) => (
                    <tr key={i} className="border-b border-muted/30 hover:bg-muted/20">
                      <td className="py-1 px-2 font-mono text-muted-foreground">{i}</td>
                      <td className="py-1 px-2 font-mono break-all">{str}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SignatureViewer({ data }: { data: ApkData }) {
  const sig = data.signatureInfo;

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-3xl space-y-6">
        <div>
          <h2 className="text-lg font-bold mb-2">Signature Information</h2>
          <Badge variant="secondary">{data.signatureScheme}</Badge>
        </div>

        {sig && sig.certificates.length > 0 ? (
          sig.certificates.map((cert, i) => (
            <div key={i} className="space-y-4 border rounded-lg p-4">
              <h3 className="font-semibold">Certificate #{i + 1}</h3>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Subject</h4>
                  {Object.entries(cert.subject).map(([k, v]) => (
                    <p key={k}><span className="text-muted-foreground">{k}:</span> {v}</p>
                  ))}
                </div>
                <div>
                  <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Issuer</h4>
                  {Object.entries(cert.issuer).map(([k, v]) => (
                    <p key={k}><span className="text-muted-foreground">{k}:</span> {v}</p>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p><span className="text-muted-foreground">Version:</span> {cert.version}</p>
                  <p><span className="text-muted-foreground">Serial:</span> <span className="font-mono text-xs">{cert.serialNumber}</span></p>
                  <p><span className="text-muted-foreground">Algorithm:</span> {cert.signatureAlgorithm}</p>
                  <p><span className="text-muted-foreground">Public Key:</span> {cert.publicKeyAlgorithm} ({cert.publicKeySize} bits)</p>
                </div>
                <div>
                  <p><span className="text-muted-foreground">Valid From:</span> {cert.validFrom?.toISOString().split('T')[0] || 'N/A'}</p>
                  <p><span className="text-muted-foreground">Valid To:</span> {cert.validTo?.toISOString().split('T')[0] || 'N/A'}</p>
                </div>
              </div>

              {(cert.fingerprints.sha1 || cert.fingerprints.sha256) && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="text-xs text-muted-foreground uppercase tracking-wider">Fingerprints</h4>
                    {cert.fingerprints.md5 && (
                      <div>
                        <p className="text-xs text-muted-foreground">MD5</p>
                        <p className="font-mono text-xs break-all">{cert.fingerprints.md5}</p>
                      </div>
                    )}
                    {cert.fingerprints.sha1 && (
                      <div>
                        <p className="text-xs text-muted-foreground">SHA-1</p>
                        <p className="font-mono text-xs break-all">{cert.fingerprints.sha1}</p>
                      </div>
                    )}
                    {cert.fingerprints.sha256 && (
                      <div>
                        <p className="text-xs text-muted-foreground">SHA-256</p>
                        <p className="font-mono text-xs break-all">{cert.fingerprints.sha256}</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">
            {sig ? 'No certificates found in this APK.' : 'Parsing signatures...'}
          </p>
        )}

        {sig?.signerInfo && !['RSA', 'DSA', 'EC'].includes(sig.signerInfo) && (
          <div>
            <h3 className="font-semibold mb-2">Signer Info</h3>
            <pre className="text-xs font-mono bg-muted/30 p-3 rounded overflow-x-auto whitespace-pre-wrap">
              {sig.signerInfo}
            </pre>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function FileContentViewer({ data, path }: { data: ApkData; path: string }) {
  const [content, setContent] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [decodedXml, setDecodedXml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDecodedXml(null);

    getFileContent(path).then(async (buf) => {
      if (cancelled) return;
      setContent(buf);

      // Try to decode binary XML
      if (buf && isBinaryXml(path)) {
        try {
          const doc = parseAXML(buf);
          setDecodedXml(doc.xml);
        } catch {
          // Not a binary XML, will show as raw
        }
      }

      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [path]);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading {path}...</div>;
  }

  if (!content) {
    return <div className="p-6 text-muted-foreground">File not found: {path}</div>;
  }

  const ext = getFileExtension(path);

  // Special handler for AndroidManifest.xml
  if (path === 'AndroidManifest.xml' && data.manifestXml) {
    return (
      <div className="h-full flex flex-col">
        <FileHeader path={path} size={content.byteLength} extra="Binary XML (decoded)" />
        <div className="flex-1 min-h-0">
          <CodeViewer code={data.manifestXml} language="xml" />
        </div>
      </div>
    );
  }

  // Decoded binary XML
  if (decodedXml) {
    return (
      <div className="h-full flex flex-col">
        <FileHeader path={path} size={content.byteLength} extra="Binary XML (decoded)" />
        <div className="flex-1 min-h-0">
          <CodeViewer code={decodedXml} language="xml" />
        </div>
      </div>
    );
  }

  // Image files
  if (isImageFile(path)) {
    const blob = new Blob([content]);
    const url = URL.createObjectURL(blob);
    return (
      <div className="h-full flex flex-col">
        <FileHeader path={path} size={content.byteLength} />
        <div className="flex-1 flex items-center justify-center p-8 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjMjIyIi8+PHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMyMjIiLz48L3N2Zz4=')]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={path}
            className="max-w-full max-h-full object-contain"
            onLoad={() => URL.revokeObjectURL(url)}
          />
        </div>
      </div>
    );
  }

  // Text files
  if (isTextFile(path) || ext === 'xml') {
    const text = new TextDecoder('utf-8').decode(content);
    const lang = ext === 'json' ? 'json' : ext === 'xml' ? 'xml' : ext === 'java' ? 'java' : ext === 'kt' ? 'kotlin' : 'plaintext';
    return (
      <div className="h-full flex flex-col">
        <FileHeader path={path} size={content.byteLength} />
        <div className="flex-1 min-h-0">
          <CodeViewer code={text} language={lang} />
        </div>
      </div>
    );
  }

  // DEX files
  if (ext === 'dex') {
    const dex = data.dexFiles.get(path);
    if (dex) {
      return (
        <div className="h-full flex flex-col">
          <FileHeader path={path} size={content.byteLength} extra={`${dex.classCount} classes, ${dex.methodCount} methods`} />
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <InfoCard label="Version" value={dex.header.version} />
                <InfoCard label="File Size" value={formatFileSize(dex.header.fileSize)} />
                <InfoCard label="Classes" value={dex.header.classDefsSize.toString()} />
                <InfoCard label="Methods" value={dex.header.methodIdsSize.toString()} />
                <InfoCard label="Fields" value={dex.header.fieldIdsSize.toString()} />
                <InfoCard label="Strings" value={dex.header.stringIdsSize.toString()} />
              </div>
            </div>
          </ScrollArea>
        </div>
      );
    }
  }

  // Resources.arsc
  if (path === 'resources.arsc' && data.resourceTable) {
    return (
      <div className="h-full flex flex-col">
        <FileHeader path={path} size={content.byteLength} extra={`${data.resourceTable.entries.length} resources`} />
        <ScrollArea className="flex-1">
          <div className="p-4 text-sm text-muted-foreground">
            Switch to the Resources tab to browse resource entries.
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Binary file - show hex dump
  return (
    <div className="h-full flex flex-col">
      <FileHeader path={path} size={content.byteLength} extra="Binary file" />
      <ScrollArea className="flex-1">
        <div className="p-4">
          <HexDump data={new Uint8Array(content)} maxBytes={4096} />
        </div>
      </ScrollArea>
    </div>
  );
}

function FileHeader({ path, size, extra }: { path: string; size: number; extra?: string }) {
  return (
    <div className="px-4 py-2 border-b flex items-center gap-2 shrink-0">
      <span className="font-mono text-sm">{path}</span>
      <Badge variant="secondary">{formatFileSize(size)}</Badge>
      {extra && <Badge variant="outline">{extra}</Badge>}
    </div>
  );
}

function HexDump({ data, maxBytes }: { data: Uint8Array; maxBytes: number }) {
  const lines: string[] = [];
  const limit = Math.min(data.length, maxBytes);

  for (let i = 0; i < limit; i += 16) {
    const hex: string[] = [];
    const ascii: string[] = [];

    for (let j = 0; j < 16; j++) {
      if (i + j < limit) {
        hex.push(data[i + j].toString(16).padStart(2, '0'));
        const ch = data[i + j];
        ascii.push(ch >= 32 && ch < 127 ? String.fromCharCode(ch) : '.');
      } else {
        hex.push('  ');
        ascii.push(' ');
      }
    }

    const addr = i.toString(16).padStart(8, '0');
    lines.push(`${addr}  ${hex.slice(0, 8).join(' ')}  ${hex.slice(8).join(' ')}  |${ascii.join('')}|`);
  }

  if (data.length > maxBytes) {
    lines.push(`\n... ${data.length - maxBytes} more bytes not shown`);
  }

  return (
    <pre className="font-mono text-xs leading-5 text-muted-foreground whitespace-pre">
      {lines.join('\n')}
    </pre>
  );
}
