import { useEffect, useRef, useState } from 'react';
import { subscribeToLogs } from '../api/client';

interface LogViewerProps {
  containerId: string;
}

const MAX_LINES = 1000;

export function LogViewer({ containerId }: LogViewerProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [follow, setFollow] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLines([]);
    const unsubscribe = subscribeToLogs(containerId, 200, (line) => {
      setLines((prev) => {
        const next = [...prev, line];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    });
    return unsubscribe;
  }, [containerId]);

  useEffect(() => {
    if (follow) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [lines, follow]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
        <span className="text-xs text-slate-500 dark:text-slate-400">{lines.length} lines</span>
        <button
          onClick={() => setFollow((f) => !f)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {follow ? 'Pause' : 'Resume follow'}
        </button>
      </div>
      <div className="mt-2 flex-1 overflow-y-auto rounded bg-slate-950 p-3 font-mono text-xs text-slate-100">
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            {line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
