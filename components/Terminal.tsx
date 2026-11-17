import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface TerminalProps {
  logs: LogEntry[];
  isLoading: boolean;
}

export const Terminal: React.FC<TerminalProps> = ({ logs, isLoading }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 font-vt323 text-lg md:text-xl leading-relaxed tracking-wide text-amber-400 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] bg-black/80 relative">
      <div className="min-h-full flex flex-col justify-end">
        {logs.map((log) => (
          <div key={log.id} className={`mb-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ${
            log.type === 'danger' ? 'text-red-500 font-bold' :
            log.type === 'item' ? 'text-cyan-400' :
            log.type === 'system' ? 'text-gray-500 italic text-base' :
            'text-amber-400'
          }`}>
            <span className="opacity-50 text-xs mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
            {log.type === 'narrative' && <span className="mr-2 text-amber-600">{'>'}</span>}
            {log.text}
          </div>
        ))}
        
        {isLoading && (
          <div className="text-amber-400/60 animate-pulse mt-2">
             <span className="inline-block w-2 h-4 bg-amber-500/50 mr-1 animate-bounce"></span>
             PROCESSING REALITY...
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};