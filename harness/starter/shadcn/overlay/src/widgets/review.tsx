// review.tsx — 검토 부품 R1~R8. 계산 결과를 사람이 믿고 승인할 수 있게 하는 묶음. 전부 props 로 받은 것만 그린다.
// R1 결과 비교(현재 운영 ↔ 새 결과) · R2 가장 나빠지는 건 · R3 계산에서 뺀 기록 · R4 용어 정의 · R5 출처·기준 꼬리표 · R6 비교표(행×열, 칸마다 출처) · R7 출처별 숫자 나란히 · R8 퀴즈 + 학습 경로.
// 실행 화면(#/run)은 엔진 결과에 compare · worst · excluded 가 있으면 R1~R3 를 자동으로 그린다(INTEGRATION.md 「검토 부품 연결」).
// 규칙: 평균만 보이지 않는다(가장 나쁜 건을 같이) · 뺀 것은 건수와 이유를 보인다 · 숫자마다 어떤 기준(정의·단위·기간·출처)인지 그 자리에서 확인된다.
import { useState, type ReactNode } from 'react'
import { CheckIcon, LockIcon, XIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BeforeAfter, type CompareRow } from '@/widgets/decision'

// ───────── R1 결과 비교 — 새로 계산한 결과를 지금 운영 중인 것과 나란히. 승인하는 사람은 「지금보다 무엇이 얼마나 달라지나」로 본다. 나빠지는 항목도 같은 표에 둔다.
export function ResultCompare({ rows, baseLabel = '현재 운영', nextLabel = '새 결과', note }: { rows: CompareRow[]; baseLabel?: string; nextLabel?: string; note?: string }) {
  const better = rows.filter((r) => r.better === true).length, worse = rows.filter((r) => r.better === false).length
  return (
    <div className="flex flex-col gap-2" data-result-compare>
      <p className="text-sm">{baseLabel} 대비 <span className="font-semibold tabular-nums">개선 {better}항목</span> · <span className={`tabular-nums ${worse ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>악화 {worse}항목</span>{note ? <span className="text-muted-foreground"> · {note}</span> : null}</p>
      <BeforeAfter rows={rows} beforeLabel={baseLabel} afterLabel={nextLabel} />
    </div>
  )
}

// ───────── R2 가장 나빠지는 건 — 평균은 좋아져도 누군가는 나빠진다. 가장 나쁜 건을 위에서부터, 평균과 같이 보인다. value 는 클수록 나쁜 값(대기 분·이동 시간·지연 일).
export type WorstCase = { id: string; label: string; value: number; before?: number; note?: string; href?: string }
export function WorstCases({ items, unit, average, metric, top = 5 }: { items: WorstCase[]; unit: string; average?: number; metric: string; top?: number }) {
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, top)
  if (!sorted.length) return <p className="py-6 text-center text-sm text-muted-foreground">나빠지는 건이 없습니다.</p>
  const max = sorted[0].value || 1
  return (
    <div className="flex flex-col gap-2" data-worst-cases>
      <p className="text-sm">{metric}{average !== undefined ? <> 평균 <span className="font-semibold tabular-nums">{average.toLocaleString('ko-KR')}{unit}</span> ·</> : null} 가장 나쁜 건 <span className="font-semibold tabular-nums">{sorted[0].value.toLocaleString('ko-KR')}{unit}</span></p>
      <ol className="flex flex-col gap-1">
        {sorted.map((it, i) => (
          <li key={it.id} className="relative flex items-center justify-between gap-3 overflow-hidden rounded-md px-2 py-1.5 text-sm">
            <span className="absolute inset-y-0 left-0 bg-muted" style={{ width: `${(it.value / max) * 100}%` }} aria-hidden />
            <span className="relative min-w-0 truncate"><span className="mr-2 tabular-nums text-muted-foreground">{i + 1}</span>{it.href ? <a className="hover:underline" href={it.href}>{it.label}</a> : it.label}{it.note ? <span className="ml-2 text-xs text-muted-foreground">{it.note}</span> : null}</span>
            <span className="relative shrink-0 tabular-nums">{it.before !== undefined ? <span className="mr-2 text-xs text-muted-foreground">이전 {it.before.toLocaleString('ko-KR')}{unit} →</span> : null}<span className="font-medium">{it.value.toLocaleString('ko-KR')}{unit}</span></span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ───────── R3 계산에서 뺀 기록 — 누락·이상 입력으로 계산에 넣지 않은 기록을 건수와 이유로. 0건이어도 「뺀 기록 없음」을 보인다(안 보이면 확인했는지 알 수 없다).
// label 을 바꾸면 같은 꼴을 다른 뜻으로 쓴다 — 예: label="기한을 못 맞추는 건" · noneText="모든 건이 기한 안에 들어옵니다"(못 맞추는 건과 그 이유를 따로 보일 때).
export type Excluded = { reason: string; count: number; examples?: string[] }
export function ExcludedNote({ total, groups, label = '계산에서 뺀 기록', totalLabel = '입력', noneText }: { total: number; groups: Excluded[]; label?: string; totalLabel?: string; noneText?: string }) {
  const n = groups.reduce((a, g) => a + g.count, 0)
  if (!n) return <p className="text-sm text-muted-foreground" data-excluded="0">{noneText ?? `입력 ${total.toLocaleString('ko-KR')}건 전부 계산에 넣었습니다(뺀 기록 없음).`}</p>
  return (
    <Collapsible data-excluded={n}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline" className="sk-urgent">{label} {n.toLocaleString('ko-KR')}건</Badge>
        <span className="text-muted-foreground">{totalLabel} {total.toLocaleString('ko-KR')}건 중 {((n / total) * 100).toFixed(1)}%</span>
        <CollapsibleTrigger className="text-xs underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">이유 보기</CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-2">
        <ul className="flex flex-col gap-1.5 rounded-md bg-muted p-3 text-sm">
          {groups.filter((g) => g.count).map((g) => (
            <li key={g.reason}><span className="font-medium">{g.reason}</span> <span className="tabular-nums">{g.count.toLocaleString('ko-KR')}건</span>{g.examples?.length ? <span className="text-muted-foreground"> · 예: {g.examples.slice(0, 3).join(', ')}</span> : null}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ───────── R4 용어 정의 — 화면의 지표·용어 옆에서 그 뜻과 단위·산식을 바로 본다. 부서마다 뜻이 다른 낱말(가동률·대기 시간·불량)에 붙인다.
export type TermDef = { definition: string; unit?: string; formula?: string; source?: string }
export function DefTerm({ children, def }: { children: ReactNode; def: TermDef }) {
  return (
    <Popover>
      <PopoverTrigger className="cursor-help rounded-sm underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 text-sm">
        <p>{def.definition}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {def.unit ? <><dt>단위</dt><dd className="text-foreground">{def.unit}</dd></> : null}
          {def.formula ? <><dt>산식</dt><dd className="text-foreground">{def.formula}</dd></> : null}
          {def.source ? <><dt>기준</dt><dd className="text-foreground">{def.source}</dd></> : null}
        </dl>
      </PopoverContent>
    </Popover>
  )
}

// ───────── R5 출처·기준 꼬리표 — 이 숫자가 어느 자료의 어느 기간·어느 기준 값인가. status: 확정 = 공식 발표·마감 값 · 잠정 = 속보·추정 · 환산 = 우리가 통화·기간을 맞춰 바꾼 값.
// original = 출처에 적힌 원래 값(예: 「102.3억 달러」) · steps = 우리가 한 환산 과정(순서대로) · quote = 출처 문서의 해당 문단(그대로 옮김) · where = 문서 안 위치(쪽·절).
export type Source = { name: string; period?: string; basis?: string; status?: '확정' | '잠정' | '환산'; url?: string; original?: string; steps?: string[]; quote?: string; where?: string }
export function SourceTag({ source }: { source: Source }) {
  const label = [source.name, source.period].filter(Boolean).join(' · ')
  return (
    <Popover>
      <PopoverTrigger className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`출처: ${label}`}>
        <Badge variant="outline" className={`font-normal ${source.status === '잠정' ? 'border-dashed' : source.status === '환산' ? 'sk-urgent' : 'text-muted-foreground'}`}>{source.status ? `${source.status} · ` : ''}{source.name}</Badge>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-96 w-80 overflow-y-auto text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">출처</dt><dd>{source.url ? <a className="underline underline-offset-2" href={source.url} target="_blank" rel="noreferrer">{source.name}</a> : source.name}</dd>
          {source.period ? <><dt className="text-muted-foreground">기간</dt><dd>{source.period}</dd></> : null}
          {source.basis ? <><dt className="text-muted-foreground">기준</dt><dd>{source.basis}</dd></> : null}
          {source.status ? <><dt className="text-muted-foreground">상태</dt><dd>{source.status}</dd></> : null}
          {source.original ? <><dt className="text-muted-foreground">원래 값</dt><dd className="tabular-nums">{source.original}</dd></> : null}
        </dl>
        {source.steps?.length ? <div className="mt-2"><p className="text-xs text-muted-foreground">환산 과정</p><ol className="mt-1 list-decimal pl-5 text-sm">{source.steps.map((st) => <li key={st}>{st}</li>)}</ol></div> : null}
        {source.quote ? <figure className="mt-2"><figcaption className="text-xs text-muted-foreground">출처 문서의 해당 문단{source.where ? ` · ${source.where}` : ''}</figcaption><blockquote className="mt-1 rounded-md bg-muted px-3 py-2 text-sm">{source.quote}</blockquote></figure> : null}
      </PopoverContent>
    </Popover>
  )
}

// ───────── R6 비교표 — 행(회사·설비·공급사) × 열(분기·주차·조건). 칸마다 값과 출처 꼬리표. 표 위에 「무엇을 맞췄는가」(통화·기간·정의)를 한 줄로 적는다. 값이 없으면 —.
export type MatrixCell = { value: number | null; source?: Source; note?: string }
export type MatrixRow = { key: string; label: string; cells: Record<string, MatrixCell> }
export function CompareMatrix({ columns, rows, unit, decimals = 0, aligned, highlight = 'none' }: { columns: { key: string; label: string }[]; rows: MatrixRow[]; unit: string; decimals?: number; aligned: string; highlight?: 'max' | 'min' | 'none' }) {
  const fmt = (v: number) => v.toLocaleString('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const best = (col: string) => {
    if (highlight === 'none') return null
    const vals = rows.map((r) => r.cells[col]?.value).filter((v): v is number => v !== null && v !== undefined)
    return vals.length ? (highlight === 'max' ? Math.max(...vals) : Math.min(...vals)) : null
  }
  return (
    <div className="flex flex-col gap-2" data-compare-matrix>
      <p className="text-xs text-muted-foreground">단위 {unit} · 맞춘 기준: {aligned}{highlight !== 'none' ? ` · 굵은 값 = 열에서 ${highlight === 'max' ? '가장 큰' : '가장 작은'} 값` : ''}</p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>구분</TableHead>{columns.map((c) => <TableHead key={c.key} className="text-right">{c.label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="whitespace-nowrap font-medium">{r.label}</TableCell>
                {columns.map((c) => {
                  const cell = r.cells[c.key]
                  const v = cell?.value
                  return (
                    <TableCell key={c.key} className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className={`tabular-nums ${v !== null && v !== undefined && v === best(c.key) ? 'font-semibold' : ''}`}>{v === null || v === undefined ? '—' : fmt(v)}</span>
                        {cell?.source ? <SourceTag source={cell.source} /> : null}
                        {cell?.note ? <span className="text-xs text-muted-foreground">{cell.note}</span> : null}
                      </div>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ───────── R7 출처별 숫자 나란히 — 같은 지표를 자료마다 다르게 말할 때 하나로 뭉개지 않고 나란히 둔다. 범위(최소~최대)와 벌어진 정도를 같이 보인다.
export type SourcedValue = { value: number; source: Source; note?: string }
export function SourceBoard({ metric, unit, values, decimals = 0 }: { metric: string; unit: string; values: SourcedValue[]; decimals?: number }) {
  if (!values.length) return <p className="py-6 text-center text-sm text-muted-foreground">비교할 출처가 없습니다.</p>
  const fmt = (v: number) => v.toLocaleString('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const lo = Math.min(...values.map((v) => v.value)), hi = Math.max(...values.map((v) => v.value))
  const spread = lo ? ((hi - lo) / lo) * 100 : 0
  return (
    <div className="flex flex-col gap-3" data-source-board>
      <p className="text-sm">{metric}: 출처 {values.length}곳의 값이 <span className="font-semibold tabular-nums">{fmt(lo)}~{fmt(hi)}{unit}</span> 로 갈립니다 <span className="text-muted-foreground">(가장 작은 값 대비 {spread.toFixed(0)}% 차이)</span></p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[...values].sort((a, b) => b.value - a.value).map((v) => (
          <li key={`${v.source.name}-${v.source.period ?? ''}`} className="flex flex-col gap-1.5 rounded-lg border p-3">
            <span className="text-xl font-semibold tabular-nums">{fmt(v.value)}<span className="ml-0.5 text-sm font-normal text-muted-foreground">{unit}</span></span>
            <SourceTag source={v.source} />
            {v.note ? <span className="text-xs text-muted-foreground">{v.note}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ───────── R8 퀴즈 + 학습 경로 — 이해도 확인. 문항마다 정답과 해설을 채점 뒤에 보이고, 결과(맞힌 수·틀린 문항의 주제)를 onDone 으로 넘긴다.
export type QuizQuestion = { id: string; text: string; choices: string[]; answer: number; explain: string; topic?: string }
export type QuizResult = { score: number; total: number; wrongTopics: string[]; answers: Record<string, number> }
export function Quiz({ questions, onDone }: { questions: QuizQuestion[]; onDone?: (r: QuizResult) => void }) {
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [graded, setGraded] = useState(false)
  const [error, setError] = useState('')
  const score = questions.filter((q) => answers[q.id] === q.answer).length
  const wrongTopics = [...new Set(questions.filter((q) => answers[q.id] !== q.answer).map((q) => q.topic ?? q.text))]
  const grade = () => {
    const missing = questions.filter((q) => answers[q.id] === undefined).length
    if (missing) { setError(`아직 고르지 않은 문항이 ${missing}개 있습니다.`); return }
    setError(''); setGraded(true)
    onDone?.({ score, total: questions.length, wrongTopics, answers })
  }
  return (
    <div className="flex flex-col gap-5" data-quiz>
      {questions.map((q, qi) => (
        <fieldset key={q.id} className="flex flex-col gap-2">
          <legend className="text-sm font-medium"><span className="mr-2 tabular-nums text-muted-foreground">{qi + 1}</span>{q.text}</legend>
          <div className="flex flex-col gap-1.5">
            {q.choices.map((c, ci) => {
              const picked = answers[q.id] === ci, right = graded && ci === q.answer, wrong = graded && picked && ci !== q.answer
              return (
                <label key={ci} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${right ? 'border-primary bg-muted' : wrong ? 'border-destructive' : picked ? 'bg-muted/60' : 'hover:bg-muted/40'}`}>
                  <input type="radio" name={q.id} checked={picked} disabled={graded} onChange={() => { setAnswers({ ...answers, [q.id]: ci }); setError('') }} className="accent-primary" />
                  <span className="flex-1">{c}</span>
                  {right ? <span className="flex items-center gap-1 text-xs font-medium"><CheckIcon className="size-3.5" />정답</span> : wrong ? <span className="flex items-center gap-1 text-xs text-destructive"><XIcon className="size-3.5" />내 답</span> : null}
                </label>
              )
            })}
          </div>
          {graded ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">해설: {q.explain}</p> : null}
        </fieldset>
      ))}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {graded ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm" role="status" data-quiz-result>
          <span className="font-semibold tabular-nums">{questions.length}문항 중 {score}문항 맞힘</span>
          {wrongTopics.length ? <span className="text-muted-foreground">다시 볼 주제: {wrongTopics.join(' · ')}</span> : <span className="text-muted-foreground">모두 맞혔습니다.</span>}
          <Button variant="outline" size="sm" onClick={() => { setAnswers({}); setGraded(false) }}>다시 풀기</Button>
        </div>
      ) : <div><Button onClick={grade}>채점</Button></div>}
    </div>
  )
}
// 학습 경로 — 순서가 있는 학습 단계. done = 마친 단계, current = 지금 할 단계, 그 뒤는 잠김. 수준·직군에 따라 steps 를 달리 넘긴다.
// reason = 왜 이 단계가 이 자리에 있는가(먼저 알아야 하는 것 · 약한 부분이라서 등) — 있으면 요약 아래에 보인다.
export type PathStep = { key: string; title: string; summary: string; minutes?: number; score?: string; reason?: string }
export function LearningPath({ steps, doneKeys, onOpen }: { steps: PathStep[]; doneKeys: string[]; onOpen?: (key: string) => void }) {
  const firstTodo = steps.findIndex((s) => !doneKeys.includes(s.key))
  return (
    <ol className="flex flex-col" data-learning-path aria-label={`학습 경로 · ${steps.length}단계 중 ${doneKeys.length}단계 완료`}>
      {steps.map((s, i) => {
        const done = doneKeys.includes(s.key), current = i === firstTodo, locked = !done && !current
        return (
          <li key={s.key} className="flex gap-3 pb-4 last:pb-0">
            <div className="flex flex-col items-center">
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums ${done ? 'border-primary bg-primary text-primary-foreground' : current ? 'border-primary font-semibold' : 'text-muted-foreground'}`}>{done ? <CheckIcon className="size-4" /> : locked ? <LockIcon className="size-3.5" /> : i + 1}</span>
              {i < steps.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" aria-hidden /> : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`text-sm ${current ? 'font-semibold' : locked ? 'text-muted-foreground' : 'font-medium'}`}>{s.title}<span className="ml-2 text-xs font-normal text-muted-foreground">{done ? `완료${s.score ? ` · ${s.score}` : ''}` : current ? '지금 할 단계' : '앞 단계를 마치면 열림'}{s.minutes ? ` · ${s.minutes}분` : ''}</span></p>
                <p className="text-sm text-muted-foreground">{s.summary}</p>
                {s.reason ? <p className="mt-0.5 text-xs text-muted-foreground"><span className="font-medium text-foreground">이 순서인 이유</span> {s.reason}</p> : null}
              </div>
              {!locked ? <Button variant={current ? 'default' : 'outline'} size="sm" onClick={() => onOpen?.(s.key)}>{done ? '다시 보기' : '시작'}</Button> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
