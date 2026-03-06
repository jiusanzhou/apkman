'use client';

import { useState, useCallback, memo } from 'react';
import { type FileTreeNode, formatFileSize } from '@/lib/apk-store';

interface FileTreeProps {
  node: FileTreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  level: number;
}

const FILE_ICONS: Record<string, string> = {
  xml: '📄',
  dex: '⚙️',
  arsc: '📊',
  png: '🖼️',
  jpg: '🖼️',
  jpeg: '🖼️',
  gif: '🖼️',
  webp: '🖼️',
  so: '🔧',
  pro: '📝',
  properties: '📝',
  json: '📋',
  txt: '📝',
  mf: '📜',
  sf: '📜',
  rsa: '🔐',
  dsa: '🔐',
  ec: '🔐',
  kt: '📦',
  java: '☕',
  smali: '📟',
  default: '📄',
};

function getFileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) {
    if (name === 'META-INF') return '🔒';
    if (name === 'res') return '🎨';
    if (name === 'lib') return '📚';
    if (name === 'assets') return '📁';
    return '📁';
  }
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

export const FileTree = memo(function FileTree({
  node,
  selectedPath,
  onSelect,
  level,
}: FileTreeProps) {
  const [expanded, setExpanded] = useState(level < 1);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (node.isDirectory) {
        setExpanded((prev) => !prev);
      } else {
        onSelect(node.path);
      }
    },
    [node, onSelect]
  );

  if (level === 0 && node.isDirectory) {
    // Root node - render children directly
    return (
      <div className="space-y-0">
        {node.children.map((child) => (
          <FileTree
            key={child.path}
            node={child}
            selectedPath={selectedPath}
            onSelect={onSelect}
            level={level + 1}
          />
        ))}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;
  const indent = (level - 1) * 16;

  return (
    <div>
      <button
        onClick={handleToggle}
        className={`w-full text-left flex items-center gap-1.5 py-0.5 px-1 rounded text-xs hover:bg-muted/50 transition-colors ${
          isSelected ? 'bg-primary/10 text-primary' : ''
        }`}
        style={{ paddingLeft: indent + 4 }}
      >
        {node.isDirectory && (
          <span className="text-[10px] text-muted-foreground w-3">
            {expanded ? '▼' : '▶'}
          </span>
        )}
        {!node.isDirectory && <span className="w-3" />}
        <span className="text-xs">{getFileIcon(node.name, node.isDirectory)}</span>
        <span className="truncate flex-1 font-mono">{node.name}</span>
        {!node.isDirectory && node.size > 0 && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatFileSize(node.size)}
          </span>
        )}
      </button>
      {node.isDirectory && expanded && (
        <div>
          {node.children.map((child) => (
            <FileTree
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
});
