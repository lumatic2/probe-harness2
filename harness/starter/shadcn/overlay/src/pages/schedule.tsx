// ⑥ 일정 격자 #/schedule — 행 = 자원, 열 = 시간 슬롯, 막대 = 일정. 충돌은 옅은 주황 + 진한 주황 테두리(급함 배지와 같은 규칙).
// 막대를 끌어 옮기거나 폼으로 시간·자원을 고치면 충돌을 즉시 다시 계산하고, 충돌이 없을 때만 「확정」으로 /api/schedule-<도메인> 에 저장한다.
// 계산은 전부 src/domain/schedule.mjs (설정: domain.json 의 schedule). 이 파일은 그리기만 한다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LimitNote } from '@/components/page-parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { confirmPayload, dayList, daysWithItems, fromInput, hourInfo, hourRange, layoutRows, pickScale, scheduleModel, shifted, slotInfo, toInput, toMs, toTs, validRange, type SchedEdits } from '@/domain/schedule.mjs'
import { ctx, distinct, domainName, shortTs } from '@/lib/derive'
import { useStore } from '@/lib/store'
import { Empty, ToneBadge, WidgetCard } from '@/widgets/panel'

const LABEL_W = '7.5rem'
const LANE_H = 28
const pad = (n: number) => String(n).padStart(2, '0')
const nowTs = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
type Confirmed = { ts?: string; count?: number; edits?: SchedEdits }

export default function Schedule() {
  const cfg = ctx.d.schedule
  const snap: number = cfg.snapMinutes ?? 60
  const info = useMemo(() => slotInfo(cfg), [cfg])
  const days = useMemo(() => dayList(info), [info])
  const { data: confirmed, loaded, save } = useStore<Confirmed>(`schedule-${domainName}`, {})
  const [edits, setEdits] = useState<SchedEdits>({})
  // 보기: 'hour' = 일(하루를 1시간 칸) · 'day' = 주(격자 범위 전체를 일 칸). 처음은 설정 schedule.scale(기본 auto: 일정이 하루에 몰리면 일, 여러 날이면 주)
  const first = useMemo(() => scheduleModel(ctx, {}), [])
  const [scale, setScale] = useState<'hour' | 'day'>(() => pickScale(cfg.scale, first.sched, info))
  const [day, setDay] = useState<string>(() => { const w = daysWithItems(first.sched, info); return w.includes(ctx.today) ? ctx.today : w[0] ?? days[0]?.day ?? '' })
  const [selected, setSelected] = useState('')
  const [drag, setDrag] = useState<{ id: string; minutes: number; start: string; end: string } | null>(null)
  const [draft, setDraft] = useState<{ resource: string; start: string; end: string }>({ resource: '', start: '', end: '' })
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)
  const areaRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (loaded) setEdits(confirmed.edits ?? {}) }, [loaded, confirmed])

  // 끌고 있는 동안은 미리 옮긴 값으로 다시 계산한다 — 놓기 전에도 충돌이 바로 보인다
  const live: SchedEdits = drag ? { ...edits, [drag.id]: { ...edits[drag.id], ...shifted(drag, drag.minutes, snap) } } : edits
  const model = useMemo(() => scheduleModel(ctx, live), [JSON.stringify(live)]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(edits) !== JSON.stringify(confirmed.edits ?? {})
  const conflicts = model.conflicts
  const item = model.sched.find((x) => x.id === selected) ?? model.unassigned.find((x) => x.id === selected)
  // 그릴 범위·막대: 일 보기는 그날 일정이 다 들어가는 시 범위, 주 보기는 막대 최소 너비(글자가 들어가게)를 둔다
  const view = useMemo(() => (scale === 'hour' ? hourInfo(day, ...hourRange(model.sched, day)) : info), [scale, day, model.sched, info])
  const rows = useMemo(() => layoutRows(model.sched, view, view.unit === 'day' ? 0.9 / view.count : 0), [model.sched, view])
  const resources: string[] = distinct(ctx, cfg.resource)

  // 선택이 바뀌면 폼 초깃값을 그 건의 현재 값으로
  useEffect(() => {
    if (!item) return
    const free = !item.start || !item.end
    setDraft({
      resource: item.resource || resources[0] || '',
      start: toInput(free ? toTs(info.t0 + 9 * 3600000) : item.start),
      end: toInput(free ? toTs(info.t0 + 12 * 3600000) : item.end),
    })
    setFormErr('')
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  const setEdit = (id: string, patch: SchedEdits[string]) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }))

  const onDown = (e: React.PointerEvent, x: { id: string; start: string; end: string }) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelected(x.id)
    setDrag({ id: x.id, minutes: 0, start: x.start, end: x.end })
    ;(e.currentTarget as HTMLElement).dataset.x0 = String(e.clientX)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return
    const w = areaRef.current?.getBoundingClientRect().width || 1
    const dx = e.clientX - Number((e.currentTarget as HTMLElement).dataset.x0)
    const totalMin = (view.t1 - view.t0) / 60000
    setDrag({ ...drag, minutes: Math.round(((dx / w) * totalMin) / snap) * snap })
  }
  const onUp = () => {
    if (drag && drag.minutes !== 0) setEdit(drag.id, shifted(drag, drag.minutes, snap))
    setDrag(null)
  }

  const apply = () => {
    if (!item) return
    if (!validRange(fromInput(draft.start), fromInput(draft.end))) { setFormErr('종료는 시작보다 뒤여야 합니다.'); return }
    setFormErr('')
    setEdit(item.id, { resource: draft.resource, start: fromInput(draft.start), end: fromInput(draft.end) })
  }

  const confirm = async () => {
    const body = confirmPayload(model, edits, nowTs())
    if (!body) { toast.error('충돌이 남아 있어 확정할 수 없습니다', { description: `${conflicts.length}건을 먼저 해소하세요.` }); return }
    setSaving(true)
    try {
      await save(body)
      toast.success('일정을 확정했습니다', { description: `${body.count}건 · ${body.ts.slice(11)}` })
    } catch (err) {
      toast.error('저장하지 못했습니다', { description: `${(err as Error).message} — 서버가 켜져 있는지 확인하세요.` })
    } finally { setSaving(false) }
  }

  const tdaysPct = (i: number) => `${(i / view.count) * 100}%`
  const todayIdx = view.unit === 'day' ? (toMs(`${ctx.today}T00:00:00`) - view.t0) / view.slotMs : -1

  return (
    <>
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <WidgetCard
          title={cfg.title}
          sub={`${model.count}건 · 충돌 ${conflicts.length}건 · ${cfg.unassignedTitle ?? '미배정'} ${model.unassigned.length}건${confirmed.ts ? ` · 확정본 ${shortTs(confirmed.ts)}` : ''}`}
          seg={(
            <>
              <Button variant="outline" size="sm" disabled={!dirty} onClick={() => { setEdits(confirmed.edits ?? {}); setSelected('') }}>되돌리기</Button>
              <Button size="sm" disabled={saving || conflicts.length > 0 || (!dirty && !!confirmed.ts)} onClick={confirm} data-confirm>{saving ? '저장 중…' : cfg.confirmLabel ?? '확정'}</Button>
            </>
          )}
        >
          <div className="flex flex-wrap items-center gap-2 pb-3" data-schedule-tools>
            <ToggleGroup type="single" variant="outline" size="sm" value={scale} onValueChange={(v) => v && setScale(v as 'hour' | 'day')} aria-label="보기 단위">
              <ToggleGroupItem value="hour" className="px-3" data-scale="hour">일</ToggleGroupItem>
              <ToggleGroupItem value="day" className="px-3" data-scale="day">주</ToggleGroupItem>
            </ToggleGroup>
            <Select value={day} onValueChange={(v) => { setDay(v); setScale('hour') }}>
              <SelectTrigger size="sm" className="w-36" aria-label="날짜" data-day-select><SelectValue /></SelectTrigger>
              <SelectContent>{days.map((d) => <SelectItem key={d.day} value={d.day}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto" data-schedule-grid data-scale={scale}>
            <div className="min-w-[760px]">
              <div className="grid text-xs text-muted-foreground" style={{ gridTemplateColumns: `${LABEL_W} 1fr` }}>
                <div className="py-1.5">{cfg.resourceLabel ?? '자원'}</div>
                <div className="grid" style={{ gridTemplateColumns: `repeat(${view.count}, minmax(0, 1fr))` }}>
                  {view.slots.map((s, i) => <div key={s.ms} className={`border-l py-1.5 text-center tabular-nums ${i === Math.floor(todayIdx) ? 'font-semibold text-foreground' : ''}`}>{view.unit === 'hour' ? `${s.label}시` : s.label}<span className="ml-1">{s.sub}</span></div>)}
                </div>
              </div>
              {rows.length ? rows.map((r) => (
                <div key={r.resource} className="grid items-stretch border-t text-sm" style={{ gridTemplateColumns: `${LABEL_W} 1fr` }} data-resource={r.resource}>
                  <div className="flex items-center truncate pr-2 font-medium">{r.resource}</div>
                  <div className="relative" style={{ height: r.lanes * LANE_H + 8 }} ref={r.resource === rows[0].resource ? areaRef : undefined}>
                    <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${view.count}, minmax(0, 1fr))` }}>
                      {view.slots.map((s) => <div key={s.ms} className="border-l" />)}
                    </div>
                    {todayIdx >= 0 && todayIdx < view.count ? <div className="pointer-events-none absolute inset-y-0 w-px bg-foreground/60" style={{ left: tdaysPct(todayIdx) }} /> : null}
                    {r.items.map((x) => (
                      <button
                        key={x.id} type="button" data-bar={x.id} data-conflict={x.conflict ? 'true' : 'false'}
                        aria-label={`${x.id} ${x.label} ${shortTs(x.start)}~${shortTs(x.end)}${x.conflict ? ' 충돌' : ''}`}
                        title={`${x.id} · ${x.label}\n${shortTs(x.start)} ~ ${shortTs(x.end)}${x.conflict ? `\n충돌: ${x.rules.map((i: number) => cfg.rules[i].label).join(', ')}` : ''}`}
                        onPointerDown={(e) => onDown(e, x)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}
                        className={`absolute flex h-6 touch-none cursor-grab items-center overflow-hidden rounded-sm px-1.5 text-left text-xs whitespace-nowrap active:cursor-grabbing ${x.conflict ? 'border border-[#b84a00] bg-[#fff1e6] text-[#b84a00]' : 'bg-muted-foreground/25 text-foreground'} ${selected === x.id ? 'ring-2 ring-ring' : ''}`}
                        style={{ left: `${x.left * 100}%`, width: `max(${x.width * 100}%, 10px)`, top: 4 + x.lane * LANE_H }}
                      >
                        <span className="truncate">{x.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )) : <Empty>{scale === 'hour' ? '이 날 올릴 일정이 없습니다.' : '이 기간에 올릴 일정이 없습니다.'}</Empty>}
            </div>
          </div>
        </WidgetCard>
      </div>

      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3">
        <WidgetCard title="충돌 목록" sub={conflicts.length ? `${conflicts.length}건` : undefined}>
          {conflicts.length ? (
            <Table data-conflicts>
              <TableHeader><TableRow><TableHead>규칙</TableHead><TableHead>대상</TableHead><TableHead>겹친 일정</TableHead></TableRow></TableHeader>
              <TableBody>
                {conflicts.map((c, i) => (
                  <TableRow key={i} className="cursor-pointer" onClick={() => setSelected(c.ids[0])}>
                    <TableCell className="whitespace-normal"><ToneBadge text={c.label} tone="urgent" /></TableCell>
                    <TableCell className="whitespace-nowrap">{c.key}</TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">{c.ids.slice(0, 3).join(' · ')}{c.ids.length > 3 ? ` 외 ${c.ids.length - 3}건` : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <Empty>충돌이 없습니다.</Empty>}
        </WidgetCard>

        <WidgetCard title="선택한 일정 수정" sub={item ? `${item.id} · ${item.label}` : undefined}>
          {item ? (
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); apply() }} data-sched-form>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="s-res">{cfg.resourceLabel ?? '자원'}</Label>
                <Select value={draft.resource} onValueChange={(v) => setDraft((d) => ({ ...d, resource: v }))}>
                  <SelectTrigger id="s-res" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{resources.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="s-start">시작</Label><Input id="s-start" type="datetime-local" value={draft.start} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="s-end">종료</Label><Input id="s-end" type="datetime-local" value={draft.end} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} aria-invalid={!!formErr} /></div>
              <p role="alert" className="min-h-4 text-xs text-destructive">{formErr}</p>
              <div><Button type="submit" variant="outline">적용</Button></div>
            </form>
          ) : <Empty>격자의 막대나 목록의 일정을 고르세요.</Empty>}
        </WidgetCard>

        <WidgetCard title={cfg.unassignedTitle ?? '미배정'} sub={`${model.unassigned.length}건`}>
          {model.unassigned.length ? (
            <Table data-unassigned>
              <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>일정</TableHead><TableHead>{cfg.resourceLabel ?? '자원'}</TableHead></TableRow></TableHeader>
              <TableBody>
                {model.unassigned.map((u) => (
                  <TableRow key={u.id} className="cursor-pointer" data-state={selected === u.id ? 'selected' : undefined} onClick={() => setSelected(u.id)}>
                    <TableCell className="whitespace-nowrap">{u.id}</TableCell>
                    <TableCell className="whitespace-normal">{u.label}</TableCell>
                    <TableCell className="whitespace-nowrap">{u.resource}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <Empty>미배정 일정이 없습니다.</Empty>}
        </WidgetCard>
      </div>
      <LimitNote extra="확정은 충돌이 없을 때만 가능하고 이 컴퓨터에만 저장됨" />
    </>
  )
}
