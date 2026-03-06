'use client';

import { useCallback, useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatFileSize, type CachedApkSummary, type ParseProgress } from '@/lib/apk-store';

interface ApkUploadProps {
  onFile: (file: File) => void;
  loading: boolean;
  error: string | null;
  cachedApks: CachedApkSummary[];
  onLoadCached: (hash: string) => void;
  onDeleteCached: (hash: string, e: React.MouseEvent) => void;
  parseProgress?: ParseProgress | null;
}

export function ApkUpload({ onFile, loading, error, cachedApks, onLoadCached, onDeleteCached, parseProgress }: ApkUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.apk')) {
        onFile(file);
      }
    },
    [onFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFile(file);
      }
    },
    [onFile]
  );

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-1 overflow-auto">
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center px-8 pt-20 pb-12">
        <div className="w-full max-w-3xl space-y-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            100% Client-Side · Your files never leave your browser
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            <span className="text-primary">APK</span>
            <span className="text-muted-foreground">Man</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-xl mx-auto">
            Reverse engineer Android APKs directly in your browser. 
            No uploads, no servers, no installs.
          </p>

          {/* Upload Area */}
          <Card
            className={`cursor-pointer transition-all duration-200 max-w-xl mx-auto ${
              dragOver
                ? 'border-primary bg-primary/5 scale-[1.02]'
                : 'border-dashed border-2 hover:border-primary/50 hover:bg-muted/30'
            }`}
            onClick={handleClick}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <CardContent className="flex flex-col items-center justify-center py-12 space-y-3">
              {loading ? (
                <>
                  <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <p className="text-muted-foreground">{parseProgress?.phase || 'Analyzing APK...'}</p>
                  {parseProgress && (
                    <div className="w-full max-w-xs">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${parseProgress.percent}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 text-center">{Math.round(parseProgress.percent)}%</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <p className="text-foreground font-medium">
                      Drop an APK file here or click to browse
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Supports .apk files of any size
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {error && (
            <div className="text-center text-destructive text-sm bg-destructive/10 rounded-lg p-3 max-w-xl mx-auto">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Cached APKs */}
      {cachedApks.length > 0 && (
        <div className="max-w-xl mx-auto px-8 pb-12">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Previously Analyzed</h2>
          <div className="space-y-2">
            {cachedApks.map(apk => (
              <div
                key={apk.hash}
                onClick={() => onLoadCached(apk.hash)}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{apk.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(apk.fileSize)} · {formatDate(apk.timestamp)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">cached</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => onDeleteCached(apk.hash, e)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                    </svg>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Features Section */}
      <div className="border-t bg-muted/20">
        <div className="max-w-4xl mx-auto px-8 py-16">
          <h2 className="text-2xl font-bold text-center mb-2">Powerful Analysis Tools</h2>
          <p className="text-muted-foreground text-center mb-10">Everything you need to understand an APK, running entirely in your browser.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                ),
                title: 'Manifest Parser',
                desc: 'Decode binary AndroidManifest.xml. View package info, permissions, activities, services, receivers, and providers.',
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                ),
                title: 'DEX Decompiler',
                desc: 'Decompile Dalvik bytecode to Java source via WASM-powered Rust engine. Smali view also available.',
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                ),
                title: 'Resource Browser',
                desc: 'Parse resources.arsc, browse string tables, view images inline, and decode binary XML resources.',
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                ),
                title: 'Signature Verification',
                desc: 'Inspect APK signing certificates, fingerprints, validity dates, and signature scheme versions.',
              },
            ].map((feature) => (
              <div key={feature.title} className="flex gap-4 p-4 rounded-lg border bg-card">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {feature.icon}
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tech Section */}
      <div className="max-w-4xl mx-auto px-8 py-16">
        <h2 className="text-2xl font-bold text-center mb-10">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div className="space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold">1</div>
            <h3 className="font-semibold">Drop Your APK</h3>
            <p className="text-sm text-muted-foreground">Upload any APK file. It stays in your browser — zero server contact.</p>
          </div>
          <div className="space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold">2</div>
            <h3 className="font-semibold">Instant Analysis</h3>
            <p className="text-sm text-muted-foreground">Custom parsers + Rust→WASM decompiler process everything client-side in seconds.</p>
          </div>
          <div className="space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold">3</div>
            <h3 className="font-semibold">Explore Everything</h3>
            <p className="text-sm text-muted-foreground">Browse files, read Java source, inspect resources, verify signatures.</p>
          </div>
        </div>
      </div>

      {/* Tech Badges */}
      <div className="border-t">
        <div className="max-w-4xl mx-auto px-8 py-12 text-center">
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {['Next.js', 'React', 'TypeScript', 'Rust', 'WebAssembly', 'shadcn/ui', 'Tailwind CSS', 'JSZip', 'Monaco Editor'].map(tech => (
              <Badge key={tech} variant="secondary" className="text-xs">{tech}</Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Built with ❤️ · Open Source · <a href="https://github.com/jiusanzhou" className="text-primary hover:underline">@jiusanzhou</a>
          </p>
        </div>
      </div>

      <input ref={inputRef} type="file" accept=".apk" className="hidden" onChange={handleFileChange} />
    </div>
  );
}
