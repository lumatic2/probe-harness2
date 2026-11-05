// ② 목록 — 원본 DataTable(탭·열 토글·드래그·행 메뉴·Drawer·쪽 이동) + 검색·열 필터 + 「보드 보기」 칸반 토글 + CSV 내보내기·안내문 일괄 생성
// 상태(해시 쿼리): q 검색어 · f_<열>=값 필터 · sort/dir 정렬 · view=board
import { useEffect, useState } from 'react'
import { KanbanIcon, TableIcon, XIcon } from 'lucide-react'
import { DataTable } from '@/components/data-table'
import { LimitNote, Section } from '@/components/page-parts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApp } from '@/lib/app-context'
import { activeFilters, colLabel, ctx, distinct, filterRows, idOf, tpl, titleOf } from '@/lib/derive'
import { StatusBoard } from '@/widgets/blocks'

const ALL = '__all'

export default function List() {
  const { route, setQuery } = useApp()
  const d = ctx.d
  const rows = filterRows(ctx, route)
  const board = route.view === 'board'
  const [q, setQ] = useState(route.q ?? '')
  useEffect(() => { setQ(route.q ?? '') }, [route.q])

  const sort = route.sort || 'queue'
  const dir = route.dir === 'desc' ? 'desc' : 'asc'
  const sel = (v: string) => (v === ALL ? '' : v)
  const selectCols = (d.cols as { key: string; label: string; filter?: string }[]).filter((c) => c.filter === 'select')
  const chips = activeFilters(route).filter(([k]) => !selectCols.some((c) => c.key === k))

  const cols = (d.cols.find((c: { key: string }) => c.key === ctx.R.status).values as { v: string }[]).map((s) => {
    const x = rows.filter((a) => a[ctx.R.status] === s.v)
    return { name: s.v, total: x.length, items: x.slice(0, 8).map((a) => ({ id: idOf(ctx, a), title: titleOf(ctx, a), meta: tpl(ctx, d.board.meta, a), href: `#/item/${idOf(ctx, a)}` })) }
  })

  return (
    <>
      <Section>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="search" aria-label="검색" placeholder={d.entity.searchHint} className="h-8 w-56" value={q}
            onChange={(e) => { setQ(e.target.value); setQuery({ q: e.target.value }, true) }} />
          {selectCols.map((c) => (
            <Select key={c.key} value={route[`f_${c.key}`] || ALL} onValueChange={(v) => setQuery({ [`f_${c.key}`]: sel(v) })}>
              <SelectTrigger size="sm" className="w-36" aria-label={c.label}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>{c.label} 전체</SelectItem>{distinct(ctx, c.key).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          ))}
          {route.day ? <Badge variant="secondary" className="gap-1 pr-1" data-chip="day">{route.day}<Button type="button" variant="ghost" className="size-4 rounded-full p-0 hover:bg-foreground/10" aria-label="날짜 필터 해제" onClick={() => setQuery({ day: '' })}><XIcon className="size-3" /></Button></Badge> : null}
          {chips.map(([k, v]) => <Badge key={k} variant="secondary" className="gap-1 pr-1">{colLabel(ctx, k)} {v}<Button type="button" variant="ghost" className="size-4 rounded-full p-0 hover:bg-foreground/10" aria-label={`${colLabel(ctx, k)} 필터 해제`} onClick={() => setQuery({ [`f_${k}`]: '' })}><XIcon className="size-3" /></Button></Badge>)}
          <span className="text-sm text-muted-foreground" data-count>{d.entity.plural} {rows.length}{d.entity.unit}</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setQuery({ view: board ? '' : 'board' })}>
            {board ? <><TableIcon />표 보기</> : <><KanbanIcon />보드 보기</>}
          </Button>
        </div>
      </Section>
      {board ? (
        <Section><h2 className="mb-3 text-base font-medium">{d.board.title}</h2><StatusBoard columns={cols} maxShown={8} /></Section>
      ) : (
        <DataTable rows={rows} sort={{ key: sort, dir, onSort: (k) => setQuery({ sort: k, dir: route.sort === k && dir === 'asc' ? 'desc' : 'asc' }) }} />
      )}
      <LimitNote extra="목록은 선택한 기간·그룹 기준" />
    </>
  )
}
