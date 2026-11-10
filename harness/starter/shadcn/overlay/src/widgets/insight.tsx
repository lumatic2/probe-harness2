// insight.tsx — 보기 부품 V1~V7. 「숫자를 보고 그 자리에서 근거를 확인한다」를 돕는 묶음. 전부 props 로 받은 것만 그린다(도메인 설정을 읽지 않는다).
// V1 지표 전환 추세(지표를 누르면 차트가 그 지표로) · V2 카드 안 탭 · V3 크게 보기 · V4 차트↔표 전환 · V5 차트 위 사건 표시(V1 의 events) · V6 갱신 시각 + 새로고침 · V7 임계값 지표.
// 차트는 번들 Recharts, 색은 토큰만(강조 하나 --chart-1). 차트 자체의 움직임은 끈다(isAnimationActive=false). 지표를 바꾸면 차트가 150ms 로 나타나고(sk-fade), 임계값 배지는 색이 150ms 로 바뀐다.
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Maximize2Icon, RefreshCwIcon } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const num = (v: number, decimals = 0) => v.toLocaleString('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

// ───────── V1 지표 전환 추세 (+ V5 사건 표시) — 위에 지표 줄, 아래에 차트 하나. 지표를 누르면 차트가 그 지표의 추세로 바뀐다.
// events = 차트 위에 세로선으로 찍을 사건(정비·설정 변경·데이터셋 교체). x 는 points 의 x 값과 같아야 한다.
export type TrendPoint = { x: string; y: number | null }
export type TrendMetric = { key: string; label: string; value: number; unit: string; decimals?: number; delta?: string; points: TrendPoint[]; target?: { value: number; label: string } }
export type ChartEvent = { x: string; label: string }
export function MetricTrend({ metrics, events = [], height = 240, value, onChange }: { metrics: TrendMetric[]; events?: ChartEvent[]; height?: number; value?: string; onChange?: (key: string) => void }) {
  const [inner, setInner] = useState(metrics[0]?.key ?? '')
  const gid = `mt-${useId().replace(/:/g, '')}`
  const key = value ?? inner
  const m = metrics.find((x) => x.key === key) ?? metrics[0]
  if (!m) return null
  const pick = (k: string) => { setInner(k); onChange?.(k) }
  const ys = m.points.map((p) => p.y).filter((y): y is number => y !== null)
  const all = [...ys, ...(m.target ? [m.target.value] : [])]
  const lo = Math.min(...all), hi = Math.max(...all), pad = Math.max((hi - lo) * 0.15, 1)
  const config = { y: { label: m.label, color: 'var(--chart-1)' } } satisfies ChartConfig
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="지표 고르기" className="flex flex-wrap divide-x rounded-lg border">
        {metrics.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={x.key === m.key} onClick={() => pick(x.key)}
            className={`flex min-w-32 flex-1 flex-col gap-0.5 px-4 py-3 text-left outline-none first:rounded-l-lg last:rounded-r-lg focus-visible:ring-2 focus-visible:ring-ring ${x.key === m.key ? 'bg-muted' : 'hover:bg-muted/50'}`}>
            <span className={`text-xs ${x.key === m.key ? 'font-semibold' : 'text-muted-foreground'}`}>{x.label}</span>
            <span className="text-xl font-semibold tabular-nums">{num(x.value, x.decimals)}<span className="ml-0.5 text-sm font-normal text-muted-foreground">{x.unit}</span></span>
            {x.delta ? <span className="text-xs tabular-nums text-muted-foreground">{x.delta}</span> : null}
          </button>
        ))}
      </div>
      {ys.length ? (
        <ChartContainer key={m.key} config={config} className="sk-fade aspect-auto w-full" style={{ height }}>
          <AreaChart data={m.points} margin={{ left: 0, right: 12, top: 16 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-y)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--color-y)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="x" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]} width={48} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}${m.unit}`} />
            {m.target ? <ReferenceLine y={m.target.value} stroke="var(--foreground)" strokeDasharray="5 4" strokeOpacity={0.6} label={{ value: m.target.label, position: 'insideTopRight', fontSize: 11, fill: 'var(--foreground)' }} /> : null}
            {events.map((e) => <ReferenceLine key={`${e.x}-${e.label}`} x={e.x} stroke="var(--muted-foreground)" strokeDasharray="2 3" label={{ value: e.label, position: 'top', fontSize: 11, fill: 'var(--muted-foreground)' }} />)}
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" formatter={(v) => `${m.label} ${v}${m.unit}`} />} />
            <Area isAnimationActive={false} dataKey="y" type="monotone" fill={`url(#${gid})`} stroke="var(--color-y)" strokeWidth={2} connectNulls />
          </AreaChart>
        </ChartContainer>
      ) : <p className="py-8 text-center text-sm text-muted-foreground">이 지표의 추세 데이터가 없습니다.</p>}
      {events.length ? <p className="text-xs text-muted-foreground">세로 점선 = 사건: {events.map((e) => `${e.x} ${e.label}`).join(' · ')}</p> : null}
    </div>
  )
}

// ───────── V2 카드 안 탭 — 같은 대상을 다른 기준으로 나눈 목록 여러 개(설비별·공정별·코드별)를 카드 하나에. 탭 이름이 곧 「무엇으로 나눴는가」.
export type CardTab = { key: string; label: string; content: ReactNode }
export function TabbedCard({ title, sub, tabs, action }: { title: string; sub?: string; tabs: CardTab[]; action?: ReactNode }) {
  return (
    <Card className="@container/card shadow-xs">
      <Tabs defaultValue={tabs[0]?.key} className="gap-0">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {sub ? <CardDescription>{sub}</CardDescription> : null}
          <CardAction className="flex items-center gap-2">
            <TabsList>{tabs.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}</TabsList>
            {action}
          </CardAction>
        </CardHeader>
        <CardContent className="pt-4">{tabs.map((t) => <TabsContent key={t.key} value={t.key}>{t.content}</TabsContent>)}</CardContent>
      </Tabs>
    </Card>
  )
}

// ───────── V3 크게 보기 — 카드에 다 못 담은 표·차트를 화면 가득 펼친다. 카드 머리의 action 자리에 둔다. children = 펼쳤을 때 보일 내용(카드 안과 같은 부품에 더 많은 행).
export function ExpandButton({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="ghost" size="icon" className="size-7" aria-label={`${title} 크게 보기`}><Maximize2Icon className="size-4" /></Button></DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-4rem)] w-[calc(100vw-4rem)] max-w-5xl flex-col sm:max-w-5xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description ?? '카드에 보이던 내용의 전체입니다.'}</DialogDescription></DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </DialogContent>
    </Dialog>
  )
}

// ───────── V4 차트 ↔ 표 전환 — 차트가 그린 숫자를 그 자리에서 표로 확인한다. rows 는 차트에 넘긴 것과 같은 데이터여야 한다(다르면 근거가 아니다).
export type DataColumn = { key: string; label: string; numeric?: boolean; unit?: string }
export function ChartOrTable({ chart, columns, rows, caption }: { chart: ReactNode; columns: DataColumn[]; rows: Record<string, string | number | null>[]; caption?: string }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as 'chart' | 'table')} aria-label="보기 방식" className="self-end">
        <ToggleGroupItem value="chart">차트</ToggleGroupItem>
        <ToggleGroupItem value="table">데이터 {rows.length}행</ToggleGroupItem>
      </ToggleGroup>
      {view === 'chart' ? chart : (
        <div className="flex flex-col gap-2">
        <div className="max-h-80 overflow-auto rounded-md border">
          <Table>
            <TableHeader><TableRow>{columns.map((c) => <TableHead key={c.key} className={c.numeric ? 'text-right' : ''}>{c.label}{c.unit ? ` (${c.unit})` : ''}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>{columns.map((c) => <TableCell key={c.key} className={c.numeric ? 'text-right tabular-nums' : ''}>{r[c.key] === null || r[c.key] === undefined ? '—' : typeof r[c.key] === 'number' ? num(r[c.key] as number, Number.isInteger(r[c.key]) ? 0 : 1) : r[c.key]}</TableCell>)}</TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
        </div>
      )}
    </div>
  )
}

// ───────── V6 갱신 시각 + 새로고침 — 지금 보는 데이터가 언제 것인지와 다시 받는 버튼. intervalSec 를 주면 그 간격으로 onRefresh 를 부른다(화면이 가려져 있으면 쉰다).
export function RefreshBar({ updatedAt, onRefresh, intervalSec, label = '마지막 갱신' }: { updatedAt: string; onRefresh: () => Promise<void> | void; intervalSec?: number; label?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async () => {
    if (busy) return
    setBusy(true); setError('')
    try { await onRefresh() } catch (e) { setError(e instanceof Error ? e.message : '새로 받지 못했습니다.') } finally { setBusy(false) }
  }
  useEffect(() => {
    if (!intervalSec) return
    const t = setInterval(() => { if (!document.hidden) void run() }, intervalSec * 1000)
    return () => clearInterval(t)
  }, [intervalSec]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="tabular-nums">{label} {updatedAt}</span>
      {intervalSec ? <span>· {intervalSec}초마다 자동</span> : null}
      <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={run} disabled={busy}><RefreshCwIcon className="size-3.5" />{busy ? '받는 중…' : '새로고침'}</Button>
      {error ? <span role="alert" className="text-destructive">{error} 이전 데이터를 그대로 보여 줍니다.</span> : null}
    </div>
  )
}

// ───────── V7 임계값 지표 — 값이 기준을 넘으면 상태(정상·주의·긴급)가 글자와 배지로 바뀐다. 기준은 props 로 받는다(설정 화면의 기준값과 같은 숫자를 넘긴다).
// direction: 'high' = 클수록 나쁨(불량 수·대기 시간) · 'low' = 작을수록 나쁨(가동률·수율).
export type Thresholds = { warn: number; urgent: number; direction: 'high' | 'low' }
export type ThresholdState = 'ok' | 'warn' | 'urgent'
export function thresholdState(value: number, t: Thresholds): ThresholdState {
  const over = (limit: number) => (t.direction === 'high' ? value >= limit : value <= limit)
  return over(t.urgent) ? 'urgent' : over(t.warn) ? 'warn' : 'ok'
}
const STATE_LABEL: Record<ThresholdState, string> = { ok: '정상', warn: '주의', urgent: '긴급' }
export function ThresholdStat({ label, value, unit, decimals = 0, thresholds, note }: { label: string; value: number; unit: string; decimals?: number; thresholds: Thresholds; note?: string }) {
  const state = thresholdState(value, thresholds)
  const sign = thresholds.direction === 'high' ? '이상' : '이하'
  return (
    <Card className="shadow-xs" data-state={state}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{num(value, decimals)}<span className="ml-0.5 text-base font-medium text-muted-foreground">{unit}</span></CardTitle>
        <CardAction><Badge variant={state === 'warn' ? 'secondary' : 'outline'} className={`transition-colors duration-150 ${state === 'urgent' ? 'sk-urgent' : state === 'ok' ? 'text-muted-foreground' : ''}`}>{STATE_LABEL[state]}</Badge></CardAction>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        기준: 주의 {num(thresholds.warn, decimals)}{unit} {sign} · 긴급 {num(thresholds.urgent, decimals)}{unit} {sign}{note ? ` · ${note}` : ''}
      </CardContent>
    </Card>
  )
}
