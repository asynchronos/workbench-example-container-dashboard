interface LiveStatChartProps {
  label: string;
  values: number[];
  formatValue: (v: number) => string;
  color?: string;
  maxPoints?: number;
}

const WIDTH = 240;
const HEIGHT = 48;
// Keeps the polyline (and its 2px stroke) from being clipped by the viewBox edge
// when a metric is perfectly flat (e.g. an idle container reporting 0% CPU).
const PAD = 4;

export function LiveStatChart({ label, values, formatValue, color = '#3b82f6' }: LiveStatChartProps) {
  const latest = values.at(-1);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const drawableHeight = HEIGHT - PAD * 2;

  const points = values
    .map((v, i) => {
      const x = values.length > 1 ? (i / (values.length - 1)) * WIDTH : 0;
      const y = HEIGHT - PAD - ((v - min) / range) * drawableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {latest === undefined ? 'Waiting for metrics' : formatValue(latest)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        preserveAspectRatio="none"
        className="rounded bg-slate-50 dark:bg-slate-900"
      >
        {values.length > 1 && (
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  );
}
