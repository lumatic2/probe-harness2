// decision.tsx — 결정 부품 D1~D5. 「AI 가 제안하고, 사람이 최종 판단한다」를 화면에 보이게 하는 묶음.
// D1 근거 꼬리표 · D2 현행→제안 비교 · D3 거친 단계 · D4 결정 바(기본 승인·수정·반려 — options 로 과제의 말로 바꾼다) · D5 결정 기록.
// 전부 props 로 받은 것만 그린다. 저장은 onDecide 를 받은 쪽이 한다(스타터에서는 form → saveDecision → decisions API, INTEGRATION-화면.md 「결정 부품 연결」).
// 규칙: 숫자에는 근거 종류(측정·예측·가정)를 붙인다 · 반려와 수정에는 사유를 받는다 · 성공 표시는 저장이 끝난 뒤에만 · 색만으로 구분하지 않고 글자를 같이 쓴다.
import { useId, useState, type ReactNode } from 'react'
import { ArrowRightIcon, CheckIcon, CircleAlertIcon, CircleDashedIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Reveal, useFreshIds } from '@/widgets/parts'

// ───────── D1 근거 꼬리표 — 이 숫자가 어디서 왔는가. measured = 실제 데이터로 잰 값 · predicted = 모델·계산이 낸 값 · assumed = 사람이 둔 가정.
export type EvidenceKind = 'measured' | 'predicted' | 'assumed'
const EVIDENCE: Record<EvidenceKind, { label: string; cls: string }> = {
  measured: { label: '측정', cls: '' },
  predicted: { label: '예측', cls: 'sk-urgent' },
  assumed: { label: '가정', cls: 'border-dashed text-muted-foreground' },
}
export function EvidenceTag({ kind, note }: { kind: EvidenceKind; note?: string }) {
  return <Badge variant="outline" className={EVIDENCE[kind].cls} title={note}>{EVIDENCE[kind].label}</Badge>
}
// 숫자 하나 + 꼬리표 + 근거 한 줄. value 는 이미 단위·콤마까지 만든 글자.
export function EvidenceFigure({ label, value, unit, kind, basis }: { label: string; value: string; unit?: string; kind: EvidenceKind; basis: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">{label}<EvidenceTag kind={kind} /></div>
      <div className="text-2xl font-semibold tabular-nums">{value}{unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span> : null}</div>
      <div className="text-xs text-muted-foreground">{basis}</div>
    </div>
  )
}

// ───────── D2 현행 → 제안 비교 — 바뀌는 항목만 줄로. better = 그 변화가 개선인가(색이 아니라 「개선/악화」 글자로 말한다).
export type CompareRow = { label: string; before: string; after: string; delta?: string; better?: boolean; kind?: EvidenceKind }
export function BeforeAfter({ rows, beforeLabel = '현행', afterLabel = '제안' }: { rows: CompareRow[]; beforeLabel?: string; afterLabel?: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>항목</TableHead><TableHead className="text-right">{beforeLabel}</TableHead><TableHead aria-hidden className="w-6" /><TableHead className="text-right">{afterLabel}</TableHead><TableHead>변화</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.label}>
            <TableCell>{r.label}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{r.before}</TableCell>
            <TableCell aria-hidden><ArrowRightIcon className="size-3.5 text-muted-foreground" /></TableCell>
            <TableCell className="text-right font-medium tabular-nums">{r.after}</TableCell>
            <TableCell>
              <span className="flex items-center gap-2 text-sm">
                {r.delta ? <span className={`tabular-nums ${r.better === false ? 'text-destructive' : ''}`}>{r.delta}{r.better === undefined ? '' : r.better ? ' 개선' : ' 악화'}</span> : null}
                {r.kind ? <EvidenceTag kind={r.kind} /> : null}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ───────── D3 거친 단계 — 제안이 나오기까지 무엇을 읽고 어떻게 계산했는가. who 로 솔버·AI·규칙을 구분해 「AI 가 한 일」의 범위를 보인다.
export type TraceStep = { title: string; who: '데이터' | '규칙' | '솔버' | 'AI' | '사람'; status: 'done' | 'warn' | 'skipped'; summary: string; detail?: ReactNode }
const STATUS: Record<TraceStep['status'], { label: string; icon: ReactNode }> = {
  done: { label: '완료', icon: <CheckIcon className="size-3.5" /> },
  warn: { label: '확인 필요', icon: <CircleAlertIcon className="size-3.5" /> },
  skipped: { label: '건너뜀', icon: <CircleDashedIcon className="size-3.5" /> },
}
export function TraceSteps({ steps }: { steps: TraceStep[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3 pb-4 last:pb-0">
          <div className="flex flex-col items-center">
            <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums ${s.status === 'warn' ? 'sk-urgent' : s.status === 'skipped' ? 'text-muted-foreground' : ''}`}>{i + 1}</span>
            {i < steps.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" aria-hidden /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{s.title}</span>
              <Badge variant="secondary">{s.who}</Badge>
              <span className={`inline-flex items-center gap-1 text-xs ${s.status === 'warn' ? 'font-medium' : 'text-muted-foreground'}`}>{STATUS[s.status].icon}{STATUS[s.status].label}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{s.summary}</p>
            {s.detail ? (
              <Collapsible>
                <CollapsibleTrigger className="mt-1 text-xs underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">자세히</CollapsibleTrigger>
                <CollapsibleContent className="mt-2 rounded-md bg-muted p-3 text-sm">{s.detail}</CollapsibleContent>
              </Collapsible>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

// ───────── D4 결정 바 — 제안 한 건에 대해 사람이 승인·수정·반려를 고른다. 수정·반려는 사유가 필수. onDecide 가 끝나야(await) 결과를 보인다.
// 판정 선택지는 과제의 말로 바꾼다 — options 에 넘긴다(예: 통과·재작업·보류 / 승인·조건부 승인·반려 / 출하·보류·폐기). needReason = 사유 필수, tone 'urgent' = 기록에서 주황 배지.
export type Verdict = string
export type VerdictOption = { value: string; label: string; needReason?: boolean; tone?: 'ok' | 'urgent' }
export const DEFAULT_VERDICTS: VerdictOption[] = [{ value: 'approve', label: '승인', tone: 'ok' }, { value: 'revise', label: '수정', needReason: true }, { value: 'reject', label: '반려', needReason: true, tone: 'urgent' }]
export type Decision = { verdict: Verdict; reason: string }
const labelOf = (options: VerdictOption[], v: string) => options.find((o) => o.value === v)?.label ?? v
export function DecisionBar({ proposal, confidence, basis, onDecide, canDecide = true, decided, options = DEFAULT_VERDICTS, sourceLabel = 'AI 제안', extra, onReopen }: {
  proposal: string            // AI·솔버가 낸 제안 한 문장
  confidence?: string         // 「높음 · 근거 3건 일치」 같은 글자(숫자만 두지 않는다)
  basis?: ReactNode           // 근거(접힘 안에 넣을 내용 — 표·TraceSteps·BeforeAfter)
  onDecide: (d: Decision) => Promise<void>
  canDecide?: boolean         // 쓰기 권한(auth 의 canWrite) — 없으면 보기만
  decided?: { verdict: Verdict; by: string; at: string; reason?: string } | null // 이미 결정된 건
  options?: VerdictOption[]   // 판정 선택지(기본 승인·수정·반려)
  sourceLabel?: string        // 제안을 낸 쪽의 이름: 'AI 제안'(기본) · '규칙 제안' · '솔버 제안'. 누가 낸 제안인지 속이지 않는다
  extra?: ReactNode           // 결정과 같이 받아야 하는 칸(조치 소요 시간 등). 값은 넘기는 쪽이 들고 있다가 onDecide 에서 같이 저장한다
  onReopen?: () => void       // 주면 결정된 뒤에 「다시 결정」 버튼이 생긴다(결정을 고칠 수 있는 업무에서만)
}) {
  const [verdict, setVerdict] = useState<Verdict | ''>('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const id = useId()
  const needReason = !!options.find((o) => o.value === verdict)?.needReason
  const names = options.map((o) => o.label).join('·')
  const submit = async () => {
    if (!verdict) { setError(`${names} 중 하나를 고르세요.`); return }
    if (needReason && !reason.trim()) { setError(`${labelOf(options, verdict)} 사유를 적어 주세요.`); return }
    setPending(true); setError('')
    try { await onDecide({ verdict, reason: reason.trim() }) }
    catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다. 입력은 그대로 있습니다.') }
    finally { setPending(false) }
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4" data-decision-bar>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{sourceLabel}</Badge>
        {confidence ? <span className="text-xs text-muted-foreground">신뢰도: {confidence}</span> : null}
      </div>
      <p className="text-sm font-medium">{proposal}</p>
      {basis ? (
        <Collapsible>
          <CollapsibleTrigger className="text-xs underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">근거 보기</CollapsibleTrigger>
          <CollapsibleContent className="mt-2">{basis}</CollapsibleContent>
        </Collapsible>
      ) : null}
      <div className="border-t pt-3">
        {decided ? (
          <div className="flex flex-wrap items-center gap-3"><p className="text-sm"><span className="font-semibold">사람의 결정: {labelOf(options, decided.verdict)}</span><span className="text-muted-foreground"> · {decided.by} · {decided.at}{decided.reason ? ` · 사유: ${decided.reason}` : ''}</span></p>{onReopen && canDecide ? <Button variant="outline" size="sm" onClick={onReopen}>다시 결정</Button> : null}</div>
        ) : !canDecide ? (
          <p className="text-sm text-muted-foreground">결정은 쓰기 권한이 있는 계정만 할 수 있습니다. 지금은 제안과 근거만 볼 수 있습니다.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold">사람의 결정</span>
              <ToggleGroup type="single" variant="outline" value={verdict} onValueChange={(v) => { setVerdict(v as Verdict | ''); setError('') }} aria-label="결정">
                {options.map((o) => <ToggleGroupItem key={o.value} value={o.value}>{o.label}</ToggleGroupItem>)}
              </ToggleGroup>
            </div>
            <Reveal open={!!verdict}>
              <div className="flex flex-col gap-3 p-0.5">
              {extra}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-reason`}>{verdict && needReason ? `${labelOf(options, verdict)} 사유 (필수)` : '메모 (선택)'}</Label>
                <Textarea id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} aria-invalid={!!error && needReason && !reason.trim()} placeholder={needReason ? '왜 이렇게 결정하는지, 무엇을 바꿔 적용하는지' : ''} />
              </div>
              </div>
            </Reveal>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <div><Button onClick={submit} disabled={pending}>{pending ? '저장 중…' : '결정 저장'}</Button></div>
          </div>
        )}
      </div>
    </div>
  )
}

// ───────── D5 결정 기록 — 누가 언제 무엇을 어떻게 결정했는가. 고치거나 지우는 버튼이 없다(기록은 쌓이기만 한다).
export type AuditEntry = { id: string; at: string; by: string; target: string; verdict: Verdict; reason?: string; proposal?: string }
export function AuditLog({ entries, empty = '아직 결정 기록이 없습니다.', options = DEFAULT_VERDICTS }: { entries: AuditEntry[]; empty?: string; options?: VerdictOption[] }) {
  const [only, setOnly] = useState<Verdict | 'all'>('all')
  const shown = only === 'all' ? entries : entries.filter((e) => e.verdict === only)
  const count = (v: Verdict) => entries.filter((e) => e.verdict === v).length
  const fresh = useFreshIds(entries.map((e) => e.id)) // 방금 쌓인 기록은 한 번 옅게 강조된다
  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup type="single" variant="outline" size="sm" value={only} onValueChange={(v) => v && setOnly(v as Verdict | 'all')} aria-label="결정 종류로 거르기" className="self-start">
        <ToggleGroupItem value="all">전체 {entries.length}</ToggleGroupItem>
        {options.map((o) => <ToggleGroupItem key={o.value} value={o.value}>{o.label} {count(o.value)}</ToggleGroupItem>)}
      </ToggleGroup>
      {shown.length ? (
        <div className="overflow-x-auto">
          <Table className="table-fixed" style={{ minWidth: 640 }}>{/* 열 폭 고정 — 거르기를 바꿔도 열이 움직이지 않는다 */}
            <TableHeader><TableRow><TableHead className="w-28">시각</TableHead><TableHead className="w-28">결정한 사람</TableHead><TableHead className="w-28">대상</TableHead><TableHead className="w-20">결정</TableHead><TableHead>사유·제안</TableHead></TableRow></TableHeader>
            <TableBody>
              {shown.map((e) => (
                <TableRow key={e.id} className={fresh.has(e.id) ? 'sk-flash' : ''}>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{e.at}</TableCell>
                  <TableCell className="whitespace-nowrap">{e.by}</TableCell>
                  <TableCell className="whitespace-nowrap">{e.target}</TableCell>
                  <TableCell><Badge variant={options.find((o) => o.value === e.verdict)?.tone === 'ok' ? 'secondary' : 'outline'} className={options.find((o) => o.value === e.verdict)?.tone === 'urgent' ? 'sk-urgent' : ''}>{labelOf(options, e.verdict)}</Badge></TableCell>
                  <TableCell className="whitespace-normal text-sm">{e.reason || <span className="text-muted-foreground">—</span>}{e.proposal ? <div className="text-xs text-muted-foreground">제안: {e.proposal}</div> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : <p className="py-6 text-center text-sm text-muted-foreground">{entries.length ? '이 종류의 결정이 없습니다.' : empty}</p>}
    </div>
  )
}
