// ⑨ 기준값 설정 #/settings — 규칙 파라미터(domain.json 의 params)를 바꾸고, 저장 전에 「지금 기준 → 바꾼 기준」 결과를 옆에서 비교한다.
// 저장은 /api/settings-<도메인> 에 {values, history} 한 덩어리(사유 한 줄 필수). 저장하지 않으면 다른 화면에는 아무 영향이 없다.
// 계산은 전부 src/domain/core.mjs (paramValues · makeSettingsRecord · whatIf).
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LimitNote } from '@/components/page-parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStore } from '@/lib/store'
import { applySettings, ctx, fmt, makeSettingsRecord, optionValue, paramDefs, paramError, paramText, paramValues, SETTINGS_API, sign, whatIf, type ParamDef, type SettingsSaved, type WhatIfResult } from '@/lib/derive'
import { Empty, WidgetCard } from '@/widgets/panel'

const EMPTY: SettingsSaved = { values: {}, history: [] }
const pad = (n: number) => String(n).padStart(2, '0')
const nowStamp = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` }
const optLabel = (o: string | { v: string; label?: string }) => (typeof o === 'object' ? o.label ?? o.v : o)
const pu = (u: string) => (u === '%' ? '%p' : u)
const cellVal = (m: WhatIfResult['metrics'][number], v: number | null) => (v === null || v === undefined ? '–' : `${fmt(v, m.decimals)}${m.unit === '개' ? '' : m.unit}`)
const targetText = (t: number | null, met: boolean | null, unit: string) => (t === null ? '–' : `${t}${unit} ${met === null ? '' : met ? '달성' : '미달'}`.trim())
const Err = ({ id, msg }: { id: string; msg?: string }) => <p id={id} role="alert" className="min-h-4 text-xs text-destructive">{msg}</p>

function Compare({ r }: { r: WhatIfResult }) {
  if (!r.changed.length) return <Empty>바꾼 값이 없습니다.</Empty>
  return (
    <div className="flex flex-col gap-4" data-compare>
      <Table>
        <TableHeader><TableRow><TableHead>지표</TableHead><TableHead className="text-right">지금 기준</TableHead><TableHead className="text-right">바꾼 기준</TableHead><TableHead className="text-right">차이</TableHead><TableHead>목표</TableHead></TableRow></TableHeader>
        <TableBody>
          {r.metrics.map((m) => {
            const same = m.targetBefore === m.targetAfter && m.metBefore === m.metAfter
            const tgt = m.targetBefore === null ? '–' : same ? targetText(m.targetAfter, m.metAfter, m.unit) : `${targetText(m.targetBefore, m.metBefore, m.unit)} → ${targetText(m.targetAfter, m.metAfter, m.unit)}`
            return (
              <TableRow key={m.key} data-metric={m.key}>
                <TableCell className="whitespace-normal">{m.label}</TableCell>
                <TableCell className="text-right tabular-nums">{cellVal(m, m.before)}</TableCell>
                <TableCell className="text-right tabular-nums">{cellVal(m, m.after)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums" data-diff>{m.diff === null ? '–' : m.diff === 0 ? '0' : `${sign(m.diff, m.decimals)}${m.unit === '개' ? '' : pu(m.unit)}`}</TableCell>
                <TableCell className="whitespace-normal">{tgt}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {r.flips.has ? (
        <div className="flex flex-col gap-2" data-flips>
          <p className="text-sm"><strong className="font-semibold" data-flip-count>판정이 바뀌는 행 {fmt(r.flips.count)}건</strong>{r.flips.moves.length ? <span className="ml-2 text-muted-foreground">{r.flips.moves.map((m) => `${m.from} → ${m.to} ${fmt(m.n)}건`).join(' · ')}</span> : null}</p>
          {r.flips.count ? (
            <Table>
              <TableHeader><TableRow><TableHead>판정이 바뀌는 행</TableHead><TableHead>지금</TableHead><TableHead>바꾼 기준</TableHead></TableRow></TableHeader>
              <TableBody>{r.flips.rows.map((x) => <TableRow key={x.id}><TableCell><a className="underline-offset-4 hover:underline" href={`#/item/${encodeURIComponent(x.id)}`}>{x.title}</a></TableCell><TableCell>{x.before}</TableCell><TableCell>{x.after}</TableCell></TableRow>)}</TableBody>
            </Table>
          ) : null}
          {r.flips.count > r.flips.rows.length ? <p className="text-xs text-muted-foreground">상위 {r.flips.rows.length}건만 표시</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function ParamField({ def, value, text, error, onNumber, onValue }: { def: ParamDef; value: unknown; text: string; error: string; onNumber: (t: string) => void; onValue: (v: unknown) => void }) {
  const id = `p-${def.key}`
  const dflt = paramText(def, def.default)
  return (
    <div className="flex flex-col gap-1.5" data-param={def.key}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label htmlFor={id}>{def.label}</Label>
        <span className="text-xs text-muted-foreground">{def.affects} · 기본 {dflt}</span>
      </div>
      {def.type === 'bool' ? (
        <div className="flex items-center gap-2"><Switch id={id} checked={!!value} onCheckedChange={onValue} /><span className="text-sm">{value ? '켬' : '끔'}</span></div>
      ) : def.type === 'enum' ? (
        <Select value={String(value)} onValueChange={onValue}>
          <SelectTrigger id={id} className="w-full max-w-64"><SelectValue /></SelectTrigger>
          <SelectContent>{(def.options ?? []).map((o) => <SelectItem key={optionValue(o)} value={optionValue(o)}>{optLabel(o)}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <div className="flex items-center gap-2">
          <Input id={id} type="number" inputMode="decimal" className="w-32 tabular-nums" min={def.min} max={def.max} step={def.step ?? 1} value={text} onChange={(e) => onNumber(e.target.value)} aria-invalid={!!error} aria-describedby={`perr-${def.key}`} />
          {def.unit ? <span className="text-sm text-muted-foreground">{def.unit}</span> : null}
        </div>
      )}
      <Err id={`perr-${def.key}`} msg={error} />
    </div>
  )
}

export default function Settings() {
  const defs = paramDefs(ctx.raw) as ParamDef[]
  const store = useStore<SettingsSaved>(SETTINGS_API, EMPTY)
  const cur = store.data
  const base = ctx.settings as Record<string, unknown>
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...base })
  const [txt, setTxt] = useState<Record<string, string>>(() => Object.fromEntries(defs.filter((d) => d.type === 'number').map((d) => [d.key, String(base[d.key])])))
  const [reason, setReason] = useState('')
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const paramErrs = Object.fromEntries(defs.map((d) => [d.key, paramError(d, draft[d.key])]).filter(([, m]) => m)) as Record<string, string>
  const result = useMemo(() => whatIf(ctx, draft), [draft, cur]) // eslint-disable-line react-hooks/exhaustive-deps

  const setNumber = (def: ParamDef) => (t: string) => { setTxt((x) => ({ ...x, [def.key]: t })); setDraft((x) => ({ ...x, [def.key]: t.trim() === '' ? NaN : Number(t) })) }
  const setValue = (key: string) => (v: unknown) => setDraft((x) => ({ ...x, [key]: v }))
  const reset = () => { const d = paramValues(ctx.raw, {}); setDraft(d); setTxt(Object.fromEntries(defs.filter((p) => p.type === 'number').map((p) => [p.key, String(d[p.key])]))); setErrs({}) }

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const rec = makeSettingsRecord(ctx.raw, cur, draft, reason, nowStamp())
    if (rec.errors) { setErrs(rec.errors); toast.error('입력을 확인하세요', { description: Object.values(rec.errors)[0] }); return }
    setBusy(true)
    try {
      await store.save(rec.saved)
      applySettings(rec.saved.values)
      setDraft({ ...rec.saved.values })
      setReason('')
      setErrs({})
      toast.success('저장됨', { description: `${rec.entries.length}개 항목 · ${rec.entries[0].ts.slice(11)}` })
    } catch (err) {
      toast.error('저장하지 못했습니다', { description: `${(err as Error).message} — 서버가 켜져 있는지 확인하세요.` })
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-12">
        <WidgetCard title="기준값" className="@4xl/main:col-span-5">
          <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-settings-form>
            {defs.map((d) => <ParamField key={d.key} def={d} value={draft[d.key]} text={txt[d.key] ?? ''} error={paramErrs[d.key] ?? errs[d.key] ?? ''} onNumber={setNumber(d)} onValue={setValue(d.key)} />)}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-reason">사유</Label>
              <Input id="s-reason" value={reason} maxLength={120} placeholder="사유 한 줄 (필수)" onChange={(e) => setReason(e.target.value)} aria-invalid={!!(errs._reason || errs._)} aria-describedby="serr-reason" data-reason />
              <Err id="serr-reason" msg={errs._reason ?? errs._} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy || !store.loaded} data-save>{busy ? '저장 중…' : '저장'}</Button>
              <Button type="button" variant="outline" onClick={reset} data-reset>기본값으로 되돌리기</Button>
            </div>
          </form>
        </WidgetCard>
        <WidgetCard title="가정 바꿔 보기" sub={`${result.basis} · 지금 기준 → 바꾼 기준`} className="@4xl/main:col-span-7">
          <Compare r={result} />
        </WidgetCard>
        <WidgetCard title="변경 이력" className="@4xl/main:col-span-12">
          {cur.history.length ? (
            <Table data-history>
              <TableHeader><TableRow><TableHead>시각</TableHead><TableHead>항목</TableHead><TableHead>이전 → 이후</TableHead><TableHead>사유</TableHead></TableRow></TableHeader>
              <TableBody>{[...cur.history].reverse().map((h, i) => <TableRow key={i}><TableCell className="whitespace-nowrap tabular-nums">{h.ts}</TableCell><TableCell>{h.label}</TableCell><TableCell>{h.from} → {h.to}</TableCell><TableCell className="whitespace-normal">{h.reason}</TableCell></TableRow>)}</TableBody>
            </Table>
          ) : <Empty>저장된 변경이 없습니다.</Empty>}
        </WidgetCard>
      </div>
      <LimitNote />
    </>
  )
}
