// ④ 입력·판정 — Select · RadioGroup · Textarea · 검증 메시지 → POST /api/decisions-<도메인> → 토스트 + 이력 즉시 반영
// 입력칸은 도메인 설정(form.fields)에서 온다: number · date · text · radio · textarea.
import { useState } from 'react'
import { toast } from 'sonner'
import { LimitNote } from '@/components/page-parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useApp } from '@/lib/app-context'
import { ctx, formOpenRows, idOf, makeDecision, shortTs, titleOf, validate } from '@/lib/derive'
import { WidgetCard } from '@/widgets/panel'

type Field = { key: string; label: string; type: 'number' | 'date' | 'text' | 'radio' | 'textarea'; min?: number; options?: string[] }
const pad = (n: number) => String(n).padStart(2, '0')
const nowTs = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
const Err = ({ id, msg }: { id: string; msg?: string }) => <p id={id} role="alert" className="min-h-4 text-xs text-destructive">{msg}</p>

export default function Form() {
  const { route, decisions, saveDecision } = useApp()
  const f = ctx.d.form
  const fields: Field[] = f.fields
  const open = formOpenRows(ctx, route)
  const [ref, setRef] = useState(route.id ?? '')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const set = (k: string) => (v: string) => setVals((x) => ({ ...x, [k]: v }))

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const input = { ref, ...vals }
    const e = validate(ctx, input)
    setErrs(e)
    if (Object.keys(e).length) { toast.error('입력을 확인하세요', { description: Object.values(e)[0] }); return }
    const rec = makeDecision(ctx, decisions, input, nowTs())
    setSaving(true)
    try {
      await saveDecision(rec as never)
      toast.success('저장됨', { description: `${rec.ref} · ${rec.ts.slice(11)}` })
      setVals({})
    } catch (err) {
      toast.error('저장하지 못했습니다', { description: `${(err as Error).message} — 서버가 켜져 있는지 확인하세요.` })
    } finally { setSaving(false) }
  }

  const recent = [...decisions].reverse().slice(0, 8)
  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-5">
        <WidgetCard title={f.title} sub={f.intro} className="@4xl/main:col-span-2">
          <form onSubmit={submit} noValidate className="flex flex-col gap-2" data-form>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-ref">{f.refLabel}</Label>
              <Select value={ref} onValueChange={setRef}>
                <SelectTrigger id="f-ref" className="w-full" aria-invalid={!!errs.ref} aria-describedby="err-ref"><SelectValue placeholder={`${ctx.d.entity.singular}을(를) 고르세요`} /></SelectTrigger>
                <SelectContent>{open.map((a) => <SelectItem key={idOf(ctx, a)} value={String(idOf(ctx, a))}>{idOf(ctx, a)} · {titleOf(ctx, a)}</SelectItem>)}</SelectContent>
              </Select>
              <Err id="err-ref" msg={errs.ref} />
            </div>
            {fields.map((fl) => (
              <div key={fl.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`f-${fl.key}`}>{fl.label}</Label>
                {fl.type === 'radio' ? (
                  <RadioGroup value={vals[fl.key] ?? ''} onValueChange={set(fl.key)} className="flex gap-6" aria-describedby={`err-${fl.key}`}>
                    {fl.options?.map((o) => <div key={o} className="flex items-center gap-2"><RadioGroupItem value={o} id={`${fl.key}-${o}`} /><Label htmlFor={`${fl.key}-${o}`}>{o}</Label></div>)}
                  </RadioGroup>
                ) : fl.type === 'textarea' ? (
                  <Textarea id={`f-${fl.key}`} name={fl.key} rows={3} value={vals[fl.key] ?? ''} onChange={(e) => set(fl.key)(e.target.value)} aria-invalid={!!errs[fl.key]} aria-describedby={`err-${fl.key}`} />
                ) : (
                  <Input id={`f-${fl.key}`} name={fl.key} type={fl.type} {...(fl.type === 'number' ? { min: fl.min ?? 0, step: 1 } : {})} value={vals[fl.key] ?? ''} onChange={(e) => set(fl.key)(e.target.value)} aria-invalid={!!errs[fl.key]} aria-describedby={`err-${fl.key}`} />
                )}
                <Err id={`err-${fl.key}`} msg={errs[fl.key]} />
              </div>
            ))}
            <div><Button type="submit" disabled={saving}>{saving ? '저장 중…' : '저장'}</Button></div>
          </form>
        </WidgetCard>
        <WidgetCard title={f.historyTitle} className="@4xl/main:col-span-3">
          {recent.length ? (
            <Table>
              <TableHeader><TableRow><TableHead>시각</TableHead><TableHead>{ctx.d.entity.singular}</TableHead>{fields.map((fl) => <TableHead key={fl.key} className={fl.type === 'number' ? 'text-right' : ''}>{fl.label.replace(/\s*\(.*\)$/, '')}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {recent.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{shortTs(d.ts)}</TableCell>
                    <TableCell><a className="hover:underline" href={`#/item/${d.ref}`}>{d.ref}</a></TableCell>
                    {fields.map((fl) => <TableCell key={fl.key} className={fl.type === 'number' ? 'text-right tabular-nums' : fl.type === 'textarea' ? 'min-w-40 whitespace-normal break-words' : ''}>{d[fl.key]}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="py-8 text-center text-sm text-muted-foreground">{f.emptyHistory}</p>}
        </WidgetCard>
      </div>
      <LimitNote extra="저장한 판정은 이 컴퓨터에만 남고 다른 사람에게 공유되지 않음" />
    </>
  )
}
