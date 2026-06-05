'use client';

import { useEffect, useState } from 'react';
import { TICK_MS } from '../constants/config';

// SSR-safe wall-clock tick. Returns `null` on the server and during the first
// client render, then ticks every TICK_MS. Time-dependent text MUST treat
// `null` as "not ready yet" so server-rendered markup matches the initial
// client render (otherwise React #418 fires on hydration).
export function useWallClock(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}
