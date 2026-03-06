'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { type ApkData, formatFileSize, loadApk } from '@/lib/apk-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThemeToggle } from '@/components/theme-toggle';

interface ApkCompareProps {
  baseApk: ApkData;
  onClose: () => void;
}

interface DiffItem {
  type: 'added' | 'removed' | 'changed';
  label: string;
  detail?: string;
}

export function ApkCompare({ baseApk, onClose }: ApkCompareProps) {
  const [compareApk, setCompareApk] = useState<ApkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadApk(file);
      setCompareApk(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load APK');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.apk')) handleFile(file);
  }, [handleFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  if (!compareApk) {
    return (
      <div className="h-full flex flex-col">
        <div className="border-b bg-card px-4 py-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-medium text-sm">APK Comparison</span>
            <Separator orientation="vertical" className="h-5" />
            <span className="text-xs text-muted-foreground">Base: {baseApk.fileName}</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div
            className="max-w-md w-full text-center space-y-4 p-8 border-2 border-dashed rounded-lg hover:border-primary/50 cursor-pointer transition-colors"
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            {loading ? (
              <>
                <div className="w-10 h-10 mx-auto border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-muted-foreground">Loading comparison APK...</p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 mx-auto rounded-2xl bg-muted flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Drop a second APK to compare</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Compare against <span className="font-mono">{baseApk.fileName}</span>
                  </p>
                </div>
              </>
            )}
            {error && (
              <p className="text-destructive text-sm">{error}</p>
            )}
          </div>
          <input ref={inputRef} type="file" accept=".apk" className="hidden" onChange={handleFileChange} />
        </div>
      </div>
    );
  }

  return <CompareView base={baseApk} compare={compareApk} onClose={onClose} />;
}

function CompareView({ base, compare, onClose }: { base: ApkData; compare: ApkData; onClose: () => void }) {
  const permDiff = useMemo(() => computePermissionDiff(base, compare), [base, compare]);
  const classDiff = useMemo(() => computeClassDiff(base, compare), [base, compare]);
  const manifestDiff = useMemo(() => computeManifestDiff(base, compare), [base, compare]);
  const sizeDiff = useMemo(() => computeSizeDiff(base, compare), [base, compare]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm">APK Comparison</span>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline">{base.fileName}</Badge>
            <span className="text-muted-foreground">vs</span>
            <Badge variant="outline">{compare.fileName}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="p-4 grid grid-cols-4 gap-3 shrink-0 border-b">
        <SummaryCard
          label="Permissions"
          added={permDiff.filter(d => d.type === 'added').length}
          removed={permDiff.filter(d => d.type === 'removed').length}
        />
        <SummaryCard
          label="Classes"
          added={classDiff.filter(d => d.type === 'added').length}
          removed={classDiff.filter(d => d.type === 'removed').length}
        />
        <SummaryCard
          label="Manifest"
          added={0}
          removed={0}
          changed={manifestDiff.length}
        />
        <div className="p-3 rounded-lg bg-muted/30 border">
          <p className="text-xs text-muted-foreground">Size Change</p>
          <p className={`text-sm font-mono font-medium mt-0.5 ${sizeDiff.delta > 0 ? 'text-red-500' : sizeDiff.delta < 0 ? 'text-green-500' : ''}`}>
            {sizeDiff.delta > 0 ? '+' : ''}{formatFileSize(Math.abs(sizeDiff.delta))}
            {sizeDiff.delta !== 0 && (
              <span className="text-xs text-muted-foreground ml-1">
                ({sizeDiff.delta > 0 ? '+' : ''}{sizeDiff.percent.toFixed(1)}%)
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Diff tabs */}
      <Tabs defaultValue="permissions" className="flex-1 flex flex-col min-h-0">
        <TabsList className="shrink-0 mx-4 mt-2 w-fit">
          <TabsTrigger value="permissions">
            Permissions {permDiff.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] h-4">{permDiff.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="classes">
            Classes {classDiff.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] h-4">{classDiff.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="manifest">
            Manifest {manifestDiff.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] h-4">{manifestDiff.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="size">Size Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="flex-1 min-h-0 mt-0">
          <DiffList items={permDiff} emptyMessage="No permission changes detected." />
        </TabsContent>

        <TabsContent value="classes" className="flex-1 min-h-0 mt-0">
          <DiffList items={classDiff} emptyMessage="No class changes detected." />
        </TabsContent>

        <TabsContent value="manifest" className="flex-1 min-h-0 mt-0">
          <DiffList items={manifestDiff} emptyMessage="No manifest property changes detected." />
        </TabsContent>

        <TabsContent value="size" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              <SizeRow label="Total APK" oldSize={base.fileSize} newSize={compare.fileSize} />
              {sizeDiff.categories.map((cat) => (
                <SizeRow key={cat.label} label={cat.label} oldSize={cat.oldSize} newSize={cat.newSize} />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, added, removed, changed }: { label: string; added: number; removed: number; changed?: number }) {
  return (
    <div className="p-3 rounded-lg bg-muted/30 border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        {added > 0 && <span className="text-xs font-medium text-green-500">+{added}</span>}
        {removed > 0 && <span className="text-xs font-medium text-red-500">-{removed}</span>}
        {(changed ?? 0) > 0 && <span className="text-xs font-medium text-yellow-500">~{changed}</span>}
        {added === 0 && removed === 0 && (changed ?? 0) === 0 && (
          <span className="text-xs text-muted-foreground">No changes</span>
        )}
      </div>
    </div>
  );
}

function DiffList({ items, emptyMessage }: { items: DiffItem[]; emptyMessage: string }) {
  if (items.length === 0) {
    return <div className="p-6 text-muted-foreground text-sm">{emptyMessage}</div>;
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-1">
        {items.map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono ${
              item.type === 'added' ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
              item.type === 'removed' ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
              'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
            }`}
          >
            <span className="shrink-0 w-4 text-center font-bold">
              {item.type === 'added' ? '+' : item.type === 'removed' ? '-' : '~'}
            </span>
            <span className="truncate">{item.label}</span>
            {item.detail && (
              <span className="ml-auto text-[10px] opacity-70 shrink-0">{item.detail}</span>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function SizeRow({ label, oldSize, newSize }: { label: string; oldSize: number; newSize: number }) {
  const delta = newSize - oldSize;
  const percent = oldSize > 0 ? (delta / oldSize) * 100 : 0;

  return (
    <div className="flex items-center justify-between text-sm p-2 rounded bg-muted/20">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-4 text-xs font-mono">
        <span className="text-muted-foreground">{formatFileSize(oldSize)}</span>
        <span className="text-muted-foreground">&rarr;</span>
        <span>{formatFileSize(newSize)}</span>
        <span className={`w-20 text-right ${delta > 0 ? 'text-red-500' : delta < 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
          {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${formatFileSize(Math.abs(delta))} (${percent > 0 ? '+' : ''}${percent.toFixed(1)}%)`}
        </span>
      </div>
    </div>
  );
}

// Diff computation helpers

function computePermissionDiff(base: ApkData, compare: ApkData): DiffItem[] {
  const basePerms = new Set(base.manifest?.permissions.map(p => p.name) || []);
  const comparePerms = new Set(compare.manifest?.permissions.map(p => p.name) || []);
  const items: DiffItem[] = [];

  for (const p of comparePerms) {
    if (!basePerms.has(p)) {
      items.push({ type: 'added', label: p, detail: 'New permission' });
    }
  }
  for (const p of basePerms) {
    if (!comparePerms.has(p)) {
      items.push({ type: 'removed', label: p, detail: 'Removed permission' });
    }
  }

  return items.sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
}

function computeClassDiff(base: ApkData, compare: ApkData): DiffItem[] {
  const getClassNames = (data: ApkData) => {
    const names = new Set<string>();
    for (const [, dex] of data.dexFiles) {
      for (const cls of dex.classes) {
        names.add(cls.className.replace(/^L/, '').replace(/;$/, '').replace(/\//g, '.'));
      }
    }
    return names;
  };

  const baseClasses = getClassNames(base);
  const compareClasses = getClassNames(compare);
  const items: DiffItem[] = [];

  for (const c of compareClasses) {
    if (!baseClasses.has(c)) {
      items.push({ type: 'added', label: c });
    }
  }
  for (const c of baseClasses) {
    if (!compareClasses.has(c)) {
      items.push({ type: 'removed', label: c });
    }
  }

  return items.sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
}

function computeManifestDiff(base: ApkData, compare: ApkData): DiffItem[] {
  const bm = base.manifest;
  const cm = compare.manifest;
  if (!bm || !cm) return [];

  const items: DiffItem[] = [];
  const check = (field: string, oldVal: string, newVal: string) => {
    if (oldVal !== newVal) {
      items.push({ type: 'changed', label: field, detail: `${oldVal || '(empty)'} → ${newVal || '(empty)'}` });
    }
  };

  check('packageName', bm.packageName, cm.packageName);
  check('versionCode', bm.versionCode, cm.versionCode);
  check('versionName', bm.versionName, cm.versionName);
  check('minSdkVersion', bm.minSdkVersion, cm.minSdkVersion);
  check('targetSdkVersion', bm.targetSdkVersion, cm.targetSdkVersion);
  check('compileSdkVersion', bm.compileSdkVersion, cm.compileSdkVersion);
  check('debuggable', String(bm.application.debuggable), String(cm.application.debuggable));
  check('allowBackup', String(bm.application.allowBackup), String(cm.application.allowBackup));

  // Component count changes
  if (bm.activities.length !== cm.activities.length) {
    items.push({ type: 'changed', label: 'Activities count', detail: `${bm.activities.length} → ${cm.activities.length}` });
  }
  if (bm.services.length !== cm.services.length) {
    items.push({ type: 'changed', label: 'Services count', detail: `${bm.services.length} → ${cm.services.length}` });
  }
  if (bm.receivers.length !== cm.receivers.length) {
    items.push({ type: 'changed', label: 'Receivers count', detail: `${bm.receivers.length} → ${cm.receivers.length}` });
  }
  if (bm.providers.length !== cm.providers.length) {
    items.push({ type: 'changed', label: 'Providers count', detail: `${bm.providers.length} → ${cm.providers.length}` });
  }

  return items;
}

interface SizeDiffResult {
  delta: number;
  percent: number;
  categories: { label: string; oldSize: number; newSize: number }[];
}

function computeSizeDiff(base: ApkData, compare: ApkData): SizeDiffResult {
  const delta = compare.fileSize - base.fileSize;
  const percent = base.fileSize > 0 ? (delta / base.fileSize) * 100 : 0;

  const getSize = (data: ApkData, pattern: RegExp): number => {
    let total = 0;
    data.fileTree.children.forEach(function walk(node) {
      if (!node.isDirectory && pattern.test(node.path)) {
        total += node.size;
      }
      node.children.forEach(walk);
    });
    return total;
  };

  const categories = [
    { label: 'DEX files', pattern: /\.dex$/ },
    { label: 'Native libraries (.so)', pattern: /\.so$/ },
    { label: 'Resources (res/)', pattern: /^res\// },
    { label: 'Assets (assets/)', pattern: /^assets\// },
    { label: 'Kotlin metadata', pattern: /^kotlin\// },
  ];

  return {
    delta,
    percent,
    categories: categories.map(c => ({
      label: c.label,
      oldSize: getSize(base, c.pattern),
      newSize: getSize(compare, c.pattern),
    })),
  };
}
