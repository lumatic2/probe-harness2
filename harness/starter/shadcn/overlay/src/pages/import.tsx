// ⑨ CSV 올리기 #/import — 파일(끌어 놓기·버튼) → 인코딩 감지 → 열 맞추기 → 검증 → 미리보기 → 바꾸기/덧붙이기 → 반영 + 되돌리기(직전 한 벌).
// 파싱·검증·열 대응은 src/domain/import.mjs (명령줄 변환기와 같은 함수). 반영한 데이터는 서버(/api/import-<도메인>)에 쌓이고 샘플의 rows 를 대신한다(lib/derive.ts).
// 반영·되돌리기 뒤에는 화면을 다시 불러 새 데이터로 모든 페이지를 그린다. 도메인 설정에 import 키가 있을 때만 켜진다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LimitNote } from '@/components/page-parts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  autoMap, canRevert, decodeBytes, fitsStore, hasImported, importApi, importCols, importPrevApi, makeRecord, maxBytes, mergeRows, prevFor, PREVIEW_ROWS, readTable, requiredKeys, revertRecord, validateRows,
  type ImportRecord, type ImportTable,
} from '@/domain/import.mjs'
import { baseSample, ctx, domainName, imported, prevImported } from '@/lib/derive'
import { Empty, WidgetCard } from '@/widgets/panel'

const FLASH = 'sk-import-flash'
const MAX_ERRORS = 50
const pad = (n: number) => String(n).padStart(2, '0')
const nowTs = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))}KB`
const cellText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v === undefined || v === null ? '' : String(v))
const NONE = '-1'

async function save(name: string, body: unknown) {
  const res = await fetch(`/api/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(res.status === 413 ? '서버 저장 상한(1MB)을 넘습니다.' : `저장하지 못했습니다(${res.status}).`)
}

export default function ImportPage() {
  const d = ctx.d
  const req = useMemo(() => new Set(requiredKeys(d)), [d])
  const cols = useMemo(() => importCols(d), [d])
  const [file, setFile] = useState<{ name: string; size: number; encoding: string } | null>(null)
  const [table, setTable] = useState<ImportTable | null>(null)
  const [map, setMap] = useState<Record<string, number>>({})
  const [mode, setMode] = useState<'replace' | 'append'>('replace')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // 반영·되돌리기 뒤 화면을 다시 불러 온 직후의 알림
  useEffect(() => {
    const m = sessionStorage.getItem(FLASH)
    if (m) { sessionStorage.removeItem(FLASH); toast.success(m) }
  }, [])

  const existingIds = useMemo(() => (mode === 'append' ? new Set((ctx.s.rows as Record<string, unknown>[]).map((r) => String(r[ctx.R.id]))) : null), [mode])
  const result = useMemo(() => (table ? validateRows(d, table, map, { existingIds }) : null), [d, table, map, existingIds])

  const take = async (f?: File) => {
    if (!f) return
    if (!/\.csv$/i.test(f.name)) { setError('CSV 파일(.csv)만 올릴 수 있습니다.'); return }
    if (f.size > maxBytes(d)) { setError(`파일이 크기 상한(${kb(maxBytes(d))})을 넘습니다.`); return }
    const { text, encoding } = decodeBytes(new Uint8Array(await f.arrayBuffer()))
    const t = readTable(text)
    if (!t.headers.length || !t.rows.length) { setError('데이터 행이 없는 파일입니다.'); setTable(null); return }
    setError(''); setFile({ name: f.name, size: f.size, encoding }); setTable(t); setMap(autoMap(d, t.headers))
  }

  const finish = (msg: string) => { sessionStorage.setItem(FLASH, msg); location.reload() }

  const apply = async () => {
    if (!result || result.blocked || !result.okCount || !file) return
    const rec = makeRecord({ rows: mergeRows(ctx.s.rows, result.okRows, mode), source: file.name, encoding: file.encoding, mode, at: nowTs(), added: result.okCount, skipped: result.errorRowCount })
    if (!fitsStore(rec)) { setError('반영할 데이터가 서버 저장 상한(1MB)을 넘습니다. 파일을 줄이거나 바꾸기로 올리세요.'); return }
    setBusy(true); setError('')
    try {
      await save(importPrevApi(domainName), prevFor(imported))
      await save(importApi(domainName), rec)
      finish(`${result.okCount}행을 ${mode === 'append' ? '덧붙였' : '바꿔 반영했'}습니다.`)
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  const undo = async () => {
    if (!canRevert(prevImported)) return
    setBusy(true); setError('')
    try {
      await save(importApi(domainName), revertRecord(prevImported))
      await save(importPrevApi(domainName), {})
      finish('직전 데이터로 되돌렸습니다.')
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  const rec: ImportRecord = imported
  const previewCols = cols.filter((c) => map[c.key] >= 0)
  const missingNames = result?.missingRequired.map((k) => cols.find((c) => c.key === k)?.label ?? k).join(', ')
  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-12">
        <div
          className="@4xl/main:col-span-8"
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files[0]) }}
          data-drop
          data-over={over ? 'true' : undefined}
        >
          <WidgetCard title="CSV 파일" sub={`.csv · 최대 ${kb(maxBytes(d))}`} className={over ? 'border-foreground/40 bg-muted/40' : ''}>
            <div className="flex flex-col items-start gap-3">
              <Button variant="outline" onClick={() => input.current?.click()} data-pick>{file ? '다른 파일 고르기' : 'CSV 파일 고르기'}</Button>
              <input ref={input} type="file" accept=".csv,text/csv" className="hidden" aria-label="CSV 파일" data-file onChange={(e) => { void take(e.target.files?.[0]); e.target.value = '' }} />
              {file && table ? <p className="text-sm text-muted-foreground" data-file-info>{file.name} · {kb(file.size)} · {file.encoding} · {table.rows.length}행</p> : null}
              {error ? <p role="alert" className="text-sm text-destructive" data-error>{error}</p> : null}
            </div>
          </WidgetCard>
        </div>
        <WidgetCard title="현재 데이터" className="@4xl/main:col-span-4">
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm" data-current>
              {hasImported(rec) && rec.meta
                ? `${rec.meta.source} · ${rec.meta.total}${d.entity.unit} · ${rec.meta.at.replace('T', ' ').slice(0, 16)} · ${rec.meta.mode === 'append' ? `덧붙이기 +${rec.meta.added}` : '바꾸기'}`
                : `기본 샘플 · ${baseSample.rows.length}${d.entity.unit}`}
            </p>
            <Button variant="outline" disabled={!canRevert(prevImported) || busy} onClick={undo} data-undo>되돌리기</Button>
          </div>
        </WidgetCard>
      </div>

      {table && result ? (
        <>
          <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-12">
            <WidgetCard title="열 맞추기" sub={`CSV 열 ${table.headers.length}개`} className="@4xl/main:col-span-5">
              <div className="max-h-[30rem] overflow-y-auto rounded-lg border" data-map-table>
                <Table>
                  <TableHeader><TableRow><TableHead>열</TableHead><TableHead>CSV 머리글</TableHead><TableHead>첫 행 값</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {cols.map((c) => {
                      const i = map[c.key]
                      return (
                        <TableRow key={c.key}>
                          <TableCell className="whitespace-nowrap">{c.label}{req.has(c.key) ? <Badge variant="outline" className="ml-2">필수</Badge> : null}</TableCell>
                          <TableCell>
                            <Select value={String(i)} onValueChange={(v) => setMap({ ...map, [c.key]: Number(v) })}>
                              <SelectTrigger size="sm" className="w-40" aria-label={`${c.label} 열`} data-map={c.key}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>대응 안 함</SelectItem>
                                {table.headers.map((h, k) => <SelectItem key={k} value={String(k)}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="max-w-40 truncate">{i >= 0 ? cellText(table.rows[0]?.cells[i]) : ''}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </WidgetCard>

            <WidgetCard title="검증" sub={result.blocked ? '필수 열 대응 필요' : `정상 ${result.okCount}행 · 오류 ${result.errorRowCount}행`} className="@4xl/main:col-span-7">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">반영 방식</span>
                  <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as 'replace' | 'append')} aria-label="반영 방식">
                    <ToggleGroupItem value="replace" className="px-3" data-mode="replace">바꾸기</ToggleGroupItem>
                    <ToggleGroupItem value="append" className="px-3" data-mode="append">덧붙이기</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                {result.blocked ? <p role="alert" className="text-sm text-destructive" data-blocked>필수 열을 맞추지 못했습니다: {missingNames}</p> : null}
                {!result.blocked && !result.errors.length ? <p className="text-sm" data-no-errors>오류가 없습니다.</p> : null}
                {result.errors.length ? (
                  <div className="flex flex-col gap-2">
                    <div className="max-h-64 overflow-y-auto rounded-lg border" data-errors>
                      <Table>
                        <TableHeader><TableRow><TableHead>행</TableHead><TableHead>열</TableHead><TableHead>값</TableHead><TableHead>이유</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {result.errors.slice(0, MAX_ERRORS).map((e, n) => (
                            <TableRow key={n} data-err-line={e.line}>
                              <TableCell className="tabular-nums">{e.line}</TableCell>
                              <TableCell className="whitespace-nowrap">{e.label}</TableCell>
                              <TableCell className="max-w-44 truncate">{e.value}</TableCell>
                              <TableCell className="whitespace-normal">{e.reason}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {result.errors.length > MAX_ERRORS ? <p className="text-xs text-muted-foreground">외 {result.errors.length - MAX_ERRORS}건</p> : null}
                  </div>
                ) : null}
                <div>
                  <Button onClick={apply} disabled={result.blocked || !result.okCount || busy} data-apply>{result.errorRowCount ? `정상 행만 반영 (${result.okCount}행)` : '반영'}</Button>
                </div>
              </div>
            </WidgetCard>
          </div>

          <div className="px-4 lg:px-6">
            <WidgetCard title="미리보기" sub={`처음 ${Math.min(PREVIEW_ROWS, result.records.length)}행`}>
              <div className="overflow-x-auto rounded-lg border" data-preview>
                <Table>
                  <TableHeader><TableRow><TableHead>행</TableHead>{previewCols.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>
                    {result.records.slice(0, PREVIEW_ROWS).map((r, n) => {
                      const bad = new Map(r.errors.map((e) => [e.key, e.reason]))
                      return (
                        <TableRow key={r.line} data-row-error={r.errors.length ? 'true' : undefined}>
                          <TableCell className="tabular-nums">{r.line}</TableCell>
                          {previewCols.map((c) => bad.has(c.key)
                            ? <TableCell key={c.key} className="font-medium text-destructive" title={bad.get(c.key)}>{table.rows[n].cells[map[c.key]] || '(빈 칸)'}</TableCell>
                            : <TableCell key={c.key} className="max-w-48 truncate">{cellText(r.rec[c.key])}</TableCell>)}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </WidgetCard>
          </div>
        </>
      ) : (
        <div className="px-4 lg:px-6"><WidgetCard title="미리보기"><Empty>아직 고른 파일이 없습니다.</Empty></WidgetCard></div>
      )}
      <LimitNote extra="반영한 데이터는 서버에 저장되며 직전 한 벌만 되돌릴 수 있음" />
    </>
  )
}
