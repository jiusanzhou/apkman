'use client';

import { useState, useCallback } from 'react';
import { type ApkData, formatFileSize } from '@/lib/apk-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileTree } from '@/components/file-tree';
import { ContentViewer } from '@/components/content-viewer';

interface ApkViewerProps {
  data: ApkData;
  onReset: () => void;
}

export function ApkViewer({ data, onReset }: ApkViewerProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [activeTab, setActiveTab] = useState<string>('file');

  const handleFileSelect = useCallback((path: string) => {
    setSelectedFile(path);
    setActiveTab('file');
  }, []);

  const handleTabSelect = useCallback((tab: string) => {
    setActiveTab(tab);
    setSelectedFile(null);
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="border-b bg-card px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onReset} className="text-lg font-bold tracking-tight hover:opacity-70 transition-opacity">
            <span className="text-primary">Dex</span>
            <span className="text-muted-foreground">ray</span>
          </button>
          <Separator orientation="vertical" className="h-6" />
          <span className="font-mono text-sm text-muted-foreground">{data.fileName}</span>
          <Badge variant="secondary">{formatFileSize(data.fileSize)}</Badge>
          {data.manifest && (
            <>
              <Badge variant="outline">{data.manifest.packageName}</Badge>
              {data.manifest.versionName && (
                <Badge variant="outline">v{data.manifest.versionName}</Badge>
              )}
              {data.manifest.minSdkVersion && (
                <Badge variant="outline">API {data.manifest.minSdkVersion}+</Badge>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={onReset}>
            Close
          </Button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sidebar */}
        <div
          className="border-r bg-card flex flex-col shrink-0 min-h-0 overflow-hidden"
          style={{ width: sidebarWidth }}
        >
          {/* Sidebar tabs */}
          <div className="flex flex-wrap border-b shrink-0 overflow-hidden">
            {[
              { id: 'files', label: 'Files' },
              { id: 'manifest', label: 'Manifest' },
              { id: 'dex', label: 'DEX' },
              { id: 'resources', label: 'Resources' },
              { id: 'signatures', label: 'Signatures' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabSelect(tab.id)}
                className={`px-2 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sidebar content */}
          <ScrollArea className="flex-1">
            <div className="p-2">
              {activeTab === 'files' && (
                <FileTree
                  node={data.fileTree}
                  selectedPath={selectedFile}
                  onSelect={handleFileSelect}
                  level={0}
                />
              )}
              {activeTab === 'manifest' && (
                <ManifestSidebar data={data} onSelect={handleFileSelect} />
              )}
              {activeTab === 'dex' && (
                <DexSidebar data={data} />
              )}
              {activeTab === 'resources' && (
                <ResourcesSidebar data={data} />
              )}
              {activeTab === 'signatures' && (
                <SignatureSidebar data={data} />
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          <ContentViewer
            data={data}
            selectedFile={selectedFile}
            activeTab={activeTab}
          />
        </div>
      </div>
    </div>
  );
}

function ManifestSidebar({ data, onSelect }: { data: ApkData; onSelect: (path: string) => void }) {
  const manifest = data.manifest;
  if (!manifest) {
    return <p className="text-sm text-muted-foreground p-2">Parsing manifest...</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      <div>
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">Package</h3>
        <p className="font-mono text-xs break-all">{manifest.packageName}</p>
      </div>
      <div>
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">Version</h3>
        <p className="text-xs">{manifest.versionName} ({manifest.versionCode})</p>
      </div>
      <div>
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">SDK</h3>
        <p className="text-xs">Min: {manifest.minSdkVersion} / Target: {manifest.targetSdkVersion}</p>
      </div>

      <Separator />

      <div>
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">
          Permissions ({manifest.permissions.length})
        </h3>
        <div className="space-y-1">
          {manifest.permissions.map((perm) => (
            <div key={perm.name} className="text-xs">
              <p className="font-mono break-all text-foreground">{perm.name.split('.').pop()}</p>
              <p className="text-muted-foreground">{perm.description}</p>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {manifest.activities.length > 0 && (
        <div>
          <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Activities ({manifest.activities.length})
          </h3>
          {manifest.activities.map((act) => (
            <p key={act.name} className="text-xs font-mono break-all py-0.5">
              {act.name.split('.').pop()}
              {act.exported && <Badge variant="destructive" className="ml-1 text-[10px] h-4">exported</Badge>}
            </p>
          ))}
        </div>
      )}

      {manifest.services.length > 0 && (
        <div>
          <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Services ({manifest.services.length})
          </h3>
          {manifest.services.map((svc) => (
            <p key={svc.name} className="text-xs font-mono break-all py-0.5">
              {svc.name.split('.').pop()}
            </p>
          ))}
        </div>
      )}

      {manifest.receivers.length > 0 && (
        <div>
          <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Receivers ({manifest.receivers.length})
          </h3>
          {manifest.receivers.map((rcv) => (
            <p key={rcv.name} className="text-xs font-mono break-all py-0.5">
              {rcv.name.split('.').pop()}
            </p>
          ))}
        </div>
      )}

      {manifest.providers.length > 0 && (
        <div>
          <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Providers ({manifest.providers.length})
          </h3>
          {manifest.providers.map((prov) => (
            <p key={prov.name} className="text-xs font-mono break-all py-0.5">
              {prov.name.split('.').pop()}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function DexSidebar({ data }: { data: ApkData }) {
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  if (data.dexFiles.size === 0) {
    return <p className="text-sm text-muted-foreground p-2">Parsing DEX files...</p>;
  }

  // Build package hierarchy from all DEX files
  const packageMap = new Map<string, string[]>();
  for (const [dexName, dex] of data.dexFiles) {
    for (const cls of dex.classes) {
      // Convert Lcom/example/Class; to com.example
      const className = cls.className
        .replace(/^L/, '')
        .replace(/;$/, '')
        .replace(/\//g, '.');
      const lastDot = className.lastIndexOf('.');
      const pkg = lastDot > 0 ? className.substring(0, lastDot) : '(default)';
      const simpleName = lastDot > 0 ? className.substring(lastDot + 1) : className;

      if (!packageMap.has(pkg)) packageMap.set(pkg, []);
      packageMap.get(pkg)!.push(simpleName);
    }
  }

  const sortedPackages = Array.from(packageMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const togglePackage = (pkg: string) => {
    setExpandedPackages(prev => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  };

  return (
    <div className="space-y-0.5 text-xs">
      <div className="text-muted-foreground mb-2">
        {data.dexFiles.size} DEX file(s), {Array.from(data.dexFiles.values()).reduce((sum, d) => sum + d.classCount, 0)} classes
      </div>
      {sortedPackages.map(([pkg, classes]) => (
        <div key={pkg}>
          <button
            onClick={() => togglePackage(pkg)}
            className="flex items-center gap-1 w-full text-left py-0.5 hover:bg-muted/50 rounded px-1"
          >
            <span className="text-muted-foreground">{expandedPackages.has(pkg) ? '▼' : '▶'}</span>
            <span className="font-mono text-foreground">{pkg}</span>
            <span className="text-muted-foreground ml-auto">({classes.length})</span>
          </button>
          {expandedPackages.has(pkg) && (
            <div className="ml-4 space-y-0.5">
              {classes.sort().map((cls) => (
                <p key={cls} className="font-mono py-0.5 px-1 hover:bg-muted/50 rounded cursor-default">
                  {cls}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ResourcesSidebar({ data }: { data: ApkData }) {
  if (!data.resourceTable) {
    return <p className="text-sm text-muted-foreground p-2">Parsing resources...</p>;
  }

  const rt = data.resourceTable;
  const byType = new Map<string, number>();
  for (const entry of rt.entries) {
    byType.set(entry.type, (byType.get(entry.type) || 0) + 1);
  }

  const sortedTypes = Array.from(byType.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="space-y-2 text-xs">
      <div className="text-muted-foreground">
        {rt.entries.length} resources, {rt.stringPool.length} strings
      </div>
      <Separator />
      <div>
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">Resource Types</h3>
        {sortedTypes.map(([type, count]) => (
          <div key={type} className="flex justify-between py-0.5 px-1">
            <span className="font-mono">{type}</span>
            <span className="text-muted-foreground">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignatureSidebar({ data }: { data: ApkData }) {
  return (
    <div className="space-y-2 text-xs">
      <div>
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">Scheme</h3>
        <Badge variant="outline">{data.signatureScheme}</Badge>
      </div>
      {data.signatureInfo && data.signatureInfo.certificates.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Certificates</h3>
          {data.signatureInfo.certificates.map((cert, i) => (
            <div key={i} className="space-y-1 p-2 bg-muted/30 rounded">
              <p className="font-mono">{cert.subject.CN || cert.subject.O || 'Unknown'}</p>
              <p className="text-muted-foreground">Issued by: {cert.issuer.CN || cert.issuer.O || 'Unknown'}</p>
              <p className="text-muted-foreground">Algorithm: {cert.signatureAlgorithm}</p>
            </div>
          ))}
        </div>
      )}
      {!data.signatureInfo && (
        <p className="text-muted-foreground">Parsing signatures...</p>
      )}
    </div>
  );
}
