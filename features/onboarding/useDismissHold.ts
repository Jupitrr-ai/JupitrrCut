import { useEffect, useState } from 'react';

/**
 * Counts down the seconds a paywall must be read before its dismiss control arms.
 *
 * Ticks only while mounted, which is the same rule the rating slide's hold follows: the funnel
 * renders exactly one step at a time, so a step that is not on screen is not mounted and
 * cannot burn its hold in the background. Each step therefore gets its own full hold.
 */
export function useDismissHold(seconds: number): number {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  return remaining;
}
