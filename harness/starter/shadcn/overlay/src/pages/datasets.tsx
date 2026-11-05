// ⑩ 데이터셋 #/datasets — 파일 업로드 없이 서버에 준비된 데이터셋(data/datasets/<이름>/ CSV 묶음)을 고르고 → 검증 결과(파일·행·열·이유)를 보고 → 적용한다.
// 「적용」은 서버가 검증한 뒤 통과할 때만 바꾸고, 실패하면 409 와 오류 표를 돌려주며 기존 적용과 결과를 그대로 둔다. 「검증」은 적용 없이 결과만 미리 본다. 현재 적용 데이터셋은 이 화면과 실행 화면 머리에 보인다. 규칙은 data/datasets/schema.json(server/datasets.mjs 머리 주석).
// 적용 뒤 「다시 실행」 전까지 결과는 이전 데이터셋 것이다 — 실행 화면이 「재생성 필요」를 띄운다. 도메인 설정에 datasets 키가 있을 때만 켜진다.
// 「검증」은 모든 역할이 누를 수 있고(서버 READ_POSTS), 「적용」은 서버가 준 canWrite 가 참일 때만. 서버 오류(401·500)는 「없음」이 아니라 오류 상태로 보인다.
import { useCallback, useEffect, useState } from 'react'
import { CheckIcon, DatabaseIcon } from 'lucide-react'
import { toast } from 'sonner'
import { DataState } from '@/components/data-state'
import { LimitNote } from '@/components/page-parts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/lib/auth'
import { Empty, WidgetCard } from '@/widgets/panel'

export type DatasetError = { file: string; line: number; column: string; value: string; reason: string }
type Item = { name: string; files: { file: string; rows: number; bytes: number }[] }
type Current = { name: string; at: string; files: { file: string; rows: number }[] } | null
type Validation = { name: string; ok: boolean; errors: DatasetError[]; summary: { file: string; rows: number }[] }

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))}KB`
async function post(name: string, body: unknown) {
  const r = await fetch(`/api/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, json: j as Record<string, unknown> }
}

export function CurrentDatasetBadge({ current }: { current: Current }) {
  return current
    ? <Badge variant="outline" className="gap-1.5 font-normal" data-current-dataset><DatabaseIcon className="size-3" />적용 중: {current.name} · {current.at}</Badge>
    : <Badge variant="outline" className="font-normal text-muted-foreground" data-current-dataset>적용된 데이터셋 없음</Badge>
}

export default function Datasets() {
  const { canWrite } = useAuth()
  const [items, setItems] = useState<Item[]>([])
  const [current, setCurrent] = useState<Current>(null)
  const [hasSchema, setHasSchema] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [picked, setPicked] = useState<string>('')
  const [v, setV] = useState<Validation | null>(null)
  const [busy, setBusy] = useState<'' | 'validate' | 'apply'>('')

  const load = useCallback(async () => {
    const r = await fetch('/api/datasets', { cache: 'no-store' }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    if (!r?.ok) { setLoadErr((j.error as string) || (r ? `HTTP ${r.status}` : '서버에 연결하지 못했습니다')); setLoaded(true); return } // 401·500 을 「없음」으로 보이지 않는다
    setLoadErr(null); setItems(j.items ?? []); setCurrent(j.current ?? null); setHasSchema(!!j.hasSchema); setLoaded(true)
  }, [])
  useEffect(() => { void load() }, [load])

  const validate = async () => {
    if (!picked) return
    setBusy('validate'); setV(null)
    const r = await post('datasets-validate', { name: picked })
    setBusy('')
    if (!r.ok) { toast.error((r.json.error as string) || `검증하지 못했습니다 (${r.status})`); return }
    const val = r.json as unknown as Validation
    setV(val)
    if (val.ok) toast.success('검증 통과', { description: `${val.summary.length}개 파일 · ${val.summary.reduce((a, s) => a + s.rows, 0).toLocaleString('ko-KR')}행` })
    else toast.warning(`오류 ${val.errors.length}건`, { description: '아래 표를 확인하세요. 적용되지 않았습니다.' })
  }
  const apply = async () => {
    if (!picked) return
    setBusy('apply')
    const r = await post('datasets-apply', { name: picked })
    setBusy('')
    if (!r.ok) { toast.error((r.json.error as string) || `적용하지 못했습니다 (${r.status})`); if (r.json.errors) setV({ ...(r.json as unknown as Validation), name: picked, ok: false }); return }
    await load()
    toast.success(`${picked} 적용됨`, { description: '결과는 다시 실행해야 새 데이터를 반영합니다.' })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 lg:px-6"><CurrentDatasetBadge current={current} />{!hasSchema && loaded ? <span className="text-xs text-muted-foreground">schema.json 이 없어 형식·참조 검사는 건너뜁니다</span> : null}</div>
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-12">
        <WidgetCard title="준비된 데이터셋" sub="data/datasets/ 폴더 하나 = 데이터셋 하나" className="@4xl/main:col-span-5">
          {!loaded ? <Empty>불러오는 중…</Empty> : loadErr ? <DataState kind="error" detail={loadErr} retry={() => void load()} /> : !items.length ? <Empty>준비된 데이터셋이 없습니다. data/datasets/&lt;이름&gt;/ 에 CSV 를 두세요.</Empty> : (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border" role="radiogroup" aria-label="데이터셋">
                {items.map((it) => {
                  const on = it.name === picked, isCur = it.name === current?.name
                  return (
                    <button key={it.name} type="button" role="radio" aria-checked={on} data-dataset={it.name} onClick={() => { setPicked(it.name); setV(null) }}
                      className={`flex w-full items-start gap-3 border-b px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-muted/50 ${on ? 'bg-muted/60' : ''}`}>
                      <span className={`mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-foreground bg-foreground text-background' : ''}`}>{on ? <CheckIcon className="size-3" /> : null}</span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-center gap-2 font-medium">{it.name}{isCur ? <Badge variant="secondary" className="font-normal">적용 중</Badge> : null}</span>
                        <span className="truncate text-xs text-muted-foreground">{it.files.map((f) => `${f.file} ${f.rows.toLocaleString('ko-KR')}행`).join(' · ')}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{kb(it.files.reduce((a, f) => a + f.bytes, 0))}</span>
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" disabled={!picked || !!busy} onClick={validate} data-validate>{busy === 'validate' ? '검증 중…' : '검증'}</Button>
                <Button disabled={!picked || !!busy || !canWrite} onClick={apply} data-apply title={canWrite ? '검증을 거쳐 통과하면 적용' : '쓰기 권한이 있는 계정만 적용할 수 있습니다'}>{busy === 'apply' ? '적용 중…' : picked && picked === current?.name ? '다시 적용' : '적용'}</Button>
                {!canWrite ? <span className="text-xs text-muted-foreground">적용은 쓰기 권한 계정만</span> : null}
              </div>
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="검증 결과" sub={v ? (v.ok ? `${v.name} · 통과` : `${v.name} · 오류 ${v.errors.length}건${v.errors.length >= 200 ? ' 이상' : ''}`) : '데이터셋을 고르고 「검증」을 누르세요'} className="@4xl/main:col-span-7">
          {!v ? <Empty>아직 검증한 데이터셋이 없습니다.</Empty> : (
            <div className="flex flex-col gap-4">
              {v.ok
                ? <Alert data-ok><CheckIcon className="size-4" /><AlertTitle>적용할 수 있습니다</AlertTitle><AlertDescription>{v.summary.map((s) => `${s.file} ${s.rows.toLocaleString('ko-KR')}행`).join(' · ')}</AlertDescription></Alert>
                : <Alert variant="destructive" data-fail><AlertTitle>검증에 실패해 적용하지 않습니다</AlertTitle><AlertDescription>기존 데이터와 생성 결과는 그대로입니다. 아래 행을 고친 뒤 다시 검증하세요.</AlertDescription></Alert>}
              {v.errors.length ? (
                <div className="max-h-96 overflow-y-auto rounded-lg border" data-errors>
                  <Table>
                    <TableHeader><TableRow><TableHead>파일</TableHead><TableHead className="text-right">행</TableHead><TableHead>열</TableHead><TableHead>값</TableHead><TableHead>이유</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {v.errors.map((e, i) => (
                        <TableRow key={i}><TableCell className="whitespace-nowrap">{e.file}</TableCell><TableCell className="text-right tabular-nums">{e.line || '–'}</TableCell><TableCell className="whitespace-nowrap">{e.column || '–'}</TableCell><TableCell className="max-w-40 truncate" title={e.value}>{e.value || '(빈 칸)'}</TableCell><TableCell className="whitespace-normal">{e.reason}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          )}
        </WidgetCard>
      </div>
      <LimitNote extra="적용은 서버 검증을 통과한 데이터셋만(실패하면 기존 유지) · 적용 뒤 재실행 전까지 결과는 이전 데이터셋 것" />
    </>
  )
}
