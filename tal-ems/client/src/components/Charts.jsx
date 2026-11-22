import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend } from 'recharts';
import { money, num, monthLabel } from '../lib/format';

export const C = { brand: '#477597', brandLight: '#9DB9CE', dark: '#243F55', amber: '#C9934A', green: '#2E8B62', red: '#C2413B', slate: '#8A99A8', teal: '#2B8A8F' };
export const SERIES = ['#477597', '#243F55', '#9DB9CE', '#C9934A', '#2B8A8F', '#8A99A8', '#6E96B4', '#B5C4D1'];
const axis = { fontSize: 11, fill: '#6B7785', fontFamily: 'IBM Plex Sans Arabic' };
const compact = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)}K` : v);

function Tip({ active, payload, label, fmt = (v) => v, labelFmt = (l) => l }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tip">
      <div className="bold" style={{ marginBottom: 4 }}>{labelFmt(label)}</div>
      {payload.map((p) => <div key={p.dataKey} className="row" style={{ gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: p.color || p.fill, display: 'inline-block' }} />{p.name}: <b className="num">{fmt(p.value)}</b></div>)}
    </div>
  );
}

export function IncomeExpenseChart({ data }) {
  return (
    <div className="chart-box" style={{ height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={3}>
          <CartesianGrid vertical={false} stroke="#EDF1F5" />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={compact} tick={axis} axisLine={false} tickLine={false} width={48} />
          <Tooltip content={<Tip fmt={(v) => money(v)} labelFmt={monthLabel} />} cursor={{ fill: 'rgba(71,117,151,.06)' }} />
          <Bar dataKey="income" name="الإيرادات" fill={C.brand} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="expense" name="المصروفات" fill={C.amber} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProgressTrendChart({ data, height = 260 }) {
  return (
    <div className="chart-box" style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.brand} stopOpacity={0.28} /><stop offset="1" stopColor={C.brand} stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="#EDF1F5" />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={axis} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<Tip fmt={(v) => `${num(v, 1)}%`} labelFmt={monthLabel} />} />
          <Area type="monotone" dataKey="actual" name="الإنجاز الفعلي" stroke={C.brand} strokeWidth={2.2} fill="url(#gA)" dot={{ r: 2.5 }} />
          <Area type="monotone" dataKey="planned" name="المخطط" stroke={C.dark} strokeWidth={1.6} strokeDasharray="5 4" fill="none" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProjectCompareChart({ data, keys, height }) {
  const h = height || Math.max(200, data.length * 40 + 30);
  return (
    <div className="chart-box" style={{ height: h }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }} barGap={2}>
          <CartesianGrid horizontal={false} stroke="#EDF1F5" />
          <XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={keys[0].money ? compact : (v) => `${v}%`} domain={keys[0].money ? [0, 'auto'] : [0, 100]} />
          <YAxis type="category" dataKey="code" tick={{ ...axis, fontSize: 10.5 }} axisLine={false} tickLine={false} width={78} />
          <Tooltip content={<Tip fmt={(v) => (keys[0].money ? money(v) : `${num(v, 1)}%`)} labelFmt={(l) => (data.find((d) => d.code === l) || {}).name || l} />} cursor={{ fill: 'rgba(71,117,151,.06)' }} />
          {keys.map((k) => <Bar key={k.key} dataKey={k.key} name={k.label} fill={k.color} radius={[0, 4, 4, 0]} maxBarSize={12} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Donut({ data, height = 230, fmt = (v) => num(v), center }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="row" style={{ gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <div className="chart-box" style={{ height, width: height, position: 'relative', flexShrink: 0 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={1.5} stroke="none">
              {data.map((d, i) => <Cell key={d.name} fill={SERIES[i % SERIES.length]} />)}
            </Pie>
            <Tooltip content={<Tip fmt={fmt} />} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
          <div><div style={{ fontSize: String(center ?? num(total)).length > 6 ? 14 : 22, fontWeight: 700, color: 'var(--tal-900)', maxWidth: height * 0.55 }} className="num">{center ?? num(total)}</div><div className="tiny muted">الإجمالي</div></div>
        </div>
      </div>
      <div className="stack" style={{ gap: 7, flex: 1, minWidth: 160 }}>
        {data.map((d, i) => (
          <div key={d.name} className="row between small">
            <span className="row" style={{ gap: 7 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: SERIES[i % SERIES.length], display: 'inline-block' }} />{d.name}</span>
            <b className="num">{fmt(d.value)}</b>
          </div>))}
      </div>
    </div>
  );
}

export { Legend, LineChart };
