'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { type ApkData } from '@/lib/apk-store';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SearchResult {
  category: 'permission' | 'string' | 'class' | 'method';
  label: string;
  detail: string;
  dexName?: string;
  className?: string;
}

interface GlobalSearchProps {
  data: ApkData;
  onNavigate: (result: SearchResult) => void;
}

export type { SearchResult };

export function GlobalSearch({ data, onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Keyboard shortcut: Ctrl/Cmd+K to focus
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const hits: SearchResult[] = [];
    const limit = 100;

    // Search permissions
    if (data.manifest) {
      for (const perm of data.manifest.permissions) {
        if (hits.length >= limit) break;
        if (perm.name.toLowerCase().includes(q)) {
          hits.push({
            category: 'permission',
            label: perm.name.split('.').pop() || perm.name,
            detail: perm.name,
          });
        }
      }
    }

    // Search string resources
    if (data.resourceTable) {
      for (const entry of data.resourceTable.stringResources) {
        if (hits.length >= limit) break;
        if (entry.name.toLowerCase().includes(q) || entry.value.toLowerCase().includes(q)) {
          hits.push({
            category: 'string',
            label: entry.name,
            detail: entry.value.length > 80 ? entry.value.slice(0, 80) + '...' : entry.value,
          });
        }
      }
    }

    // Search DEX class/method names
    for (const [dexName, dex] of data.dexFiles) {
      if (hits.length >= limit) break;
      for (const cls of dex.classes) {
        if (hits.length >= limit) break;
        const dotName = cls.className.replace(/^L/, '').replace(/;$/, '').replace(/\//g, '.');
        if (dotName.toLowerCase().includes(q)) {
          hits.push({
            category: 'class',
            label: dotName.split('.').pop() || dotName,
            detail: dotName,
            dexName,
            className: cls.className,
          });
        }
        // Search methods
        for (const method of cls.methods) {
          if (hits.length >= limit) break;
          if (method.name.toLowerCase().includes(q)) {
            hits.push({
              category: 'method',
              label: `${dotName.split('.').pop()}.${method.name}()`,
              detail: dotName,
              dexName,
              className: cls.className,
            });
          }
        }
      }
    }

    return hits;
  }, [query, data]);

  const grouped = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    for (const r of results) {
      if (!groups[r.category]) groups[r.category] = [];
      groups[r.category].push(r);
    }
    return groups;
  }, [results]);

  const categoryLabels: Record<string, string> = {
    permission: 'Permissions',
    string: 'String Resources',
    class: 'Classes',
    method: 'Methods',
  };

  const categoryColors: Record<string, string> = {
    permission: 'bg-red-500/10 text-red-500',
    string: 'bg-blue-500/10 text-blue-500',
    class: 'bg-green-500/10 text-green-500',
    method: 'bg-purple-500/10 text-purple-500',
  };

  const handleSelect = useCallback((result: SearchResult) => {
    onNavigate(result);
    setOpen(false);
    setQuery('');
  }, [onNavigate]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Search permissions, classes, strings... (Ctrl+K)"
          className="h-7 pl-8 pr-2 text-xs w-64"
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-96 bg-popover border rounded-lg shadow-lg z-50 overflow-hidden">
          <ScrollArea className="max-h-80">
            <div className="p-1">
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {categoryLabels[category] || category} ({items.length})
                  </div>
                  {items.slice(0, 20).map((item, i) => (
                    <button
                      key={`${category}-${i}`}
                      onClick={() => handleSelect(item)}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted/50 flex items-center gap-2"
                    >
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${categoryColors[category]}`}>
                        {category}
                      </span>
                      <span className="font-medium truncate">{item.label}</span>
                      <span className="text-muted-foreground truncate ml-auto text-[10px]">{item.detail}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
          {results.length >= 100 && (
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t">
              Showing first 100 results. Refine your search for more specific results.
            </div>
          )}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && (
        <div className="absolute top-full left-0 mt-1 w-96 bg-popover border rounded-lg shadow-lg z-50 p-4 text-center text-sm text-muted-foreground">
          No results found for &quot;{query}&quot;
        </div>
      )}
    </div>
  );
}
