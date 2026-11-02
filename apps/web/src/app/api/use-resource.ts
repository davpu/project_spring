import { useCallback, useEffect, useRef, useState } from 'react';
import { startBusy } from '../../lib/busy';

export type Resource<T> = {
  data: T | undefined;
  error: unknown;
  /** True while the first load, a `reload()` or a key change is in flight. */
  loading: boolean;
  reload: () => void;
};

/**
 * Loads something when `key` changes and optionally again every `refreshMs`.
 * The previous data stays on screen while a reload runs, so switching a chart
 * range does not flash an empty page, and a background refresh neither touches
 * `loading` nor shows the hourglass cursor. `load` may close over anything; only a change of `key`
 * triggers a new request.
 */
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  key: string,
  refreshMs?: number,
): Resource<T> {
  const loadRef = useRef(load);
  loadRef.current = load;

  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const backgroundRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const background = backgroundRef.current;
    backgroundRef.current = false;
    if (!background) setLoading(true);
    const endBusy = background ? () => undefined : startBusy();
    loadRef
      .current(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setData(next);
        setError(undefined);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err);
      })
      .finally(() => {
        endBusy();
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // `key` stands in for whatever `load` depends on.
  }, [key, tick]);

  useEffect(() => {
    if (!refreshMs) return;
    const id = setInterval(() => {
      backgroundRef.current = true;
      setTick((t) => t + 1);
    }, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, error, loading, reload };
}
