
// Tiny dependency-free SVG charts that follow the active light/dark theme.

export interface Datum {
  label: string
  value: number
}

export function BarChart({ data, height = 180 }: { data: Datum[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const w = 100 / Math.max(1, data.length)

  return (
    <svg className="bds-chart" viewBox={`0 0 100 ${height / 2}`} preserveAspectRatio="none" role="img" aria-label="Bar chart">
      {data.map((d, i) => {
        const h = (d.value / max) * (height / 2 - 14)
        return (
          <g key={d.label}>
            <rect className="bds-bar" x={i * w + w * 0.2} y={height / 2 - 12 - h} width={w * 0.6} height={Math.max(h, d.value ? 0.6 : 0)}>
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
          </g>
        )
      })}
    </svg>
  )
}

export function BarLegend({ data }: { data: Datum[] }) {
  return (
    <ul className="bds-legend">
      {data.map((d) => (
        <li key={d.label}>
          <span>{d.label}</span>
          <strong>{d.value}</strong>
        </li>
      ))}
    </ul>
  )
}

export function LineChart({ data, height = 160 }: { data: Datum[]; height?: number }) {
  if (data.length < 2) return <p className="bds-muted">Not enough data for a trend yet.</p>
  const max = Math.max(1, ...data.map((d) => d.value))
  const H = height / 2
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * 100},${H - 6 - (d.value / max) * (H - 14)}`)

  return (
    <div>
      <svg className="bds-chart" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img" aria-label="Trend chart">
        <polyline className="bds-line" fill="none" vectorEffect="non-scaling-stroke" points={pts.join(' ')} />
      </svg>
      <div className="bds-axis">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  )
}
