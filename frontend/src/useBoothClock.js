import { useCallback, useEffect, useRef, useState } from 'react';
import { createBoothClock, setBoothClockStage, advanceBoothClock, resolveBoothTimerStage } from './boothOperations.js';

export function useBoothClock({ mode, step, timing, active, busy }) {
  const current = useRef(null);
  const [clock, setClock] = useState(null);
  const latest = useRef({});
  latest.current = { active, busy };
  const stage = resolveBoothTimerStage(mode, step);
  const publish = useCallback(value => { current.current = value; setClock(value); }, []);
  useEffect(() => {
    if (stage === 'idle') { publish(null); return; }
    if (!active) return;
    const initial = current.current || createBoothClock(timing);
    publish(setBoothClockStage(initial, stage));
    // Admin edits are intentionally snapshotted only at the next session.
  }, [stage, active, publish]);
  useEffect(() => {
    let previous = performance.now();
    const resetElapsed = () => { previous = performance.now(); };
    document.addEventListener('visibilitychange', resetElapsed);
    const timer = window.setInterval(() => {
      const now = performance.now(), elapsed = now - previous;
      previous = now;
      if (!current.current) return;
      const paused = !latest.current.active || latest.current.busy || document.hidden;
      const next = advanceBoothClock(current.current, elapsed, paused);
      if (next !== current.current) publish(next);
    }, 250);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', resetElapsed); };
  }, [publish]);
  const acknowledge = useCallback(() => {
    if (current.current) publish({ ...current.current, expired: `handled-${current.current.expired}` });
  }, [publish]);
  const resume = useCallback(() => {
    if (current.current) publish({ ...current.current, expired: null,
      sessionRemaining: current.current.timing.sessionSeconds * 1000 || null });
  }, [publish]);
  return { clock, acknowledge, resume };
}
