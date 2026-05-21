'use client';

import { useEffect } from 'react';
import { REFRESH_INTERVAL_MS } from '../constants/config';

// Calls `refresh` every REFRESH_INTERVAL_MS. Caller is responsible for
// ensuring `refresh` is stable (wrap in useCallback) — otherwise the
// interval restarts on every render.
export function usePollRefresh(refresh: () => Promise<void> | void): void {
  useEffect(() => {
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);
}
