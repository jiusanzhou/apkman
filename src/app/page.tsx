'use client';

import { useState, useCallback, useEffect } from 'react';
import { loadApk, loadCachedApk, listCachedApks, deleteCachedApk, formatFileSize, type ApkData, type CachedApkSummary } from '@/lib/apk-store';
import { ApkUpload } from '@/components/apk-upload';
import { ThemeToggle } from '@/components/theme-toggle';
import { ApkViewer } from '@/components/apk-viewer';

export default function Home() {
  const [apkData, setApkData] = useState<ApkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedApks, setCachedApks] = useState<CachedApkSummary[]>([]);

  useEffect(() => {
    listCachedApks().then(setCachedApks);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadApk(file);
      setApkData(data);
      listCachedApks().then(setCachedApks);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load APK');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLoadCached = useCallback(async (hash: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadCachedApk(hash);
      if (data) {
        setApkData(data);
      } else {
        setError('Cache entry not found');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cached APK');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDeleteCached = useCallback(async (hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteCachedApk(hash);
    setCachedApks(prev => prev.filter(a => a.hash !== hash));
  }, []);

  const handleReset = useCallback(() => {
    setApkData(null);
    setError(null);
    listCachedApks().then(setCachedApks);
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {!apkData ? (
        <>
          <div className="absolute top-4 right-4 z-10"><ThemeToggle /></div>
          <ApkUpload
            onFile={handleFile}
            loading={loading}
            error={error}
            cachedApks={cachedApks}
            onLoadCached={handleLoadCached}
            onDeleteCached={handleDeleteCached}
          />
        </>
      ) : (
        <ApkViewer data={apkData} onReset={handleReset} />
      )}
    </div>
  );
}
