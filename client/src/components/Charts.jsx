import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';

export const OS_LABEL = { windows: 'Windows 11', macos: 'macOS', linux: 'Linux / Ubuntu' };
export const OS_COLOR = { windows: '#2563eb', macos: '#64748b', linux: '#16a34a' };

export const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : Number(v).toFixed(d));

export function Card({ title, children, className = '' }) {
  return (
    <div className={`card p-4 ${className}`}>
      {title && <h3 className="mb-2 text-sm font-medium">{title}</h3>}
      {children}
    </div>
  );
}

export function StatCard({ label, value, hint }) {
  return (
    <div className="card p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

// data: [{ os, value, n }]; null values render as no bar (unavailable, not zero).
export function OSBar({ title, data, unit = '', digits = 1 }) {
  const rows = data.map((d) => ({ ...d, name: OS_LABEL[d.os] || d.os }));
  const empty = rows.every((r) => r.value === null || r.value === undefined);
  return (
    <Card title={title}>
      {empty ? <p className="py-10 text-center text-sm text-slate-400">No data yet</p> : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(v, _n, p) => [`${fmt(v, digits)}${unit} (n=${p.payload.n ?? '?'})`, title]} />
            <Bar dataKey="value">{rows.map((r) => <Cell key={r.os} fill={OS_COLOR[r.os] || '#2563eb'} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// Box plot from precomputed quartiles: summary = { min, q1, median, q3, max, n }.
export function BoxPlot({ items, height = 220 }) {
  const valid = items.filter((i) => i.summary.n > 0);
  if (!valid.length) return <p className="py-10 text-center text-sm text-slate-400">No data yet</p>;
  const lo = Math.min(...valid.map((i) => i.summary.min));
  const hi = Math.max(...valid.map((i) => i.summary.max));
  const span = hi - lo || 1;
  const W = 100 * items.length;
  const y = (v) => 10 + (1 - (v - lo) / span) * (height - 40);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Box plot">
      {items.map((it, i) => {
        const s = it.summary;
        const cx = i * 100 + 50;
        return (
          <g key={it.os}>
            {s.n > 0 ? (
              <>
                <line x1={cx} x2={cx} y1={y(s.max)} y2={y(s.min)} stroke="#64748b" />
                <rect x={cx - 22} width={44} y={y(s.q3)} height={Math.max(1, y(s.q1) - y(s.q3))} fill={OS_COLOR[it.os]} fillOpacity={0.35} stroke={OS_COLOR[it.os]} />
                <line x1={cx - 22} x2={cx + 22} y1={y(s.median)} y2={y(s.median)} stroke="#0f172a" strokeWidth={2} />
                <text x={cx} y={y(s.max) - 3} textAnchor="middle" fontSize="8" fill="#64748b">{fmt(s.max, 0)}</text>
                <text x={cx} y={y(s.min) + 10} textAnchor="middle" fontSize="8" fill="#64748b">{fmt(s.min, 0)}</text>
              </>
            ) : <text x={cx} y={height / 2} textAnchor="middle" fontSize="9" fill="#94a3b8">no data</text>}
            <text x={cx} y={height - 6} textAnchor="middle" fontSize="10">{OS_LABEL[it.os]} (n={s.n})</text>
          </g>
        );
      })}
    </svg>
  );
}
