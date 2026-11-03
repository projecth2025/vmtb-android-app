import { useCallback, useEffect, useRef, useState } from 'react';
import { CaseRunState, getCaseRunState } from './api/pipeline';

const ACTIVE_POLL_MS = 4000;
const IDLE_POLL_MS = 30000;

/**
 * Live processing state of a case (its latest pipeline run, summary status and
 * generations), for the status strip and for enabling/disabling actions.
 *
 * Polls quickly while a run is pending or running and slowly otherwise, and
 * fires `onChange` whenever the state key changes so the caller can reload the
 * case row. Reading it also expires stuck runs server-side, so a run that died
 * shows up as `failed` instead of staying `processing` forever.
 *
 * (Web parity with `useCaseRunState`; the browser's visibilitychange pause is
 * unnecessary on mobile — the screen unmounts when navigating away.)
 */
export function useCaseRunState(caseId: string | undefined, onChange?: () => void) {
  const [state, setState] = useState<CaseRunState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastKeyRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!caseId) return null;
    try {
      const next = await getCaseRunState(caseId);
      setState(next);
      setError(null);
      const key = `${next.content_generation}:${next.summary_generation}:${next.summary_status}:${next.run?.status}:${next.run?.id}`;
      if (key !== lastKeyRef.current) {
        const first = lastKeyRef.current === null;
        lastKeyRef.current = key;
        // Don't reload on the very first read — the caller just loaded the case.
        if (!first) onChangeRef.current?.();
      }
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t check this case’s status.');
      return null;
    }
  }, [caseId]);

  const active = state?.run?.status === 'pending' || state?.run?.status === 'running';

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (cancelled) return;
      await refresh();
      if (!cancelled) timer = setTimeout(tick, active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [caseId, active, refresh]);

  return { state, error, refresh, active };
}
