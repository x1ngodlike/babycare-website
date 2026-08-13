import { useEffect, useRef, useState } from 'react';

type PullPhase = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'done';

export function usePullToRefresh(enabled: boolean, onRefresh: () => Promise<void>) {
  const [distance, setDistance] = useState(0);
  const [phase, setPhase] = useState<PullPhase>('idle');
  const distanceRef = useRef(0);
  const busyRef = useRef(false);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) { busyRef.current = false; distanceRef.current = 0; setDistance(0); setPhase('idle'); return; }
    let startY: number | null = null;
    let doneTimer: number | null = null;
    const updateDistance = (next: number) => { distanceRef.current = next; setDistance(next); setPhase(next >= 64 ? 'ready' : next > 4 ? 'pulling' : 'idle'); };
    const touchStart = (event: TouchEvent) => {
      if (busyRef.current || window.scrollY > 0 || event.touches.length !== 1) return;
      startY = event.touches[0]?.clientY ?? null;
    };
    const touchMove = (event: TouchEvent) => {
      if (startY === null || busyRef.current) return;
      const currentY = event.touches[0]?.clientY ?? startY;
      const next = Math.min(92, Math.max(0, (currentY - startY) * .52));
      if (next > 4) event.preventDefault();
      updateDistance(next);
    };
    const touchEnd = async () => {
      startY = null;
      if (busyRef.current) return;
      if (distanceRef.current < 64) { updateDistance(0); return; }
      busyRef.current = true; setPhase('refreshing'); setDistance(52);
      try { await refreshRef.current(); setPhase('done'); }
      finally {
        doneTimer = window.setTimeout(() => { distanceRef.current = 0; setDistance(0); setPhase('idle'); busyRef.current = false; }, 700);
      }
    };
    window.addEventListener('touchstart', touchStart, { passive: true });
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', touchEnd, { passive: true });
    window.addEventListener('touchcancel', touchEnd, { passive: true });
    return () => {
      if (doneTimer) clearTimeout(doneTimer);
      window.removeEventListener('touchstart', touchStart);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', touchEnd);
      window.removeEventListener('touchcancel', touchEnd);
    };
  }, [enabled]);
  return { distance, phase };
}
