// recharts(shadcn ChartContainer) 로 그리는 위젯: W2 추세 면 · W3 범주 가로 막대 · W4 100% 누적 막대
// 입력은 core.mjs 의 buildInputs 가 만든 값 — 이름·단위·계열은 전부 도메인 설정에서 온다.
import { useId } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceArea, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { navigate } from '@/lib/app-context'
import { ctx, fmt, niceTicks } from '@/lib/derive'
import { Empty } from './panel'

type W = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export function TrendChart({ w, height = 260 }: { w: W; height?: number }) {
  const gid = `fill-${useId().replace(/:/g, '')}`
  const ys = w.points.map((p: { y: number | null }) => p.y).filter((y: number | null): y is number => y !== null)
  if (!ys.length) return <Empty />
  const refs = w.target ? [w.target.value] : []
  // 눈금은 간격이 모두 같게(맨 위 눈금이 아래 눈금과 붙어 보이지 않게) — 범위를 눈금에 맞춰 넓힌다
  const top = Math.max(...ys, ...refs), bottom = Math.min(...ys, ...refs)
  const pad = Math.max((top - bottom) * 0.1, 1)
  const { lo, hi, ticks } = niceTicks(bottom - pad, top + pad, 5)
  const config = { y: { label: w.name, color: 'var(--chart-1)' } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <AreaChart data={w.points} margin={{ left: 0, right: 12, top: 12 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-y)" stopOpacity={0.45} />
              <stop offset="95%" stopColor="var(--color-y)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="x" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
          <YAxis domain={[lo, hi]} ticks={ticks} interval={0} width={44} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}${w.unit}`} />
          {w.anomalies.map((a: { from: number; to: number }) => (
            <ReferenceArea key={a.from} x1={w.points[a.from].x} x2={w.points[a.to].x} fill="var(--muted-foreground)" fillOpacity={0.12} />
          ))}
          {w.target ? <ReferenceLine y={w.target.value} stroke="var(--foreground)" strokeDasharray="5 4" strokeOpacity={0.6} label={{ value: w.target.label, position: 'insideTopRight', fontSize: 11, fill: 'var(--foreground)' }} /> : null}
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" formatter={(v) => `${w.name} ${v}${w.unit}`} />} />
          <Area isAnimationActive={false} dataKey="y" type="monotone" fill={`url(#${gid})`} stroke="var(--color-y)" strokeWidth={2} connectNulls />
        </AreaChart>
    </ChartContainer>
  )
}

export function BarList({ w }: { w: W }) {
  if (!w.rows.length) return <Empty />
  const s = [...w.rows].sort((a, b) => b.value - a.value)
  const list: { label: string; value: number; href?: string; other?: boolean }[] = s.slice(0, w.topN)
  const rest = s.slice(w.topN)
  if (rest.length) list.push({ label: `나머지 묶음 (${rest.length}개)`, value: rest.reduce((t, r) => t + r.value, 0), other: true })
  const config = { value: { label: ctx.d.entity.singular, color: 'var(--chart-1)' } } satisfies ChartConfig
  // 최댓값이 동점이면 어느 막대도 강조하지 않는다(첫 막대만 주황이면 순서가 우열처럼 읽힌다)
  const tied = list.filter((r) => !r.other && r.value === list[0].value).length > 1
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: list.length * 40 + 16 }}>
      <BarChart data={list} layout="vertical" margin={{ left: 0, right: 40, top: 0, bottom: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={190} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel formatter={(v, _n, item) => `${(item.payload as { label: string }).label}: ${v}${w.unit}`} />} />
        <Bar isAnimationActive={false} dataKey="value" radius={4} onClick={(d) => { const h = (d as unknown as { href?: string }).href; if (h) navigate(h) }} style={{ cursor: 'pointer' }}>
          {list.map((r, i) => <Cell key={r.label} fill={r.other ? 'oklch(0.87 0 0)' : i === 0 && !tied ? 'var(--chart-1)' : 'var(--chart-2)'} />)}
          <LabelList dataKey="value" position="right" className="fill-foreground" fontSize={12} formatter={(v: unknown) => `${fmt(Number(v))}${w.unit}`} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

// 부분 색: urgent 어조 값은 강조색, 나머지는 회색 단계
const GRAYS = ['var(--chart-2)', 'oklch(0.87 0 0)', 'oklch(0.93 0 0)', 'oklch(0.78 0 0)']
export function StackedBar({ w }: { w: W }) {
  if (!w.rows.length) return <Empty />
  let gi = 0
  const names: string[] = w.names
  const colors = names.map((n) => (n === w.highlight ? 'var(--chart-1)' : GRAYS[gi++ % GRAYS.length]))
  const config: ChartConfig = Object.fromEntries(names.map((n, i) => [`p${i}`, { label: n, color: colors[i] }]))
  const data = w.rows.map((r: { label: string; parts: { name: string; value: number }[] }) => ({ label: r.label, ...Object.fromEntries(r.parts.map((p, i) => [`p${i}`, p.value])) }))
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: w.rows.length * 44 + 48 }}>
      <BarChart data={data} layout="vertical" stackOffset="expand" margin={{ left: 0, right: 12, top: 0, bottom: 0 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" width={88} tickLine={false} axisLine={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(v, name) => `${name} ${v}${w.unit}`} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {names.map((n, i) => <Bar key={n} isAnimationActive={false} dataKey={`p${i}`} stackId="a" fill={`var(--color-p${i})`} radius={i === names.length - 1 ? [0, 4, 4, 0] : 0} />)}
      </BarChart>
    </ChartContainer>
  )
}

// W14 관리도 — 점(회색) + 기준선(점선) + 상·하한 띠(옅은 회색 면). 한계 밖 점은 주황 큰 점이고 누르면 그날 목록으로 간다.
export function ControlChart({ w, height = 260 }: { w: W | null; height?: number }) {
  const ys: number[] = (w?.points ?? []).map((p: { y: number | null }) => p.y).filter((y: number | null): y is number => y !== null)
  if (!w || !ys.length || w.center === null) return <Empty>관리도를 그릴 데이터가 없습니다.</Empty>
  const pad = Math.max((Math.max(...ys, w.ucl) - Math.min(...ys, w.lcl)) * 0.08, 1)
  const { lo, hi, ticks } = niceTicks(Math.min(...ys, w.lcl) - pad, Math.max(...ys, w.ucl) + pad, 5)
  const config = { y: { label: w.name, color: 'var(--chart-2)' } } satisfies ChartConfig
  const lab = { fontSize: 11, fill: 'var(--foreground)' }
  return (
    <>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <LineChart data={w.points} margin={{ left: 0, right: 12, top: 12 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="x" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
          <YAxis domain={[lo, hi]} ticks={ticks} interval={0} width={44} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}${w.unit}`} />
          <ReferenceArea y1={w.lcl} y2={w.ucl} fill="var(--muted-foreground)" fillOpacity={0.12} />
          <ReferenceLine y={w.ucl} stroke="var(--muted-foreground)" strokeOpacity={0.5} label={{ value: `상한 ${fmt(w.ucl, 1)}`, position: 'insideTopLeft', ...lab }} />
          <ReferenceLine y={w.lcl} stroke="var(--muted-foreground)" strokeOpacity={0.5} label={{ value: `하한 ${fmt(w.lcl, 1)}`, position: 'insideBottomLeft', ...lab }} />
          <ReferenceLine y={w.center} stroke="var(--foreground)" strokeDasharray="5 4" strokeOpacity={0.6} label={{ value: `기준선 ${fmt(w.center, 1)}${w.unit}`, position: 'insideTopRight', ...lab }} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" formatter={(v) => `${w.name} ${v}${w.unit}`} />} />
          <Line
            isAnimationActive={false} dataKey="y" type="linear" stroke="var(--chart-2)" strokeWidth={2} connectNulls activeDot={false}
            dot={(p: { cx?: number; cy?: number; index?: number; payload?: { out: boolean; href?: string; date: string } }) => {
              const { cx, cy, index = 0, payload } = p
              if (cx === undefined || cy === undefined || !payload) return <g key={index} />
              return payload.out ? (
                <circle key={index} cx={cx} cy={cy} r={6} fill="var(--chart-1)" data-out={payload.date} style={{ cursor: 'pointer' }} onClick={() => payload.href && navigate(payload.href)}><title>{`${payload.date} · 한계 밖 — 누르면 그날 목록`}</title></circle>
              ) : <circle key={index} cx={cx} cy={cy} r={3.5} fill="var(--chart-2)" />
            }}
          />
        </LineChart>
      </ChartContainer>
      <p className="mt-2 text-xs text-muted-foreground">기준 {w.basis} · 한계 밖 {w.outCount}곳</p>
    </>
  )
}
