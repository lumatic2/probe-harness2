// ⑧ AI 기능 #/assist — 질문 → 답변(글, 선택으로 녹음) → 피드백. 판정은 규칙 코드가 정하는 고정 라벨(같은 답변이면 같은 판정), 개선 제안만 AI(/api/assist).
// 서버에 키가 있으면 OpenAI, 없거나 실패하면 「모의 응답」 — 어느 쪽인지 화면에 표시한다. 판정 계산은 src/domain/assist.mjs (설정: domain.json 의 assist).
import { useMemo, useRef, useState } from 'react'
import { LimitNote } from '@/components/page-parts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { judgeAnswer, segments, type Judgement } from '@/domain/assist.mjs'
import { colLabel, ctx, display, idOf } from '@/lib/derive'
import { Empty, ToneBadge, WidgetCard } from '@/widgets/panel'
import { Recorder } from '@/widgets/recorder'

type Suggestion = { state: 'loading' } | { state: 'done'; text: string; source: 'openai' | 'mock'; reason?: string } | { state: 'error'; message: string }
type Result = { qid: string; answer: string; judgement: Judgement; ai: Suggestion }
const ALL = '__all'
const REASON: Record<string, string> = { timeout: '시간 초과', network: '연결 실패', empty: '빈 응답' }
const reasonText = (r?: string) => (!r || r === 'no-key' ? '' : r.startsWith('http-') ? `응답 오류 ${r.slice(5)}` : REASON[r] ?? r)

export default function Assist() {
  const cfg = ctx.d.assist
  const sets: string[] = useMemo(() => [...new Set(ctx.rows.map((r) => String(r[cfg.setCol])))], [cfg])
  const [set, setSet] = useState(ALL)
  const list = ctx.rows.filter((r) => set === ALL || r[cfg.setCol] === set)
  const [qid, setQid] = useState(String(idOf(ctx, ctx.rows[0])))
  const row = ctx.rows.find((r) => String(idOf(ctx, r)) === qid) ?? ctx.rows[0]
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const seq = useRef(0)

  // 녹음·전사(W18) — 전사가 끝나면 답변 칸에 글이 들어가고 사용자가 고친 뒤 피드백을 받는다. 키가 없으면 모의 전사.
  const [recKey, setRecKey] = useState(0)
  const pick = (id: string) => { setQid(id); setAnswer(''); setResult(null); setRecKey((k) => k + 1) }

  const submit = async () => {
    const judgement = judgeAnswer(cfg, row, answer)
    const my = ++seq.current
    setResult({ qid, answer, judgement, ai: { state: 'loading' } })
    try {
      const res = await fetch('/api/assist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: row[cfg.questionCol], answer, code: judgement.code, terms: judgement.terms, sentences: judgement.sentences.filter((s) => s.terms.length).map((s) => s.text), minChars: cfg.minChars }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const j = await res.json()
      if (my === seq.current) setResult((r) => r && { ...r, ai: { state: 'done', text: j.suggestion, source: j.source, reason: j.reason } })
    } catch (e) {
      if (my === seq.current) setResult((r) => r && { ...r, ai: { state: 'error', message: `개선 제안을 불러오지 못했습니다(${(e as Error).message}). 판정은 그대로 유효합니다.` } })
    }
  }

  const j = result?.judgement
  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-12">
        <WidgetCard title="질문 목록" sub={`${list.length}${ctx.d.entity.unit}`} className="@4xl/main:col-span-4">
          <div className="flex flex-col gap-3">
            <Select value={set} onValueChange={setSet}>
              <SelectTrigger size="sm" className="w-full" aria-label={colLabel(ctx, cfg.setCol)}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>{colLabel(ctx, cfg.setCol)} 전체</SelectItem>{sets.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <div className="max-h-[30rem] overflow-y-auto rounded-lg border" data-question-list>
              <Table>
                <TableHeader><TableRow><TableHead>{ctx.d.entity.idLabel}</TableHead><TableHead>{colLabel(ctx, cfg.questionCol)}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {list.map((r) => {
                    const id = String(idOf(ctx, r))
                    return (
                      <TableRow key={id} className="cursor-pointer" data-state={id === qid ? 'selected' : undefined} data-q={id} onClick={() => pick(id)}>
                        <TableCell className="w-20 whitespace-nowrap">{id}</TableCell>
                        <TableCell className="min-w-32 whitespace-normal"><span className="line-clamp-2">{r[cfg.questionCol]}</span></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title={row[cfg.questionCol]} sub={`${idOf(ctx, row)} · ${display(ctx, cfg.setCol, row[cfg.setCol])}${cfg.limitCol ? ` · 권장 ${row[cfg.limitCol]}초` : ''}`} className="@4xl/main:col-span-4">
          <div className="flex flex-col gap-3">
            <Textarea aria-label="답변" rows={8} placeholder={cfg.placeholder} value={answer} onChange={(e) => setAnswer(e.target.value)} data-answer />
            <div data-record><Recorder key={recKey} text={false} onText={(t) => setAnswer(t)} /></div>
            <div className="flex items-center gap-3">
              <Button onClick={submit} disabled={!answer.trim()} data-submit>{cfg.startLabel}</Button>
              <span className="text-xs tabular-nums text-muted-foreground">{answer.trim().length}자</span>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="피드백" className="@4xl/main:col-span-4">
          {result && j ? (
            <div className="flex flex-col gap-4" data-feedback={j.code}>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">판정</span>
                  <ToneBadge text={j.label} tone={j.code === 'risk' ? 'urgent' : j.code === 'short' ? 'warn' : 'plain'} />
                </div>
                <p className="text-sm" data-judge-message>{j.message}</p>
              </div>
              {j.sentences.length ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">답변 문장 · 표시 {j.count}곳</span>
                  <p className="text-sm leading-relaxed" data-evidence>
                    {j.sentences.map((s, i) => (
                      <span key={i} data-hit={s.terms.length ? 'true' : undefined} className={s.terms.length ? 'rounded-sm bg-[#fff1e6] px-0.5' : ''}>
                        {segments(s.text, s.terms).map((p, k) => (p.mark ? <strong key={k} className="font-semibold">{p.text}</strong> : <span key={k}>{p.text}</span>))}{' '}
                      </span>
                    ))}
                  </p>
                </div>
              ) : null}
              <Separator />
              <div className="flex flex-col gap-2" data-suggestion>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">개선 제안</span>
                  <Badge variant="outline">AI 제안</Badge>
                  {result.ai.state === 'done' && result.ai.source === 'mock' ? <Badge variant="secondary" data-mock>모의 응답</Badge> : null}
                </div>
                {result.ai.state === 'loading' ? <p className="text-sm text-muted-foreground">AI 제안을 불러오는 중…</p> : null}
                {result.ai.state === 'done' ? <p className="text-sm leading-relaxed">{result.ai.text}</p> : null}
                {result.ai.state === 'done' && result.ai.source === 'mock' && reasonText(result.ai.reason) ? <p className="text-xs text-muted-foreground">OpenAI 호출 실패({reasonText(result.ai.reason)}) — 모의 응답으로 대신함</p> : null}
                {result.ai.state === 'error' ? <p role="alert" className="text-sm text-destructive">{result.ai.message}</p> : null}
              </div>
            </div>
          ) : <Empty>아직 피드백이 없습니다.</Empty>}
        </WidgetCard>
      </div>
      <LimitNote extra="녹음은 「텍스트로 바꾸기」를 눌렀을 때만 전사 서버로 보내고 저장하지 않음" />
    </>
  )
}
