import { useEffect, useRef, useState } from 'react';

export default function WeeklyMenuShareButton({ label, disabled, onCopy }: {
  label: string;
  disabled?: boolean;
  onCopy: () => Promise<void>;
}) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  const copying = useRef(false);
  const mounted = useRef(true);
  const resetTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; window.clearTimeout(resetTimer.current); };
  }, []);

  const copy = async () => {
    if (disabled || copying.current) return;
    copying.current = true;
    window.clearTimeout(resetTimer.current);
    setStatus('copying');
    try {
      await onCopy();
      if (mounted.current) {
        setStatus('copied');
        resetTimer.current = window.setTimeout(() => setStatus('idle'), 2000);
      }
    } catch {
      if (mounted.current) setStatus('failed');
    } finally {
      copying.current = false;
    }
  };

  return <button type="button" disabled={disabled || status === 'copying'} aria-busy={status === 'copying'} onClick={() => void copy()} className="rounded-full border px-3 py-1 text-xs font-bold disabled:opacity-40">
    <span aria-live="polite">{status === 'copied' ? '✓ Copied!' : status === 'failed' ? 'Copy failed' : status === 'copying' ? 'Copying…' : label}</span>
  </button>;
}
