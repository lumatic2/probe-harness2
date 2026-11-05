// ⑪ 실행 #/run — 조건(계획 기간·정원·여유 시간 같은 값)을 넣고 「실행」 → 진행 막대·단계 → 결과 요약 → 「JSON 내보내기」. 엔진은 server/engine.mjs(계약은 server/run.mjs 머리 주석).
// 조건 칸은 도메인 설정 run.params: [{key, label, type:'number'|'enum', default, unit?, min?, max?, step?, options?:[...]}] 에서 온다. 적용 데이터셋이 결과보다 새로우면 「재생성 필요」.
// 결과 result.graph 가 있으면 노드 그래프 화면(#/graph)이 그것을 그린다. 내보내기 모양은 과제 출력 계약대로 exportShape() 를 바꾼다(리포트 화면의 JSON 내보내기는 목록 행용이라 별개 — 출력 계약이 결과 파일 하나를 요구하면 이쪽만 쓴다).
// 조건 값의 min·max 는 화면이 검사하고 서버(run.mjs)는 그대로 엔진에 넘긴다 — 엔진이 다시 검사해 throw 하면 실패 메시지로 뜬다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { DownloadIcon, PlayIcon, TriangleAlertIcon } from 'lucide-react'
import { toast } from 'sonner'
import { LimitNote } from '@/components/page-parts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/lib/auth'
import { ctx } from '@/lib/derive'
import { downloadJson } from '@/lib/download'
import { CurrentDatasetBadge } from '@/pages/datasets'
import { Empty, WidgetCard } from '@/widgets/panel'

export type RunParam = { key: string; label: string; type: 'number' | 'enum'; default: number | string; unit?: string; min?: number; max?: number; step?: number; options?: (string | { v: string; label?: string })[] }
type Summary = { label: string; value: number | string; unit?: string }
type Status = { state: 'idle' | 'running' | 'done' | 'error'; progress: number; step: string; startedAt: string | null; finishedAt: string | null; dataset: string | null; error: string | null; last: { at: string; dataset: string | null; params: Record<string, unknown> } | null; result: { mock?: boolean; summary?: Summary[]; items?: Record<string, unknown>[]; graph?: unknown } | null }

const POLL_MS = 500
const optV = (o: string | { v: string; label?: string }) => (typeof o === 'string' ? o : o.v)
const optL = (o: string | { v: string; label?: string }) => (typeof o === 'string' ? o : o.label ?? o.v)
// 내보내기 모양 — 과제의 출력 계약(EXPORT_SCHEMA 류)이 있으면 여기서 그 모양으로 바꾼다. 기본은 실행 메타 + 결과 그대로.
export const exportShape = (s: Status) => ({ exportedAt: new Date().toISOString(), dataset: s.last?.dataset ?? null, params: s.last?.params ?? null, generatedAt: s.last?.at ?? null, result: s.result })

export default function Run() {
  const { canWrite } = useAuth()
  const defs = (ctx.d.run?.params ?? []) as RunParam[]
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(defs.map((d) => [d.key, String(d.default)])))
  const [st, setSt] = useState<Status | null>(null)
  const [current, setCurrent] = useState<{ name: string; at: string; files: { file: string; rows: number }[] } | null>(null)
  const [pollErr, setPollErr] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const poll = useCallback(async () => {
    const r = await fetch('/api/run-status', { cache: 'no-store' }).catch(() => null)
    if (!r?.ok) { const j = r ? await r.json().catch(() => ({})) : {}; setPollErr((j.error as string) || (r ? `HTTP ${r.status}` : '서버에 연결하지 못했습니다')); return null } // 401·500 을 「대기」로 보이지 않는다
    setPollErr(null)
    const j = (await r.json()) as Status
    setSt(j)
    return j
  }, [])
  useEffect(() => {
    void poll()
    if (ctx.d.datasets) fetch('/api/datasets', { cache: 'no-store' }).then((r) => r.json()).then((j) => setCurrent(j.current ?? null)).catch(() => {})
  }, [poll])
  // 실행 중이면 짧게 폴링, 끝나면 멈춘다
  useEffect(() => {
    if (st?.state !== 'running') { if (timer.current) { clearInterval(timer.current); timer.current = null } return }
    if (timer.current) return
    timer.current = window.setInterval(() => { void poll().then((j) => { if (j && j.state !== 'running') { if (j.state === 'done') toast.success('실행 완료', { description: `${j.finishedAt?.slice(11) ?? ''}` }); else if (j.state === 'error') toast.error('실행 실패', { description: j.error ?? '' }) } }) }, POLL_MS)
    return () => { if (timer.current) { clearInterval(timer.current); timer.current = null } }
  }, [st?.state, poll])

  const errs: Record<string, string> = Object.fromEntries(defs.filter((d) => d.type === 'number').map((d) => {
    const n = Number(vals[d.key]); const bad = vals[d.key]?.trim() === '' || !Number.isFinite(n) ? '숫자를 입력하세요' : d.min !== undefined && n < d.min ? `${d.min} 이상` : d.max !== undefined && n > d.max ? `${d.max} 이하` : ''
    return [d.key, bad]
  }).filter(([, m]) => m))
  const params = () => Object.fromEntries(defs.map((d) => [d.key, d.type === 'number' ? Number(vals[d.key]) : vals[d.key]]))
  const start = async () => {
    if (Object.keys(errs).length) { toast.error('입력을 확인하세요', { description: Object.values(errs)[0] }); return }
    const r = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ params: params() }) })
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok) { toast.error((j.error as string) || `실행하지 못했습니다 (${r.status})`); return }
    toast('실행을 시작했습니다')
    void poll()
  }
  const exportJson = () => { if (!st?.result) return; downloadJson(`result-${(st.last?.at ?? ctx.today).replace(/[^\d]/g, '').slice(0, 12)}.json`, exportShape(st)); toast.success('JSON 내보냄') }

  const running = st?.state === 'running'
  const stale = !!current && !!st?.last && (st.last.dataset !== current.name || st.last.at < current.at)
  const canRun = canWrite // 서버 AUTH_WRITE_ROLES 판정 — 역할 이름을 화면에 박지 않는다
  const sum = st?.result?.summary ?? []
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 lg:px-6">
        {ctx.d.datasets ? <CurrentDatasetBadge current={current} /> : null}
        {st?.last ? <Badge variant="outline" className="font-normal" data-last-run>마지막 실행 {st.last.at}{st.last.dataset ? ` · ${st.last.dataset}` : ''}</Badge> : null}
        {st?.result?.mock ? <Badge variant="secondary" className="font-normal" data-mock>모의 결과</Badge> : null}
      </div>
      {pollErr ? <div className="px-4 lg:px-6"><Alert variant="destructive" data-status-error><TriangleAlertIcon className="size-4" /><AlertTitle>실행 상태를 읽지 못했습니다</AlertTitle><AlertDescription>{pollErr} · <button className="underline" onClick={() => void poll()}>다시 시도</button></AlertDescription></Alert></div> : null}
      {stale ? <div className="px-4 lg:px-6"><Alert data-stale><TriangleAlertIcon className="size-4" /><AlertTitle>재생성이 필요합니다</AlertTitle><AlertDescription>데이터셋 {current?.name} 이(가) {current?.at} 에 적용됐지만 아래 결과는 {st?.last?.dataset ?? '이전 데이터'} 로 만든 것입니다. 「실행」을 눌러 새 데이터로 다시 만드세요.</AlertDescription></Alert></div> : null}
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-12">
        <WidgetCard title="조건" sub={defs.length ? `${defs.length}개 · 바꾸고 실행하면 다시 만든다` : '도메인 설정 run.params 가 비어 있음'} className="@4xl/main:col-span-4">
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void start() }} noValidate data-run-form>
            {defs.map((d) => (
              <div key={d.key} className="flex flex-col gap-1.5" data-param={d.key}>
                <Label htmlFor={`r-${d.key}`}>{d.label}</Label>
                {d.type === 'enum' ? (
                  <Select value={vals[d.key]} onValueChange={(v) => setVals((x) => ({ ...x, [d.key]: v }))}>
                    <SelectTrigger id={`r-${d.key}`} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{(d.options ?? []).map((o) => <SelectItem key={optV(o)} value={optV(o)}>{optL(o)}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input id={`r-${d.key}`} type="number" inputMode="decimal" className="w-32 tabular-nums" min={d.min} max={d.max} step={d.step ?? 1} value={vals[d.key]} onChange={(e) => setVals((x) => ({ ...x, [d.key]: e.target.value }))} aria-invalid={!!errs[d.key]} />
                    {d.unit ? <span className="text-sm text-muted-foreground">{d.unit}</span> : null}
                  </div>
                )}
                {errs[d.key] ? <p role="alert" className="text-xs text-destructive">{errs[d.key]}</p> : null}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={running || !canRun} data-start><PlayIcon />{running ? '실행 중…' : st?.result ? '다시 실행' : '실행'}</Button>
              {!canRun ? <span className="text-xs text-muted-foreground">실행은 쓰기 권한 계정만</span> : null}
            </div>
          </form>
        </WidgetCard>

        <WidgetCard title="진행" sub={running ? `${st?.step} · ${st?.progress}%` : st?.state === 'error' ? '실패' : st?.state === 'done' ? `완료 · ${st.finishedAt ?? ''}` : '대기'} className="@4xl/main:col-span-8">
          <div className="flex flex-col gap-4">
            <Progress value={running ? st?.progress ?? 0 : st?.state === 'done' ? 100 : 0} aria-label="진행률" data-progress={st?.progress ?? 0} />
            {st?.state === 'error' ? <Alert variant="destructive" data-error><AlertTitle>엔진이 실패했습니다</AlertTitle><AlertDescription>{st.error}</AlertDescription></Alert> : null}
            {sum.length ? (
              <div className="grid grid-cols-2 gap-3 @2xl/card:grid-cols-4" data-summary>
                {sum.map((s, i) => <div key={i} className="rounded-lg border px-3 py-2"><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-lg font-semibold tabular-nums">{typeof s.value === 'number' ? s.value.toLocaleString('ko-KR') : String(s.value)}{s.unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{s.unit}</span> : null}</p></div>)}
              </div>
            ) : !running ? <Empty>아직 결과가 없습니다. 조건을 넣고 실행하세요.</Empty> : null}
            {st?.result ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={exportJson} data-export-json><DownloadIcon />JSON 내보내기</Button>
                {ctx.d.graph && st.result.graph ? <Button variant="outline" size="sm" asChild><a href="#/graph">그래프로 보기</a></Button> : null}
              </div>
            ) : null}
          </div>
        </WidgetCard>

        {st?.result?.items?.length ? (
          <WidgetCard title="결과 항목" sub={`${st.result.items.length}건 · 처음 50건`} className="@4xl/main:col-span-12">
            <div className="overflow-x-auto rounded-lg border" data-items>
              <Table>
                <TableHeader><TableRow>{Object.keys(st.result.items[0]).map((k) => <TableHead key={k}>{k}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{st.result.items.slice(0, 50).map((it, i) => <TableRow key={i}>{Object.keys(st.result!.items![0]).map((k) => <TableCell key={k} className="max-w-56 truncate tabular-nums">{Array.isArray(it[k]) ? (it[k] as unknown[]).join(', ') : String(it[k] ?? '')}</TableCell>)}</TableRow>)}</TableBody>
              </Table>
            </div>
          </WidgetCard>
        ) : null}
      </div>
      <LimitNote extra="실행은 한 번에 하나 · 결과는 서버에 마지막 한 벌만 남음" />
    </>
  )
}
