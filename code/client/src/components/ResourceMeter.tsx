import { TEMP_WARNING_C, TEMP_CRITICAL_C } from '../lib/tempAlerts';

interface ResourceMeterProps {
  label: string;
  value: number | null;
  maximum?: number;
  display: string;
  hint: string;
  temperature?: boolean;
}

export function ResourceMeter({ label, value, maximum = 100, display, hint, temperature }: ResourceMeterProps) {
  const available = value !== null && Number.isFinite(value) && maximum > 0;
  const ratio = available ? Math.min(1, Math.max(0, value / maximum)) : 0;
  const tone = !available ? '#64748b' : temperature && value >= TEMP_CRITICAL_C ? '#f87171'
    : temperature && value >= TEMP_WARNING_C ? '#fbbf24' : '#5eead4';
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <svg viewBox="0 0 100 100" className="h-20 w-20 shrink-0" role="img" aria-label={`${label}: ${display}. ${hint}`}>
        <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200 dark:text-slate-700" />
        <circle cx="50" cy="50" r="40" fill="none" stroke={tone} strokeWidth="8" pathLength="100"
          strokeDasharray={`${ratio * 100} 100`} strokeLinecap="round" transform="rotate(-90 50 50)" />
        <text x="50" y="55" textAnchor="middle" fill="currentColor" fontSize="15" fontWeight="600">
          {available ? temperature ? `${value.toFixed(0)}°` : `${(ratio * 100).toFixed(0)}%` : '—'}
        </text>
      </svg>
      <div className="min-w-0">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</h2>
        <p className="mt-1 break-words text-sm font-semibold">{display}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      </div>
    </div>
  );
}
