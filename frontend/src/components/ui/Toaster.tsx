import { useState, useEffect, useRef } from 'react';

type Toast = { id: number; msg: string };

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    function handler(e: Event) {
      const msg = (e as CustomEvent<string>).detail;
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, msg }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
    }
    window.addEventListener('app-error', handler);
    return () => window.removeEventListener('app-error', handler);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-8 left-1/2 z-[999] -translate-x-1/2 flex flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 rounded-xl border border-accent3/40 bg-surface2 px-5 py-3 font-mono text-[13px] text-accent3 shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
        >
          <span>⚠</span>
          <span>{t.msg}</span>
          <button
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className="ml-2 cursor-pointer border-none bg-transparent font-mono text-xs text-muted hover:text-accent3"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
