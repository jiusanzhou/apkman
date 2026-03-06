'use client';

import { useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then(m => m.default), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
      Loading editor...
    </div>
  ),
});

interface CodeViewerProps {
  code: string;
  language: string;
}

// Map our language names to Monaco language IDs
function getMonacoLanguage(language: string): string {
  switch (language) {
    case 'xml': return 'xml';
    case 'json': return 'json';
    case 'java': return 'java';
    case 'kotlin': return 'kotlin';
    case 'smali': return 'plaintext'; // We'll register smali syntax
    case 'plaintext': return 'plaintext';
    default: return 'plaintext';
  }
}

export function CodeViewer({ code, language }: CodeViewerProps) {
  const editorRef = useRef<unknown>(null);

  const handleEditorMount = (editor: unknown, monaco: unknown) => {
    editorRef.current = editor;

    // Register Smali language if needed
    if (language === 'smali' && monaco && typeof monaco === 'object' && 'languages' in monaco) {
      const m = monaco as { languages: { register: (def: { id: string }) => void; setMonarchTokensProvider: (id: string, provider: unknown) => void } };
      try {
        m.languages.register({ id: 'smali' });
        m.languages.setMonarchTokensProvider('smali', {
          tokenizer: {
            root: [
              [/^\.class\b/, 'keyword'],
              [/^\.super\b/, 'keyword'],
              [/^\.source\b/, 'keyword'],
              [/^\.implements\b/, 'keyword'],
              [/^\.field\b/, 'keyword'],
              [/^\.method\b/, 'keyword'],
              [/^\.end method\b/, 'keyword'],
              [/^\.registers\b/, 'keyword'],
              [/^\.locals\b/, 'keyword'],
              [/^\.param\b/, 'keyword'],
              [/^\.prologue\b/, 'keyword'],
              [/^\.line\b/, 'comment'],
              [/^# .*$/, 'comment'],
              [/\b(public|private|protected|static|final|abstract|synthetic|bridge|varargs|native|constructor|interface|enum|annotation)\b/, 'keyword'],
              [/\b(invoke-virtual|invoke-super|invoke-direct|invoke-static|invoke-interface|invoke-virtual\/range|invoke-super\/range|invoke-direct\/range|invoke-static\/range|invoke-interface\/range)\b/, 'type'],
              [/\b(move|move-wide|move-object|move-result|move-result-wide|move-result-object|move-exception)\b/, 'type'],
              [/\b(return-void|return|return-wide|return-object)\b/, 'type'],
              [/\b(const\/4|const\/16|const|const\/high16|const-wide\/16|const-wide\/32|const-wide|const-wide\/high16|const-string|const-string\/jumbo|const-class)\b/, 'type'],
              [/\b(if-eq|if-ne|if-lt|if-ge|if-gt|if-le|if-eqz|if-nez|if-ltz|if-gez|if-gtz|if-lez)\b/, 'type'],
              [/\b(goto|goto\/16|goto\/32)\b/, 'type'],
              [/\b(new-instance|new-array|check-cast|instance-of|array-length)\b/, 'type'],
              [/\b(iget|iget-wide|iget-object|iget-boolean|iget-byte|iget-char|iget-short|iput|iput-wide|iput-object|iput-boolean|iput-byte|iput-char|iput-short)\b/, 'type'],
              [/\b(sget|sget-wide|sget-object|sget-boolean|sget-byte|sget-char|sget-short|sput|sput-wide|sput-object|sput-boolean|sput-byte|sput-char|sput-short)\b/, 'type'],
              [/\b(aget|aget-wide|aget-object|aget-boolean|aget-byte|aget-char|aget-short|aput|aput-wide|aput-object|aput-boolean|aput-byte|aput-char|aput-short)\b/, 'type'],
              [/\b(add-int|sub-int|mul-int|div-int|rem-int|and-int|or-int|xor-int|shl-int|shr-int|ushr-int)\b/, 'type'],
              [/\b(nop|monitor-enter|monitor-exit|throw|fill-array-data|packed-switch|sparse-switch)\b/, 'type'],
              [/v\d+/, 'variable'],
              [/p\d+/, 'variable'],
              [/"[^"]*"/, 'string'],
              [/L[a-zA-Z0-9_$\/]+;/, 'string.type'],
              [/->[\w<>$]+/, 'function'],
              [/:\w+_\d+/, 'tag'],
              [/0x[0-9a-fA-F]+/, 'number'],
              [/\b\d+\b/, 'number'],
            ],
          },
        });
      } catch {
        // Language already registered
      }
    }
  };

  return (
    <MonacoEditor
      height="100%"
      language={language === 'smali' ? 'smali' : getMonacoLanguage(language)}
      value={code}
      theme="vs-dark"
      options={{
        readOnly: true,
        minimap: { enabled: code.length > 5000 },
        scrollBeyondLastLine: false,
        fontSize: 12,
        fontFamily: 'var(--font-geist-mono), monospace',
        lineNumbers: 'on',
        wordWrap: 'on',
        automaticLayout: true,
        renderLineHighlight: 'line',
        folding: true,
        links: false,
      }}
      onMount={handleEditorMount}
    />
  );
}
