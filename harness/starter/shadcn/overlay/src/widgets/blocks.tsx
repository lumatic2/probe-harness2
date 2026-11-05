// div 로 그리는 위젯: W5·W16 히트맵 · W6 목표 진척 · W7 퍼널 · W9 알림 목록 · W10 상태 보드 · W11 타임라인 · W12 최근 활동 · W13 배치도 · W15 분포(손 SVG)
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { fmt, mmdd } from '@/lib/derive'

type W = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
import { Empty, ToneBadge } from './panel'

// ---------- W5 히트맵 · W16 행렬 히트맵: 주황 단색 농도 + 칸 안 숫자 (w.hrefs 가 있으면 칸이 목록으로 가는 링크) ----------
export function Heatmap({ w }: { w: W }) {
  const max = Math.max(0, ...w.values.flat())
  if (!max) return <Empty />
  const lw = Math.min(10, Math.max(2, Math.max(...w.rowLabels.map((l: string) => l.length)) * 0.95 + 0.5)) // 행 이름 칸 너비(rem)
  const dec = w.decimals ?? 0
  return (
    <div>
      <div className="grid gap-1 text-xs" style={{ gridTemplateColumns: `${lw}rem repeat(${w.colLabels.length}, minmax(0, 1fr))` }}>
        <div />
        {w.colLabels.map((c) => <div key={c} className="pb-1 text-center text-muted-foreground">{c}</div>)}
        {w.rowLabels.map((r, i) => (
          <div key={r} className="contents">
            <div className="flex items-center text-muted-foreground">{r}</div>
            {w.values[i].map((v, j) => {
              const pct = Math.round(((v ?? 0) / max) * 100)
              const cell = (
                <div title={`${r} · ${w.colLabels[j]}: ${v === null ? '–' : fmt(v, dec)}${w.unit}`}
                  className="flex h-8 items-center justify-center rounded-sm tabular-nums"
                  style={{ background: `color-mix(in oklab, var(--sk-orange) ${Math.max(pct, 4)}%, var(--card))`, ...(pct >= 80 ? { background: '#c24e00', color: '#ffffff' } : { color: 'var(--foreground)' }) }}>
                  {v === null ? '–' : fmt(v, dec)}
                </div>
              )
              return w.hrefs?.[i]?.[j] ? <a key={j} href={w.hrefs[i][j]} className="block">{cell}</a> : <div key={j} className="contents">{cell}</div>
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>적음</span>
        {[10, 30, 50, 70, 100].map((p) => <span key={p} className="inline-block size-3.5 rounded-sm" style={{ background: p === 100 ? '#c24e00' : `color-mix(in oklab, var(--sk-orange) ${p}%, var(--card))` }} />)}
        <span>많음 (최대 {fmt(max, dec)}{w.unit})</span>
      </div>
    </div>
  )
}

// ---------- W6 목표 대비 진척 ----------
export function ProgressList({ w }: { w: W }) {
  return (
    <div className="flex flex-col gap-5">
      {w.rows.map((r) => {
        if (r.value === null || !Number.isFinite(r.value)) return <div key={r.label} className="text-sm text-muted-foreground">{r.label}: 데이터 없음</div>
        const dec = r.decimals ?? 0
        const ok = r.lowerIsBetter ? r.value <= r.target : r.value >= r.target
        const max = Math.max(r.value, r.target) * 1.15 || 1
        const gap = Math.abs(r.target - r.value)
        const du = r.unit === '%' ? '%p' : r.unit
        const msg = r.lowerIsBetter
          ? (ok ? `달성 · 목표 이하, 여유 ${fmt(gap, dec)}${du}` : `미달 · ${fmt(gap, dec)}${du} 줄여야 함`)
          : (ok ? `달성 · 목표보다 ${fmt(gap, dec)}${du} 높음` : `미달 · 남은 양 ${fmt(gap, dec)}${du}`)
        return (
          <div key={r.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{r.label}</span>
              <span className="tabular-nums text-muted-foreground">{fmt(r.value, dec)}{r.unit} / 목표 {fmt(r.target, dec)}{r.unit}</span>
            </div>
            <div className="relative">
              <Progress value={(r.value / max) * 100} className={ok ? '[&>div]:bg-muted-foreground' : '[&>div]:bg-[var(--sk-orange)]'} />
              <span className="absolute -top-1 h-4 w-0.5 bg-foreground" style={{ left: `${(r.target / max) * 100}%` }} aria-hidden />
            </div>
            <div className="text-xs text-muted-foreground">{msg} · {w.due}</div>
          </div>
        )
      })}
    </div>
  )
}

// ---------- W7 퍼널 ----------
export function Funnel({ w }: { w: W }) {
  if (!w.steps.length || !(w.steps[0].value > 0)) return <Empty />
  const max = w.steps[0].value
  let worst = -1, worstRate = 2
  w.steps.forEach((s, i) => { if (i > 0 && s.value / (w.steps[i - 1].value || 1) < worstRate) { worstRate = s.value / (w.steps[i - 1].value || 1); worst = i } })
  return (
    <div className="flex flex-col gap-3">
      {w.steps.map((s, i) => {
        const prev = i > 0 ? w.steps[i - 1].value : 0
        return (
          <div key={s.label} className="grid grid-cols-[5.5rem_1fr_11rem] items-center gap-3 text-sm">
            <span className="text-right text-muted-foreground">{s.label}</span>
            <div className="flex items-center gap-2">
              <div className={`h-6 shrink rounded-sm ${i === worst ? 'bg-[var(--sk-orange)]' : 'bg-muted-foreground/60'}`} style={{ width: `${Math.max(1, (s.value / max) * 100)}%` }} title={`${s.label}: ${s.value}${w.unit}`} />
              <span className="whitespace-nowrap font-medium tabular-nums">{fmt(s.value)}{w.unit}</span>
            </div>
            <span className="text-xs text-muted-foreground">{i === 0 ? '기준 100%' : `전환 ${fmt(prev ? (s.value / prev) * 100 : 0)}% · 이탈 ${fmt(prev - s.value)}${w.unit}`}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------- W9 이상치·알림 목록 ----------
export function AlertList({ items }: { items: W[] }) {
  if (!items.length) return <Empty>지금 문제가 되는 건이 없습니다.</Empty>
  return (
    <ul className="flex flex-col divide-y">
      {items.map((it) => (
        <li key={it.href}>
          <a href={it.href} className="flex items-center gap-3 py-2.5 text-sm hover:bg-muted/50">
            <ToneBadge text={it.badge} tone={it.tone} />
            <span className="line-clamp-2 min-w-0 flex-1 font-medium">{it.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{it.note}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{it.ts}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

// ---------- W10 상태 보드(칸반) ----------
export function StatusBoard({ columns, maxShown = 6 }: { columns: W[]; maxShown?: number }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((c) => (
        <div key={c.name} className="flex flex-col gap-2 rounded-lg bg-muted/40 p-2.5">
          <div className="flex items-center justify-between px-1 text-sm font-medium">
            <span>{c.name}</span><Badge variant="secondary">{c.total}건</Badge>
          </div>
          {c.items.length ? c.items.map((it) => (
            <a key={it.id} href={it.href} className="rounded-md bg-card px-3 py-2 text-sm shadow-xs hover:bg-muted/50">
              <div className="font-medium">{it.title}</div>
              <div className="text-xs text-muted-foreground">{it.id} · {it.meta}</div>
            </a>
          )) : <div className="py-4 text-center text-xs text-muted-foreground">해당 건 없음</div>}
          {c.total > Math.min(c.items.length, maxShown) ? <div className="px-1 text-xs text-muted-foreground">외 {c.total - c.items.length}건</div> : null}
        </div>
      ))}
    </div>
  )
}

// ---------- W11 일정 타임라인(간이 간트, 오늘 선) ----------
export function Timeline({ w }: { w: W }) {
  const n = w.days.length
  const idx = (d: string) => w.days.indexOf(d)
  const todayIdx = idx(w.today)
  const col = (i: number) => `${(i / n) * 100}%`
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[13rem_1fr] text-xs text-muted-foreground">
          <div />
          <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {w.days.map((d, i) => <div key={d} className={`pb-1 text-center ${i === todayIdx ? 'font-semibold text-foreground' : ''}`}>{i % 2 === 0 || i === todayIdx ? mmdd(d) : ''}</div>)}
          </div>
        </div>
        <div className="relative">
          {w.items.map((it) => {
            const visible = it.end >= w.days[0] && it.start <= w.days[n - 1]
            const s = it.start <= w.days[0] ? 0 : w.days.findIndex((d) => d >= it.start)
            const e = it.end >= w.days[n - 1] ? n - 1 : w.days.filter((d) => d <= it.end).length - 1
            const active = it.start <= w.today && it.end >= w.today
            return (
              <div key={it.label} className="grid grid-cols-[13rem_1fr] items-center border-t py-1.5 text-sm">
                <div className="truncate pr-3" title={`${it.label} · ${it.owner}`}>{it.label}</div>
                <div className="relative h-6">
                  {visible ? (
                    <div className={`absolute top-0 flex h-6 items-center overflow-hidden rounded-sm px-2 text-xs ${active ? 'bg-muted-foreground/50 font-medium text-foreground' : 'bg-muted-foreground/25 text-foreground'}`}
                      style={{ left: col(s), width: `${((e - s + 1) / n) * 100}%` }} title={`${it.start} ~ ${it.end} · ${it.owner}`}>
                      {e - s >= 2 ? `${mmdd(it.start)}~${mmdd(it.end)} ${active ? '진행 중' : ''}` : active && e - s >= 1 ? '진행 중' : ''}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
          {todayIdx >= 0 ? (
            <div className="pointer-events-none absolute inset-y-0 left-[13rem] right-0">
              <div className="absolute inset-y-0 w-px bg-foreground" style={{ left: `${((todayIdx + 0.5) / n) * 100}%` }} />
              <span className="absolute -top-0.5 ml-1 whitespace-nowrap rounded-sm bg-background px-1 text-[10px] font-medium text-foreground" style={{ left: `${((todayIdx + 0.5) / n) * 100}%` }}>오늘</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ---------- W12 최근 활동 ----------
export function ActivityFeed({ items }: { items: W[] }) {
  if (!items.length) return <Empty />
  return (
    <ul className="flex flex-col divide-y">
      {items.map((a, i) => (
        <li key={i} className="flex items-baseline gap-3 py-2 text-sm">
          <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{a.ts}</span>
          <span className="w-16 shrink-0 font-medium">{a.who}</span>
          <a className="min-w-0 flex-1 truncate hover:underline" href={a.href}>{a.what}</a>
        </li>
      ))}
    </ul>
  )
}

// ---------- W13 배치도: 색 + 글자 ----------
export function FloorMap({ w }: { w: W }) {
  if (!w.cells.length) return <Empty />
  const rows = Math.max(...w.cells.map((c) => c.row))
  const cellOf = (r: number, c: number) => w.cells.find((x) => x.row === r && x.col === c)
  return (
    <div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${w.cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: rows * w.cols }, (_, k) => {
          const c = cellOf(Math.floor(k / w.cols) + 1, (k % w.cols) + 1)
          if (!c) return <div key={k} />
          const si = Math.max(0, w.states.indexOf(c.state)) // 0 정상 · 1 주의 · 2 위험(states 순서)
          return (
            <a key={k} href={c.href} className={`flex flex-col gap-1 rounded-lg border bg-card p-2.5 text-sm shadow-xs hover:bg-muted/50 ${c.dim ? 'opacity-40' : ''}`}>
              <div className="flex items-center justify-between gap-1">
                <span className="font-medium">{c.id}</span>
                <Badge variant={si === 1 ? 'secondary' : 'outline'} className={si === 2 ? 'sk-urgent' : ''}>{c.state}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{c.note}</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}

// ---------- W15 분포: 히스토그램(손 SVG, 실제 폭으로 그림) + 중앙값 점선 + p90 주황 점선(선 위 라벨). 그룹이 있으면 「그룹별」 토글로 같은 구간의 작은 다중 막대 ----------
type Pad = { l: number; r: number; t: number; b: number }
const FS = 12
// 실제 폭을 재서 그 폭 그대로 그린다(늘리지 않으므로 글자가 FS px 그대로 보인다)
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(Math.round(el.clientWidth))
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}
const halo = { paintOrder: 'stroke', stroke: 'var(--card)', strokeWidth: 3, strokeLinejoin: 'round' } as const
function Bars({ w, counts, median, p90, W: HW, H, labels, pad }: { w: W; counts: number[]; median: number | null; p90?: number | null; W: number; H: number; labels: boolean; pad: Pad }) {
  const edges: number[] = w.edges
  const max = Math.max(1, ...counts)
  const lo = edges[0], hi = edges[edges.length - 1]
  const X = (v: number) => pad.l + ((v - lo) / (hi - lo || 1)) * (HW - pad.l - pad.r)
  const Y = (c: number) => pad.t + (1 - c / max) * (H - pad.t - pad.b)
  const hasMed = median !== null && median !== undefined, hasP90 = p90 !== null && p90 !== undefined
  return (
    <>
      <line x1={pad.l} x2={HW - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--border)" />
      {counts.map((c, i) => {
        const x1 = X(edges[i]), x2 = X(edges[i + 1])
        return (
          <rect key={i} x={x1 + 1} y={Y(c)} width={Math.max(1, x2 - x1 - 2)} height={H - pad.b - Y(c)} fill="var(--chart-2)" rx={2}><title>{`${fmt(edges[i], w.decimals)}~${fmt(edges[i + 1], w.decimals)}${w.unit}: ${c}`}</title></rect>
        )
      })}
      {hasMed ? <line x1={X(median!)} x2={X(median!)} y1={labels ? 18 : pad.t} y2={H - pad.b} stroke="var(--foreground)" strokeDasharray="5 4" strokeOpacity={0.7} data-line="median" /> : null}
      {hasP90 ? <line x1={X(p90!)} x2={X(p90!)} y1={labels ? 18 : pad.t} y2={H - pad.b} stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="5 4" data-line="p90" /> : null}
      {labels ? counts.map((c, i) => (c > 0 ? <text key={i} x={(X(edges[i]) + X(edges[i + 1])) / 2} y={Y(c) - 4} textAnchor="middle" fontSize={FS} className="fill-foreground tabular-nums" style={halo}>{c}</text> : null)) : null}
      {labels ? edges.map((e, i) => ((edges.length <= 9 || i % 2 === 0) ? <text key={i} x={X(e)} y={H - 12} textAnchor="middle" fontSize={FS} className="fill-muted-foreground tabular-nums">{fmt(e, w.decimals)}</text> : null)) : null}
      {labels && hasMed ? <text x={X(median!) + (hasP90 ? -5 : 5)} y={13} textAnchor={hasP90 ? 'end' : 'start'} fontSize={FS} className="fill-foreground tabular-nums" style={halo}>중앙값 {fmt(median!, 1)}</text> : null}
      {labels && hasP90 ? <text x={X(p90!) + 5} y={13} textAnchor="start" fontSize={FS} className="fill-foreground font-medium tabular-nums" style={halo}>p90 {fmt(p90!, 1)}</text> : null}
    </>
  )
}
function DistChart({ w, counts, median, p90, H, labels, pad, label }: { w: W; counts: number[]; median: number | null; p90?: number | null; H: number; labels: boolean; pad: Pad; label: string }) {
  const [ref, width] = useWidth()
  return (
    <div ref={ref} className="w-full" style={{ height: H }}>
      {width > 0 ? <svg width={width} height={H} role="img" aria-label={label} className="block"><Bars w={w} counts={counts} median={median} p90={p90} W={width} H={H} labels={labels} pad={pad} /></svg> : null}
    </div>
  )
}
export function Distribution({ w }: { w: W | null }) {
  const [view, setView] = useState('all')
  if (!w || !w.n || !w.edges.length) return <Empty>분포를 그릴 값이 없습니다.</Empty>
  const multi = view === 'groups' && w.groups.length > 0
  return (
    <div className="flex flex-col gap-3">
      {w.groups.length ? (
        <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v)} aria-label="보기" className="self-start">
          <ToggleGroupItem value="all" className="px-3">전체</ToggleGroupItem>
          <ToggleGroupItem value="groups" className="px-3">{w.groupLabel}별</ToggleGroupItem>
        </ToggleGroup>
      ) : null}
      {multi ? (
        <div className="grid grid-cols-1 gap-3 @xl/card:grid-cols-2 @3xl/card:grid-cols-3" data-dist="groups">
          {w.groups.map((g: { name: string; n: number; counts: number[]; median: number | null }) => (
            <div key={g.name} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-xs"><span className="font-medium">{g.name}</span><span className="tabular-nums text-muted-foreground">{fmt(g.n)}{w.countUnit}{g.median !== null ? ` · 중앙값 ${fmt(g.median, 1)}${w.unit}` : ''}</span></div>
              {g.n ? <DistChart w={w} counts={g.counts} median={g.median} H={110} labels={false} pad={{ l: 8, r: 8, t: 6, b: 6 }} label={`${g.name} 분포`} /> : <div className="py-6 text-center text-xs text-muted-foreground">값 없음</div>}
            </div>
          ))}
        </div>
      ) : (
        <div data-dist="all"><DistChart w={w} counts={w.counts} median={w.median} p90={w.p90} H={240} labels pad={{ l: 24, r: 24, t: 34, b: 34 }} label={w.title} /></div>
      )}
      <p className="text-xs text-muted-foreground">{w.label}({w.unit}) · {fmt(w.n)}{w.countUnit}</p>
    </div>
  )
}
