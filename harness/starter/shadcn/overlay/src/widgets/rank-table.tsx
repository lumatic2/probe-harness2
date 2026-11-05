// W8 순위·판단 큐 표 — 머리 글자를 눌러 정렬, 행을 눌러 근거(원 데이터·계산 규칙) 펼침. 상위 N 행은 옅게 강조.
// 열·배지 어조는 도메인 설정(queue.columns)에서 온다.
import { Fragment, useMemo, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ctx, sortRows } from '@/lib/derive'
import { Empty, ToneBadge } from './panel'

type W = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export function RankTable({ w }: { w: W }) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'queue', dir: 'asc' })
  const [open, setOpen] = useState<string | null>(null)
  const rows: W[] = useMemo(() => {
    if (sort.key === 'queue') return w.rows
    const order = sortRows(ctx, w.rows.map((r: W) => r.raw), sort.key, sort.dir).map((r) => String(r[ctx.R.id]))
    return [...w.rows].sort((a: W, b: W) => order.indexOf(String(a.id)) - order.indexOf(String(b.id)))
  }, [w.rows, sort])
  if (!rows.length) return <Empty>먼저 볼 {ctx.d.entity.singular}이(가) 없습니다.</Empty>
  const cols: { key: string; label: string; badge: boolean }[] = w.columns
  const head = (key: string, label: string) => (
    <TableHead key={key}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))}>
        {label}{sort.key === key ? (sort.dir === 'asc' ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />) : null}
      </button>
    </TableHead>
  )
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow><TableHead className="w-8" />{cols.map((c) => head(c.key, c.label))}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <Fragment key={r.id}>
              <TableRow className={`cursor-pointer ${i < w.topN && sort.key === 'queue' ? 'bg-muted/50' : ''}`} onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                <TableCell><ChevronRightIcon className={`size-4 text-muted-foreground transition-transform ${open === r.id ? 'rotate-90' : ''}`} /></TableCell>
                {cols.map((c, k) => (
                  <TableCell key={c.key} className={k === 0 ? 'font-medium' : 'tabular-nums'}>
                    {k === 0 ? <a href={r.href} onClick={(e) => e.stopPropagation()} className="hover:underline">{r[c.key]}</a> : c.badge ? <ToneBadge text={r[c.key]} tone={r.tones[c.key]} /> : r[c.key]}
                  </TableCell>
                ))}
              </TableRow>
              {open === r.id ? (
                <TableRow className="bg-muted/30 hover:bg-muted/30"><TableCell /><TableCell colSpan={cols.length}>
                  <ul className="list-disc pl-4 text-xs text-muted-foreground">{r.evidence.map((e: string) => <li key={e}>{e}</li>)}</ul>
                </TableCell></TableRow>
              ) : null}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
