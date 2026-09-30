// Tiny inline chart. `threshold` draws a dashed line so the value has context.
export function Sparkline({ values, max, threshold, tone = 'var(--color-accent)', width = 120, height = 28, label }) {
  if (!values?.length) return <div style={{ width, height }} className="bg-sunken rounded" aria-hidden />;
  const top = Math.max(max ?? 0, threshold ?? 0, ...values) || 1;
  const x = (i) => (i / Math.max(1, values.length - 1)) * width;
  const y = (v) => height - 2 - (v / top) * (height - 4);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      {threshold !== undefined && (
        <line x1="0" x2={width} y1={y(threshold)} y2={y(threshold)} stroke="var(--color-line)" strokeDasharray="3 3" />
      )}
      <polyline points={points} fill="none" stroke={tone} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
