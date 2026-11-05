// ⑤ 리포트 — 지표 카드 → 요약 한 줄 → 추세·막대 → 조건 A/B 비교 → 인수인계 메모(복사·내려받기)
// 상태(해시 쿼리): ids 선택한 건(쉼표) · ap/ag 조건 A 기간·그룹 · bp/bg 조건 B (bp 기본 = A 와 같은 길이의 직전 기간 'prev')
import { useState } from 'react'
import { CheckIcon, ChevronDownIcon, CopyIcon, DownloadIcon, PrinterIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Grid, LimitNote, Section } from '@/components/page-parts'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useApp } from '@/lib/app-context'
import { buildReportWorkbook, buildXlsx, downloadXlsx, filterParts, xlsxFileName } from '@/domain/xlsx.mjs'
import { downloadJson } from '@/lib/download'
import { buildInputs, buildMemo, buildSummary, compareDiff, compareRows, csvFileName, ctx, filterRows, fmt, groupAll, metricsFor, PERIODS, sign, tableCols, toCsv, windowDates, type Route } from '@/lib/derive'
import { BarList, TrendChart } from '@/widgets/charts'
import { MetricCards } from '@/widgets/metric-cards'
import { WidgetCard } from '@/widgets/panel'

function conds(r: Route) {
  return { a: { period: r.ap || r.period, group: r.ag || r.group }, b: { period: r.bp || 'prev', group: r.bg || r.group } }
}

function CondPicker({ label, pk, prk, cur, prev }: { label: string; pk: string; prk: string; cur: { period: string; group: string }; prev?: boolean }) {
  const { setQuery } = useApp()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 text-sm font-medium">{label}</span>
      <Select value={cur.period} onValueChange={(v) => setQuery({ [pk]: v })}>
        <SelectTrigger size="sm" className="w-36" aria-label={`${label} 기간`}><SelectValue /></SelectTrigger>
        <SelectContent>{prev ? <SelectItem value="prev">직전 같은 기간</SelectItem> : null}{PERIODS.map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={cur.group} onValueChange={(v) => setQuery({ [prk]: v })}>
        <SelectTrigger size="sm" className="w-36" aria-label={`${label} ${ctx.d.group.label}`}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="전체">{groupAll(ctx)}</SelectItem>{(ctx.d.group.values as string[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}

export default function Report() {
  const { route } = useApp()
  const i = buildInputs(ctx, route)
  const c = conds(route)
  const ma = metricsFor(ctx, windowDates(ctx, { period: c.a.period }), c.a.group)
  const mb = c.b.period === 'prev' ? metricsFor(ctx, windowDates(ctx, { period: c.a.period }, 1), c.b.group) : metricsFor(ctx, windowDates(ctx, { period: c.b.period }), c.b.group)
  const ra = compareRows(ctx, ma), rb = compareRows(ctx, mb)
  const memo = buildMemo(ctx, route)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try { await navigator.clipboard.writeText(memo) } catch {
      const ta = document.createElement('textarea'); ta.value = memo; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove()
    }
    setCopied(true); toast.success('복사됨', { description: '붙여넣기는 ⌘V' })
    setTimeout(() => setCopied(false), 1500)
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([`﻿${memo}`], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `memo-${ctx.today}.txt`; a.click(); URL.revokeObjectURL(url)
  }

  // 내보내기: 위 기간·그룹의 행 전부 × 표의 모든 열. 엑셀 = 「요약」(조건 A/B 지표 표) + 「데이터」
  const exportRows = () => ({ rows: filterRows(ctx, route), keys: tableCols(ctx, 'shadcn').map((x) => x.key) })
  const exportXlsx = () => {
    const { rows, keys } = exportRows()
    downloadXlsx(xlsxFileName(ctx, filterParts(ctx, route)), buildXlsx(buildReportWorkbook(ctx, route, { rows, keys, cmp: [ma, mb] })))
    toast.success('엑셀 내보냄', { description: `${rows.length}${ctx.d.entity.unit} · 열 ${keys.length}개` })
  }
  // JSON = 과제가 출력 계약(EXPORT_SCHEMA 류)을 줬을 때 그 모양으로 바꾸는 자리. 기본은 메타 + 행 그대로.
  const exportJson = () => {
    const { rows, keys } = exportRows()
    downloadJson(csvFileName(ctx).replace(/\.csv$/i, '.json'), { exportedAt: new Date().toISOString(), asOf: ctx.d.app.asOf, filters: filterParts(ctx, route), columns: keys, rows })
    toast.success('JSON 내보냄', { description: `${rows.length}${ctx.d.entity.unit} · 열 ${keys.length}개` })
  }
  const exportCsv = () => {
    const { rows, keys } = exportRows()
    const url = URL.createObjectURL(new Blob([toCsv(ctx, rows, keys)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = csvFileName(ctx); a.click(); URL.revokeObjectURL(url)
    toast.success('CSV 내보냄', { description: `${rows.length}${ctx.d.entity.unit} · 열 ${keys.length}개` })
  }

  return (
    <>
      <Section>
        <p className="hidden border-b pb-2 text-xs print:block" data-print-head><strong className="font-semibold">{ctx.d.app.title} · 분석 리포트</strong> · 데이터 기준 {ctx.d.app.asOf} · 적용 필터 {filterParts(ctx, route).join(' · ')}</p>
        <div className="flex items-center justify-end gap-2 print:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-act="export"><DownloadIcon />내보내기<ChevronDownIcon data-icon="inline-end" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem onSelect={exportCsv} data-act="csv" aria-label="CSV 내보내기">CSV</DropdownMenuItem>
              <DropdownMenuItem onSelect={exportXlsx} data-act="xlsx" aria-label="엑셀 내보내기">엑셀</DropdownMenuItem>
              <DropdownMenuItem onSelect={exportJson} data-act="json" aria-label="JSON 내보내기">JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => window.print()} data-act="print"><PrinterIcon />인쇄</Button>
        </div>
      </Section>
      <Section><MetricCards items={i.w1.items.slice(0, 4)} /></Section>
      <Section><p className="text-sm leading-relaxed text-muted-foreground" data-summary>{buildSummary(ctx, route)}</p></Section>
      <Grid>
        <WidgetCard no="W2" title={i.w2.title}><TrendChart w={i.w2} height={240} /></WidgetCard>
        <WidgetCard no="W3" title={i.w3.title}><BarList w={i.w3} /></WidgetCard>
      </Grid>
      <Section>
        <WidgetCard title="조건 A/B 비교">
          <div className="flex flex-col gap-2"><CondPicker label="조건 A" pk="ap" prk="ag" cur={c.a} /><CondPicker label="조건 B" pk="bp" prk="bg" cur={c.b} prev /></div>
          <Table className="mt-4">
            <TableHeader className="bg-muted/50"><TableRow><TableHead>지표</TableHead><TableHead className="text-right">조건 A</TableHead><TableHead className="text-right">조건 B</TableHead><TableHead className="text-right">차이</TableHead></TableRow></TableHeader>
            <TableBody>
              {ra.map(([label, va, d]: [string, number | null, number], k: number) => (
                <TableRow key={label}><TableCell className="font-medium">{label}</TableCell><TableCell className="text-right tabular-nums">{fmt(va, d)}</TableCell><TableCell className="text-right tabular-nums">{fmt(rb[k][1], d)}</TableCell>
                  <TableCell className="text-right tabular-nums">{sign(compareDiff(va, rb[k][1]) ?? NaN, d)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </WidgetCard>
      </Section>
      <Section>
        <WidgetCard title={`${ctx.d.report?.memoTitle || '인수인계 메모'} 미리보기`}>
          <pre className="max-h-80 overflow-auto rounded-lg bg-muted/50 p-4 font-sans text-sm leading-relaxed break-words whitespace-pre-wrap" data-memo>{memo}</pre>
          <div className="mt-3 flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={copy}>{copied ? <><CheckIcon />복사됨</> : <><CopyIcon />복사</>}</Button>
            <Button variant="outline" size="sm" onClick={download}><DownloadIcon />내려받기 (.txt)</Button>
          </div>
        </WidgetCard>
      </Section>
      <LimitNote extra="이 리포트의 숫자는 위 기간·필터 기준 집계이고 원인은 확정하지 않음 · 조건 B 기본값은 A 와 같은 길이의 직전 기간" />
    </>
  )
}
