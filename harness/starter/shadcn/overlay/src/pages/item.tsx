// ③ 상세 #/item/<ID> — 정보 + 근거(원 데이터 행·계산 규칙) + 같은 대상의 최근 건 + 변경 이력(/api/decisions-<도메인>)
import { AlertCircleIcon } from 'lucide-react'
import { LimitNote, Section } from '@/components/page-parts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useApp } from '@/lib/app-context'
import { cell, colLabel, ctx, ddayText, findRow, idOf, rawLines, relatedRows, rulesFor, shortTs, titleOf, tpl } from '@/lib/derive'
import { AlertList } from '@/widgets/blocks'
import { ToneBadge, WidgetCard } from '@/widgets/panel'

export default function Item() {
  const { route, link, decisions } = useApp()
  const d = ctx.d, R = ctx.R
  const a = findRow(ctx, route.id ?? '')
  if (!a) {
    return (
      <>
        <Section>
          <Alert variant="destructive"><AlertCircleIcon /><AlertTitle>{d.entity.singular} {route.id || ''}을(를) 찾을 수 없습니다.</AlertTitle>
            <AlertDescription><a className="underline" href={link('list')}>목록으로 돌아가기</a></AlertDescription></Alert>
        </Section>
        <LimitNote />
      </>
    )
  }
  const { applied } = rulesFor(ctx, a)
  const hist = decisions.filter((x) => String(x.ref) === String(route.id))
  const raw = rawLines(ctx, a).map(([k, v]): [string, string] => { const nm = ctx.byKey[k]?.names?.[v]; return [k, nm ? `${v} (${nm})` : /^\d{4}-\d{2}-\d{2}T/.test(v) ? shortTs(v) : v] })
  const dd = ddayText(ctx, a)
  const meta = [R.owner && a[R.owner], R.group && `${a[R.group]}${d.group.suffix ? ' ' + d.group.suffix : ''}`, R.date && shortTs(a[R.date]), dd].filter(Boolean).join(' · ')
  const relItems = d.related ? relatedRows(ctx, a).slice(0, 5).map((x) => { const c = cell(ctx, x, d.related.badge); return { badge: c.text, tone: c.tone, title: tpl(ctx, d.related.item, x), ts: shortTs(x[R.date]), href: `#/item/${idOf(ctx, x)}`, note: tpl(ctx, d.related.note || '', x) } }) : []
  const fields = d.form.fields as { key: string; label: string; type: string }[]
  return (
    <>
      <Section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">{idOf(ctx, a)} · {titleOf(ctx, a)}</h2>
          {R.priority ? <ToneBadge text={String(a[R.priority])} tone={cell(ctx, a, R.priority).tone} /> : null}
          {R.status ? <ToneBadge text={String(a[R.status])} tone={cell(ctx, a, R.status).tone} /> : null}
          <span className="text-sm text-muted-foreground">{meta}</span>
        </div>
      </Section>
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @3xl/main:grid-cols-2">
        <WidgetCard title="근거 · 원 데이터">
          <Table><TableBody>{raw.map(([k, v]) => <TableRow key={k}><TableHead className="w-32 font-normal text-muted-foreground">{colLabel(ctx, k)}</TableHead><TableCell>{v}</TableCell></TableRow>)}</TableBody></Table>
        </WidgetCard>
        <WidgetCard title="근거 · 적용 규칙">
          {applied.length ? (
            <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
              {applied.map((r: { text: string }) => <li key={r.text}>{r.text}</li>)}
            </ul>
          ) : <p className="py-8 text-center text-sm text-muted-foreground">적용된 규칙 없음</p>}
        </WidgetCard>
        {d.related ? <WidgetCard title={d.related.title}><AlertList items={relItems} /></WidgetCard> : null}
        <WidgetCard title={d.form.itemHistoryTitle} href={link('form', {}, String(idOf(ctx, a)))} linkLabel={d.form.action}>
          {hist.length ? (
            <Table>
              <TableHeader><TableRow><TableHead>시각</TableHead><TableHead>담당</TableHead>{fields.map((f) => <TableHead key={f.key} className={f.type === 'number' ? 'text-right' : ''}>{f.label.replace(/\s*\(.*\)$/, '')}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {[...hist].reverse().map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{shortTs(x.ts)}</TableCell><TableCell className="whitespace-nowrap">{x.who}</TableCell>
                    {fields.map((f) => <TableCell key={f.key} className={f.type === 'number' ? 'text-right tabular-nums' : f.type === 'textarea' ? 'min-w-40 whitespace-normal break-words' : ''}>{x[f.key]}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="py-8 text-center text-sm text-muted-foreground">기록된 변경 없음</p>}
        </WidgetCard>
      </div>
      <LimitNote extra="변경 이력은 이 앱에서 입력한 것만 표시" />
    </>
  )
}
