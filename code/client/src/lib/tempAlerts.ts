import { useEffect, useRef } from 'react';
import { useToast } from '../components/Toast';

export type TempLevel = 'unknown' | 'ok' | 'warning' | 'critical';

// Generic guidance (most consumer/data-center silicon throttles somewhere around
// 90-100°C) rather than a spec for this specific hardware.
export const TEMP_WARNING_C = 75;
export const TEMP_CRITICAL_C = 90;

const LEVEL_RANK: Record<TempLevel, number> = { unknown: 0, ok: 0, warning: 1, critical: 2 };

export function classifyTemp(celsius: number | null): TempLevel {
  if (celsius === null) return 'unknown';
  if (celsius >= TEMP_CRITICAL_C) return 'critical';
  if (celsius >= TEMP_WARNING_C) return 'warning';
  return 'ok';
}

// Fires a toast only when the severity level actually changes (escalation or
// recovery), not on every poll — otherwise a sensor sitting at 95°C would spam a
// toast every 5s for as long as it stays hot.
export function useTempAlert(label: string, celsius: number | null): void {
  const { showToast } = useToast();
  const prevLevel = useRef<TempLevel>('unknown');

  useEffect(() => {
    const level = classifyTemp(celsius);
    const prev = prevLevel.current;
    prevLevel.current = level;
    if (level === prev) return;

    if (LEVEL_RANK[level] > LEVEL_RANK[prev]) {
      if (level === 'critical') showToast(`${label} critical: ${celsius?.toFixed(0)}°C`, 'error');
      else if (level === 'warning') showToast(`${label} running hot: ${celsius?.toFixed(0)}°C`, 'warning');
    } else if (level === 'ok' && prev !== 'unknown') {
      showToast(`${label} back to normal (${celsius?.toFixed(0)}°C)`, 'success');
    }
  }, [celsius, label, showToast]);
}
