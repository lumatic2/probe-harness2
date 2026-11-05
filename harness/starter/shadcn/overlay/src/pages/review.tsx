// ⑦ 문서 검토 #/review — 왼쪽 목록(신뢰도 낮은 순 · 불확실 큐 · 신뢰도 필터), 오른쪽 본문 미리보기 + 분류 태그(여러 개) 편집 + 판정 사유 저장.
// 계산은 src/domain/review.mjs (설정: domain.json 의 review). 저장은 /api/review-<도메인> 에 {문서ID: {tags, reason, status, ts, who}}.
import { useEffect, useMemo, useState } from 'react'
import { XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { LimitNote } from '@/components/page-parts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { addTag, isUncertain, makeRecord, removeTag, reviewCounts, reviewList, tagChoices, tagsOf, validateReview, type ReviewSaved } from '@/domain/review.mjs'
import { colLabel, ctx, display, domainName, idOf, tone, titleOf } from '@/lib/derive'
import { useStore } from '@/lib/store'
import { Empty, ToneBadge, WidgetCard } from '@/widgets/panel'

const pad = (n: number) => String(n).padStart(2, '0')
const nowTs = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
const MIN_ALL = '__all'

export default function Review() {
  const cfg = ctx.d.review
  const { data: saved, save } = useStore<ReviewSaved>(`review-${domainName}`, {})
  const [filter, setFilter] = useState<'all' | 'uncertain' | 'done'>('uncertain')
  const [minConf, setMinConf] = useState(MIN_ALL)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [errs, setErrs] = useState<{ tags?: string; reason?: string }>({})
  const [saving, setSaving] = useState(false)

  const counts = reviewCounts(ctx, saved)
  const list = useMemo(() => reviewList(ctx, saved, { filter, minConf: minConf === MIN_ALL ? null : Number(minConf), q }), [saved, filter, minConf, q])
  const row = list.find((r) => String(idOf(ctx, r)) === selected) ?? ctx.rows.find((r) => String(idOf(ctx, r)) === selected)
  const merged = row ? { ...row, [cfg.tagsCol]: saved[selected]?.tags ?? row[cfg.tagsCol], [cfg.statusCol]: saved[selected]?.status ?? row[cfg.statusCol] } : undefined

  // 처음에는 목록 맨 위(가장 불확실한 문서)를 연다
  useEffect(() => { if (!selected && list.length) setSelected(String(idOf(ctx, list[0]))) }, [list, selected])
  // 문서를 바꾸면 그 문서의 저장값(없으면 원래 분류)을 편집 칸에 올린다
  useEffect(() => {
    if (!selected) return
    const r = ctx.rows.find((x) => String(idOf(ctx, x)) === selected)
    setTags(saved[selected]?.tags ?? (r ? tagsOf(cfg, r) : []))
    setReason(saved[selected]?.reason ?? '')
    setErrs({})
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const e = validateReview(cfg, tags, reason)
    setErrs(e)
    if (Object.keys(e).length) { toast.error('입력을 확인하세요', { description: Object.values(e)[0] }); return }
    setSaving(true)
    try {
      await save({ ...saved, [selected]: makeRecord(cfg, tags, reason, nowTs()) })
      toast.success('저장됨', { description: `${selected} · ${tags.join(', ')}` })
    } catch (err) {
      toast.error('저장하지 못했습니다', { description: `${(err as Error).message} — 서버가 켜져 있는지 확인하세요.` })
    } finally { setSaving(false) }
  }

  const conf = merged ? Number(merged[cfg.confCol]) : 0
  const choices = tagChoices(cfg, tags)
  const tabs: [typeof filter, string, number][] = [['all', '전체', counts.all], ['uncertain', '불확실', counts.uncertain], ['done', cfg.doneValue, counts.done]]

  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-5">
        <WidgetCard title="문서 목록" sub={`${list.length}건 · 신뢰도 낮은 순`} className="@4xl/main:col-span-2">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(v) => v && setFilter(v as typeof filter)} aria-label="목록 보기">
                {tabs.map(([k, label, n]) => <ToggleGroupItem key={k} value={k} className="px-3" data-filter={k}>{label} {n}</ToggleGroupItem>)}
              </ToggleGroup>
              <Select value={minConf} onValueChange={setMinConf}>
                <SelectTrigger size="sm" className="w-36" aria-label="신뢰도 필터"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={MIN_ALL}>신뢰도 전체</SelectItem>
                  {[50, 70, 90].map((n) => <SelectItem key={n} value={String(n)}>신뢰도 {n}% 이상</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input type="search" aria-label="검색" placeholder={ctx.d.entity.searchHint} className="h-8" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-[30rem] overflow-y-auto rounded-lg border" data-review-list>
              <Table>
                <TableHeader><TableRow>{cfg.listCols.map((k: string) => <TableHead key={k}>{colLabel(ctx, k)}</TableHead>)}<TableHead className="text-right">신뢰도</TableHead></TableRow></TableHeader>
                <TableBody>
                  {list.length ? list.map((r) => {
                    const id = String(idOf(ctx, r))
                    return (
                      <TableRow key={id} className="cursor-pointer" data-state={selected === id ? 'selected' : undefined} data-doc={id} onClick={() => setSelected(id)}>
                        {cfg.listCols.map((k: string, i: number) => <TableCell key={k} className={i === 0 ? 'w-20 whitespace-nowrap' : 'min-w-32 whitespace-normal'}>{i === 0 ? display(ctx, k, r[k]) : <span className="line-clamp-2">{display(ctx, k, r[k])}</span>}</TableCell>)}
                        <TableCell className="text-right tabular-nums">{r[cfg.confCol]}%</TableCell>
                      </TableRow>
                    )
                  }) : <TableRow><TableCell colSpan={cfg.listCols.length + 1} className="py-8 text-center text-muted-foreground">조건에 맞는 문서가 없습니다.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title={merged ? titleOf(ctx, merged) : '문서'} sub={merged ? [idOf(ctx, merged), ...cfg.metaCols.map((k: string) => display(ctx, k, merged[k]))].join(' · ') : undefined} className="@4xl/main:col-span-3">
          {merged ? (
            <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-review-form>
              <div className="max-h-56 overflow-y-auto rounded-lg bg-muted/50 p-3 text-sm leading-relaxed whitespace-pre-wrap" data-review-body>{merged[cfg.bodyCol]}</div>

              <div className="flex flex-col gap-2">
                <Label>신뢰도</Label>
                <div className="flex items-center gap-3">
                  <Progress value={conf} className="w-48" aria-label={`신뢰도 ${conf}%`} />
                  <span className="text-sm tabular-nums" data-conf>{conf}%</span>
                  {isUncertain(cfg, merged) ? <ToneBadge text="불확실" tone="urgent" /> : null}
                  <ToneBadge text={merged[cfg.statusCol]} tone={tone(ctx, cfg.statusCol, merged[cfg.statusCol])} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>{colLabel(ctx, cfg.tagsCol)}</Label>
                <div className="flex flex-wrap items-center gap-2" data-tags>
                  {tags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1 pr-1" data-tag={t}>{t}<Button type="button" variant="ghost" className="size-4 rounded-full p-0 hover:bg-foreground/10" aria-label={`${t} 분류 삭제`} onClick={() => { setTags((x) => removeTag(x, t)); setErrs((x) => ({ ...x, tags: undefined })) }}><XIcon className="size-3" /></Button></Badge>
                  ))}
                  {!tags.length ? <span className="text-sm text-muted-foreground">분류 없음</span> : null}
                  <Select value="" onValueChange={(v) => { if (v) { setTags((x) => addTag(x, v)); setErrs((x) => ({ ...x, tags: undefined })) } }}>
                    <SelectTrigger size="sm" className="w-36" aria-label="분류 추가" data-add-tag><SelectValue placeholder="분류 추가" /></SelectTrigger>
                    <SelectContent>{choices.length ? choices.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>) : <div className="px-2 py-1.5 text-sm text-muted-foreground">추가할 분류가 없습니다.</div>}</SelectContent>
                  </Select>
                </div>
                <p role="alert" className="min-h-4 text-xs text-destructive">{errs.tags}</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="r-reason">{cfg.reasonLabel}</Label>
                <Textarea id="r-reason" rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setErrs((x) => ({ ...x, reason: undefined })) }} aria-invalid={!!errs.reason} />
                <p role="alert" className="min-h-4 text-xs text-destructive">{errs.reason}</p>
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={saving}>{saving ? '저장 중…' : cfg.saveLabel}</Button>
                {saved[selected] ? <span className="text-xs text-muted-foreground" data-saved>저장됨 {saved[selected].ts.slice(5, 16).replace('T', ' ')} · {saved[selected].who}</span> : null}
              </div>
            </form>
          ) : <Empty>선택된 문서 없음</Empty>}
        </WidgetCard>
      </div>
      <LimitNote extra="분류와 판정 사유는 이 컴퓨터에만 저장되고 원본 데이터는 그대로" />
    </>
  )
}
