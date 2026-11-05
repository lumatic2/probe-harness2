// data-table.tsx — dashboard-01 DataTable(원본 구조 그대로)에 도메인 설정(열·탭·배지)과 한국어 라벨만 주입한 것.
// 원본 조작 요소 전부: Tabs(숫자 배지)/Select · Columns · 추가(Add Section) · 전체·행 선택 · 행 드래그 재정렬 ·
// 행 안 인라인 편집(숫자 열) · 담당 Select · 행 「⋮」 메뉴(편집·복제·즐겨찾기·삭제) · 이름 클릭 → 오른쪽 Drawer · 쪽당 행 수 + 쪽 이동.
// 표 공통 기능(과제 데이터가 바뀌어도 그대로): CSV 내보내기(현재 필터×보이는 열) · D-day 열 + 기한 초과 배지 · 선택 건 안내문 일괄 생성(미리보기·복사·내려받기).
// 동작은 화면 안 상태(삭제 = 목록에서 빠짐, 드래그 = 순서 바뀜, 열 토글 = 열 숨김). 선택은 앱 전역(app-context)과 공유한다.
import * as React from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  FlexRender,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type Row,
  type SortingState,
} from '@tanstack/react-table'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'
import { toast } from 'sonner'
import { useIsMobile } from '@/hooks/use-mobile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Checkbox } from '@/components/ui/checkbox'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, CircleCheckIcon, CircleDashedIcon,
  Columns3Icon, DownloadIcon, EllipsisVerticalIcon, GripVerticalIcon, LoaderIcon, MailIcon, PlusIcon, StarIcon, TrendingUpIcon,
} from 'lucide-react'
import { navigate, useApp } from '@/lib/app-context'
import {
  addDays, buildHash, cell as cellOf, colLabel, csvFileName, ctx, dateOf, display, distinct, idOf, makeNotices, matchWhere, mmdd, noticeFileName,
  rulesFor, shortTs, tableCols, titleOf, toCsv, tpl,
} from '@/lib/derive'
import { buildReportWorkbook, buildXlsx, downloadXlsx, filterParts, xlsxFileName } from '@/domain/xlsx.mjs'
import { ToneBadge } from '@/widgets/panel'

// ---- 행 모양: 설정의 데이터 열 + 화면 안 표시(즐겨찾기·로컬 추가) ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Rw = Record<string, any> & { __fav?: boolean; __local?: boolean }
const d = ctx.d
const R = ctx.R
const dataCols = tableCols(ctx, 'shadcn') as { key: string; label: string; type: string; badge?: boolean; edit?: boolean; editable?: boolean; unassigned?: string; options?: string[]; names?: Record<string, string>; virtual?: unknown }[]
const rid = (r: Rw) => String(idOf(ctx, r))

const features = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
})

// 열·행에서 쓰는 동작 묶음 — 열 정의는 원본처럼 정적으로 두고 동작은 context 로 받는다.
type Actions = {
  update: (id: string, patch: Partial<Rw>) => void
  remove: (id: string) => void
  copy: (id: string) => void
  open: (id: string) => void
  sort?: { key: string; dir: 'asc' | 'desc'; onSort: (k: string) => void }
}
const ActionsCtx = React.createContext<Actions>(null as unknown as Actions)

function SortHead({ k }: { k: string }) {
  const { sort } = React.useContext(ActionsCtx)
  const num = ctx.byKey[k]?.type === 'number'
  if (!sort) return <>{colLabel(ctx, k)}</>
  return (
    <button type="button" className={`inline-flex items-center gap-1 hover:text-foreground ${num ? 'ml-auto' : ''}`} onClick={() => sort.onSort(k)}>
      {colLabel(ctx, k)}{sort.key === k ? (sort.dir === 'asc' ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />) : null}
    </button>
  )
}

function DragHandle({ id }: { id: string }) {
  const { attributes, listeners } = useSortable({ id })
  return (
    <Button {...attributes} {...listeners} variant="ghost" size="icon" className="size-7 text-muted-foreground hover:bg-transparent">
      <GripVerticalIcon className="size-3 text-muted-foreground" />
      <span className="sr-only">끌어서 순서 바꾸기</span>
    </Button>
  )
}

// 인라인 편집은 현재 표의 임시 미리보기. 서버 저장은 form의 saveDecision 계약을 사용한다.
function InlineNumber({ row, field }: { row: Rw; field: string }) {
  const { update } = React.useContext(ActionsCtx)
  const id = rid(row)
  const commit = (el: HTMLInputElement) => {
    const v = Number(el.value)
    if (el.value.trim() === '' || !Number.isFinite(v) || v < 0) { el.value = String(row[field]); toast.error('0 이상의 숫자를 입력하세요'); return }
    if (v === row[field]) return
    toast('미리보기에 반영했습니다', { description: '새로고침하면 원래 값으로 돌아갑니다.' })
    update(id, { [field]: v })
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); commit(e.currentTarget.elements[0] as HTMLInputElement) }}>
      <Label htmlFor={`${id}-${field}`} className="sr-only">{colLabel(ctx, field)}</Label>
      <Input
        id={`${id}-${field}`}
        inputMode="numeric"
        className="h-8 w-16 border-transparent bg-transparent text-right shadow-none hover:bg-input/30 focus-visible:border focus-visible:bg-background"
        key={row[field]}
        defaultValue={row[field]}
        onBlur={(e) => commit(e.currentTarget)}
      />
    </form>
  )
}

function IdCell({ item }: { item: Rw }) {
  const { open } = React.useContext(ActionsCtx)
  return (
    <span className="inline-flex items-center gap-1">
      <Button variant="link" className="w-fit px-0 text-left text-foreground" onClick={() => open(rid(item))}>{rid(item)}</Button>
      {item.__fav ? <StarIcon className="size-3.5 fill-[var(--sk-orange)] text-[var(--sk-orange)]" aria-label="즐겨찾기" /> : null}
    </span>
  )
}

// 사람 열: 「미지정」 값이면 인라인 Select 로 지정, 아니면 글자
function PersonCell({ item, col }: { item: Rw; col: (typeof dataCols)[number] }) {
  const { update } = React.useContext(ActionsCtx)
  const v = item[col.key]
  if (!col.unassigned || v !== col.unassigned) return <span className="whitespace-nowrap">{v}</span>
  const id = rid(item)
  return (
    <>
      <Label htmlFor={`${id}-${col.key}`} className="sr-only">{col.label}</Label>
      <Select onValueChange={(nv) => { update(id, { [col.key]: nv }); toast.success(`${col.label} 지정`, { description: `${id} → ${nv}` }) }}>
        <SelectTrigger className="w-32 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate" size="sm" id={`${id}-${col.key}`}>
          <SelectValue placeholder={`${col.label} 지정`} />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>{(col.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectGroup>
        </SelectContent>
      </Select>
    </>
  )
}

function StatusBadge({ item, col }: { item: Rw; col: string }) {
  const c = cellOf(ctx, item, col)
  if (c.tone === 'urgent') return <ToneBadge text={c.text} tone="urgent" />
  const done = ctx.byKey[col].values?.find((x: { v: string; done?: boolean }) => x.v === item[col])?.done
  return (
    <Badge variant="outline" className="px-1.5 text-muted-foreground">
      {done ? <CircleCheckIcon className="fill-green-500" /> : c.tone === 'warn' ? <CircleDashedIcon /> : <LoaderIcon />}
      {c.text}
    </Badge>
  )
}

function CellView({ item, col }: { item: Rw; col: (typeof dataCols)[number] }) {
  if (col.key === R.id) return <IdCell item={item} />
  if (col.key === '_dday') { const c = cellOf(ctx, item, '_dday'); return c.text ? <span className={`whitespace-nowrap tabular-nums ${c.tone === 'urgent' ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{c.text}</span> : null }
  if (col.type === 'number' && col.editable) return <InlineNumber row={item} field={col.key} />
  if (col.type === 'person') return <PersonCell item={item} col={col} />
  if (col.type === 'enum' && col.badge) return col.key === R.status ? <StatusBadge item={item} col={col.key} /> : <ToneBadge text={cellOf(ctx, item, col.key).text} tone={cellOf(ctx, item, col.key).tone === 'urgent' ? 'strong' : cellOf(ctx, item, col.key).tone} />
  if (col.type === 'date') return <span className="whitespace-nowrap tabular-nums">{display(ctx, col.key, item[col.key])}</span>
  if (col.names) return <span className="whitespace-nowrap">{item[col.key]} <span className="text-muted-foreground">{col.names[item[col.key]] ?? ''}</span></span>
  if (col.type === 'number') return <span className="block text-right tabular-nums">{item[col.key]}</span>
  return <>{display(ctx, col.key, item[col.key])}</>
}

function RowMenu({ item }: { item: Rw }) {
  const { open, copy, remove, update } = React.useContext(ActionsCtx)
  const id = rid(item)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex size-8 text-muted-foreground data-[state=open]:bg-muted" size="icon">
          <EllipsisVerticalIcon />
          <span className="sr-only">{id} 메뉴</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onSelect={() => open(id)}>편집</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copy(id)}>복제</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { update(id, { __fav: !item.__fav }); toast(item.__fav ? '즐겨찾기 해제' : '즐겨찾기에 추가', { description: id }) }}>{item.__fav ? '즐겨찾기 해제' : '즐겨찾기'}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => remove(id)}>삭제</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const columns: ColumnDef<typeof features, Rw>[] = [
  { id: 'drag', header: () => null, cell: ({ row }) => <DragHandle id={rid(row.original)} /> },
  {
    id: 'select',
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="이 쪽 전체 선택"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(!!value)} aria-label={`${rid(row.original)} 선택`} />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  ...dataCols.map((c): ColumnDef<typeof features, Rw> => ({
    id: c.key,
    header: () => (c.type === 'number' ? <div className="flex w-full justify-end"><SortHead k={c.key} /></div> : <SortHead k={c.key} />),
    cell: ({ row }) => <CellView item={row.original} col={c} />,
    enableHiding: c.key !== R.id,
  })),
  { id: 'actions', cell: ({ row }) => <RowMenu item={row.original} /> },
]
const HIDEABLE = new Set(dataCols.map((c) => c.key).filter((k) => k !== R.id))

function DraggableRow({ row }: { row: Row<typeof features, Rw> }) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({ id: rid(row.original) })
  return (
    <TableRow
      data-state={row.getIsSelected() && 'selected'}
      data-dragging={isDragging}
      data-row={rid(row.original)}
      ref={setNodeRef}
      className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}><FlexRender cell={cell} /></TableCell>
      ))}
    </TableRow>
  )
}

type TabDef = { key: string; label: string; where?: Record<string, unknown>; count?: boolean }
const TABS: TabDef[] = d.tabs
const inTab = (r: Rw, key: string) => { const t = TABS.find((x) => x.key === key); return !t?.where || matchWhere(ctx, r, t.where) }

// 새 행의 번호: 기존 번호의 끝 숫자를 이어서 올린다(예: AB-0400 → AB-0401)
function nextId(rows: Rw[]) {
  const ids = ctx.rows.map(rid).concat(rows.map(rid))
  const m = /^(.*?)(\d+)$/.exec(ids[0] ?? '')
  if (!m) return `NEW-${ids.length + 1}`
  const pre = m[1], width = m[2].length
  let n = 0
  for (const id of ids) { const x = new RegExp(`^${pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`).exec(id); if (x) n = Math.max(n, Number(x[1])) }
  return `${pre}${String(n + 1).padStart(width, '0')}`
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function DataTable({ rows, sort }: { rows: Rw[]; sort?: Actions['sort'] }) {
  const { route, selected, toggleSelected } = useApp()
  const [data, setData] = React.useState<Rw[]>(() => rows.map((r) => ({ ...r })))
  const sig = React.useMemo(() => rows.map(rid).join('|'), [rows])
  const first = React.useRef(true)
  React.useEffect(() => { if (first.current) { first.current = false; return } setData(rows.map((r) => ({ ...r }))) }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = React.useState<string>(TABS[0].key)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [noticeText, setNoticeText] = React.useState<string | null>(null)
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 })
  const sortableId = React.useId()
  const sensors = useSensors(useSensor(MouseSensor, {}), useSensor(TouchSensor, {}), useSensor(KeyboardSensor, {}))

  const tabRows = React.useMemo(() => data.filter((r) => inTab(r, tab)), [data, tab])
  const dataIds = React.useMemo<UniqueIdentifier[]>(() => tabRows.map(rid), [tabRows])
  const pageCount = Math.max(1, Math.ceil(tabRows.length / pagination.pageSize))
  const pageIndex = Math.min(pagination.pageIndex, pageCount - 1)
  const rowSelection = React.useMemo(() => Object.fromEntries([...selected].map((id) => [id, true as const])), [selected])

  const table = useTable({
    features,
    data: tabRows,
    columns,
    state: { sorting, columnVisibility, rowSelection, columnFilters, pagination: { ...pagination, pageIndex } },
    getRowId: (row) => rid(row),
    enableRowSelection: true,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater
      const on = Object.keys(next).filter((k) => next[k])
      const add = on.filter((id) => !selected.has(id))
      const del = [...selected].filter((id) => !next[id])
      if (add.length) toggleSelected(add, true)
      if (del.length) toggleSelected(del, false)
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
  })

  const actions = React.useMemo<Actions>(() => ({
    update: (id, patch) => setData((rs) => rs.map((r) => (rid(r) === id ? { ...r, ...patch } : r))),
    remove: (id) => {
      setData((rs) => rs.filter((r) => rid(r) !== id))
      toggleSelected([id], false)
      toast('목록에서 뺐습니다', { description: id })
    },
    copy: (id) => {
      setData((rs) => {
        const i = rs.findIndex((r) => rid(r) === id)
        if (i < 0) return rs
        let n = 1
        while (rs.some((r) => rid(r) === `${id}-복사${n}`)) n++
        const next = [...rs]
        next.splice(i + 1, 0, { ...rs[i], [R.id]: `${id}-복사${n}`, __fav: false, __local: true })
        return next
      })
      toast.success('복제됨', { description: id })
    },
    open: setOpenId,
    sort,
  }), [sort, toggleSelected])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!active || !over || active.id === over.id) return
    setData((rs) => {
      // 탭으로 걸러진 행끼리만 자리를 바꾸고, 나머지 행의 자리는 그대로 둔다.
      const slots = rs.map((r, i) => (inTab(r, tab) ? i : -1)).filter((i) => i >= 0)
      const sub = slots.map((i) => rs[i])
      const from = sub.findIndex((r) => rid(r) === active.id)
      const to = sub.findIndex((r) => rid(r) === over.id)
      if (from < 0 || to < 0) return rs
      const moved = arrayMove(sub, from, to)
      const next = [...rs]
      slots.forEach((slot, k) => { next[slot] = moved[k] })
      return next
    })
  }

  // 행 추가: 설정의 newRow(기본값, {_today} 가능) + 그룹 필터가 걸려 있으면 그 그룹. 나머지 칸은 비워 두고 Drawer 에서 채운다.
  const addRow = () => {
    const base: Rw = {}
    for (const c of dataCols) base[c.key] = c.type === 'number' ? 0 : ''
    for (const [k, v] of Object.entries(d.newRow ?? {})) base[k] = typeof v === 'string' ? tpl(ctx, v, {}) : v
    if (R.group && route.group && route.group !== '전체') base[R.group] = route.group
    const row: Rw = { ...base, [R.id]: nextId(data), __local: true }
    setData((rs) => [row, ...rs])
    setTab(TABS[0].key)
    setPagination((p) => ({ ...p, pageIndex: 0 }))
    setOpenId(rid(row))
    toast.success(`${d.entity.singular} 추가됨`, { description: rid(row) })
  }

  const countOf = (t: TabDef) => data.filter((r) => inTab(r, t.key)).length
  const changeTab = (v: string) => { setTab(v); setPagination((p) => ({ ...p, pageIndex: 0 })) }
  const openRow = data.find((r) => rid(r) === openId)
  const toReport = () => {
    const ids = [...selected].filter((id) => ctx.rows.some((a) => rid(a) === id))
    navigate(buildHash('report', { period: route.period === '7d' ? undefined : route.period, group: route.group === '전체' ? undefined : route.group, ids: ids.join(',') }))
  }

  // CSV: 지금 필터(기간·그룹·검색·탭)를 통과한 모든 행 × 지금 보이는 열. 쪽 이동과 무관.
  const exportCsv = () => {
    const keys = dataCols.map((c) => c.key).filter((k) => columnVisibility[k] !== false)
    const out = table.getFilteredRowModel().rows.map((r) => r.original)
    download(csvFileName(ctx), toCsv(ctx, out, keys), 'text/csv;charset=utf-8')
    toast.success('CSV 내보냄', { description: `${out.length}${d.entity.unit} · 열 ${keys.length}개` })
  }
  // 엑셀: 같은 행·열 + 「요약」 시트(지표 표). 파일 이름 = 도메인 제목-기준일-필터
  const exportXlsx = () => {
    const keys = dataCols.map((c) => c.key).filter((k) => columnVisibility[k] !== false)
    const out = table.getFilteredRowModel().rows.map((r) => r.original)
    const extra = tab === TABS[0].key ? [] : [TABS.find((t) => t.key === tab)?.label ?? '']
    downloadXlsx(xlsxFileName(ctx, filterParts(ctx, route, extra)), buildXlsx(buildReportWorkbook(ctx, route, { rows: out, keys, extra })))
    toast.success('엑셀 내보냄', { description: `${out.length}${d.entity.unit} · 열 ${keys.length}개` })
  }
  const selectedRows = table.getFilteredRowModel().rows.map((r) => r.original).filter((r) => selected.has(rid(r)))
  const makeNotice = () => setNoticeText(makeNotices(ctx, selectedRows))

  return (
    <ActionsCtx.Provider value={actions}>
      <p className="px-4 text-xs text-muted-foreground lg:px-6" data-local-edit-note>표 안의 수정·추가·복제·삭제는 현재 화면의 미리보기입니다. 새로고침하면 초기화됩니다. 판정 기록은 입력·판정 화면에서 저장하세요.</p>
      <Tabs value={tab} onValueChange={changeTab} className="w-full flex-col justify-start gap-6" data-table>
        <div className="flex items-center justify-between px-4 lg:px-6">
          <Label htmlFor="view-selector" className="sr-only">보기</Label>
          <Select value={tab} onValueChange={changeTab}>
            <SelectTrigger className="flex w-fit @4xl/main:hidden" size="sm" id="view-selector"><SelectValue placeholder="보기 선택" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TABS.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}{t.count ? ` ${countOf(t)}` : ''}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
          <TabsList className="hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 @4xl/main:flex">
            {TABS.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}{t.count ? <> <Badge variant="secondary">{countOf(t)}</Badge></> : null}</TabsTrigger>)}
          </TabsList>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!selected.size} onClick={toReport}>
              <span className="hidden lg:inline">선택 건 </span>리포트에 담기
            </Button>
            {d.notice?.template ? (
              <Button variant="outline" size="sm" disabled={!selectedRows.length} onClick={makeNotice} data-act="notice">
                <MailIcon />
                <span className="hidden lg:inline">안내문 일괄 생성</span>
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-act="export">
                  <DownloadIcon />
                  <span className="hidden lg:inline">내보내기</span>
                  <ChevronDownIcon data-icon="inline-end" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                <DropdownMenuItem onSelect={exportCsv} data-act="csv" aria-label="CSV 내보내기">CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={exportXlsx} data-act="xlsx" aria-label="엑셀 내보내기">엑셀</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Columns3Icon data-icon="inline-start" />
                  열
                  <ChevronDownIcon data-icon="inline-end" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                {table
                  .getAllColumns()
                  .filter((column) => HIDEABLE.has(column.id) && column.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onCheckedChange={(value) => column.toggleVisibility(!!value)}>
                      {colLabel(ctx, column.id)}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={addRow}>
              <PlusIcon />
              <span className="hidden lg:inline">{d.entity.singular} 추가</span>
            </Button>
          </div>
        </div>
        <div className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
          <div className="overflow-hidden rounded-lg border">
            <DndContext collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd} sensors={sensors} id={sortableId}>
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id} colSpan={header.colSpan}>
                          {header.isPlaceholder ? null : <FlexRender header={header} />}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody className="**:data-[slot=table-cell]:first:w-8">
                  {table.getRowModel().rows?.length ? (
                    <SortableContext items={dataIds} strategy={verticalListSortingStrategy}>
                      {table.getRowModel().rows.map((row) => <DraggableRow key={row.id} row={row} />)}
                    </SortableContext>
                  ) : (
                    <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">조건에 맞는 {d.entity.plural}이(가) 없습니다.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </DndContext>
          </div>
          <div className="flex items-center justify-between px-4">
            <div className="hidden flex-1 text-sm text-muted-foreground lg:flex" data-sel>
              선택 {table.getFilteredSelectedRowModel().rows.length}개 / 전체 {table.getFilteredRowModel().rows.length}{d.entity.unit}
            </div>
            <div className="flex w-full items-center gap-8 lg:w-fit">
              <div className="hidden items-center gap-2 lg:flex">
                <Label htmlFor="rows-per-page" className="text-sm font-medium">쪽당 행 수</Label>
                <Select value={`${pagination.pageSize}`} onValueChange={(value) => table.setPageSize(Number(value))}>
                  <SelectTrigger size="sm" className="w-20" id="rows-per-page"><SelectValue placeholder={pagination.pageSize} /></SelectTrigger>
                  <SelectContent side="top">
                    <SelectGroup>{[10, 20, 30, 40, 50].map((pageSize) => <SelectItem key={pageSize} value={`${pageSize}`}>{pageSize}</SelectItem>)}</SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-fit items-center justify-center text-sm font-medium" data-page>{pageIndex + 1} / {pageCount} 쪽</div>
              <div className="ml-auto flex items-center gap-2 lg:ml-0">
                <Button variant="outline" className="hidden h-8 w-8 p-0 lg:flex" onClick={() => table.setPageIndex(0)} disabled={pageIndex <= 0}>
                  <span className="sr-only">첫 쪽</span><ChevronsLeftIcon />
                </Button>
                <Button variant="outline" className="size-8" size="icon" onClick={() => table.setPageIndex(pageIndex - 1)} disabled={pageIndex <= 0}>
                  <span className="sr-only">이전 쪽</span><ChevronLeftIcon />
                </Button>
                <Button variant="outline" className="size-8" size="icon" onClick={() => table.setPageIndex(pageIndex + 1)} disabled={pageIndex >= pageCount - 1}>
                  <span className="sr-only">다음 쪽</span><ChevronRightIcon />
                </Button>
                <Button variant="outline" className="hidden size-8 lg:flex" size="icon" onClick={() => table.setPageIndex(pageCount - 1)} disabled={pageIndex >= pageCount - 1}>
                  <span className="sr-only">끝 쪽</span><ChevronsRightIcon />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Tabs>
      {openRow ? <RowDrawer key={rid(openRow)} item={openRow} onClose={() => setOpenId(null)} /> : null}
      {noticeText !== null ? <NoticeDrawer text={noticeText} count={selectedRows.length} onClose={() => setNoticeText(null)} /> : null}
    </ActionsCtx.Provider>
  )
}

// 안내문 일괄 생성 미리보기 — 설정의 notice.template 을 선택한 행마다 채운 글. 복사·내려받기.
function NoticeDrawer({ text, count, onClose }: { text: string; count: number; onClose: () => void }) {
  const isMobile = useIsMobile()
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.success('복사됨', { description: `안내문 ${count}건` }) } catch { toast.error('복사하지 못했습니다', { description: '미리보기 글을 직접 선택해 복사하세요.' }) }
  }
  return (
    <Drawer open direction={isMobile ? 'bottom' : 'right'} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent data-notice>
        <DrawerHeader className="gap-1">
          <DrawerTitle>안내문 미리보기 · {count}{d.entity.unit}</DrawerTitle>
          <DrawerDescription>설정(domain.json)의 안내문 틀에 선택한 {d.entity.plural}을(를) 채운 글입니다.</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4">
          <Label htmlFor="notice-text" className="sr-only">안내문</Label>
          <Textarea id="notice-text" readOnly value={text} className="min-h-96 flex-1 font-mono text-xs" />
        </div>
        <DrawerFooter>
          <Button onClick={copy}>복사</Button>
          <Button variant="outline" onClick={() => download(noticeFileName(ctx), `\uFEFF${text}\r\n`, 'text/plain;charset=utf-8')}>내려받기</Button>
          <DrawerClose asChild><Button variant="outline">닫기</Button></DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

const chartConfig = { n: { label: d.entity.plural, color: 'var(--chart-1)' } } satisfies ChartConfig

// 상세 Drawer — 원본 TableCellViewer: 미니 차트 + 요약 + 편집 폼. 내용은 #/item 상세의 요약.
function RowDrawer({ item, onClose }: { item: Rw; onClose: () => void }) {
  const isMobile = useIsMobile()
  const { update } = React.useContext(ActionsCtx)
  // 편집 가능한 열: 설정의 edit:true (새로 추가한 행은 번호를 뺀 모든 열)
  const fields = dataCols.filter((c) => c.key !== R.id && c.key !== '_dday' && (c.edit || item.__local) && !c.virtual || (c.editable && c.edit))
  const [draft, setDraft] = React.useState<Record<string, string>>(() => Object.fromEntries(fields.map((c) => [c.key, String(item[c.key] ?? '')])))
  const rel = d.related as { col: string; title: string; days?: number } | undefined
  const series = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(ctx.today, i - 6)
    return { x: mmdd(day), n: rel ? ctx.rows.filter((a) => a[rel.col] === item[rel.col] && dateOf(ctx, a) === day).length : 0 }
  })
  const total = series.reduce((t, s) => t + s.n, 0)
  const { applied } = rulesFor(ctx, item)
  const set = (k: string) => (v: string) => setDraft((x) => ({ ...x, [k]: v }))
  const save = () => {
    const patch: Rw = {}
    for (const c of fields) {
      if (c.type === 'number') {
        const n = Number(draft[c.key])
        if (draft[c.key].trim() === '' || !Number.isFinite(n) || n < 0) { toast.error(`${c.label} 은(는) 0 이상의 숫자`); return }
        patch[c.key] = n
      } else patch[c.key] = draft[c.key].trim() || item[c.key]
    }
    update(rid(item), patch)
    toast('미리보기에 반영했습니다', { description: `${rid(item)} · 새로고침하면 원래 값으로 돌아갑니다.` })
    onClose()
  }
  const meta = [R.owner && item[R.owner], R.group && `${item[R.group]}${d.group?.suffix ? ' ' + d.group.suffix : ''}`, R.date && `${colLabel(ctx, R.date)} ${shortTs(item[R.date])}`].filter(Boolean).join(' · ')
  const opts = (c: (typeof dataCols)[number]) => (c.type === 'enum' ? distinct(ctx, c.key) : [...(c.options ?? distinct(ctx, c.key)), ...(c.unassigned ? [c.unassigned] : [])].filter((v, i, a) => a.indexOf(v) === i))
  return (
    <Drawer open direction={isMobile ? 'bottom' : 'right'} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{rid(item)} · {titleOf(ctx, item)}</DrawerTitle>
          <DrawerDescription>{meta}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          {!isMobile && (
            <>
              {rel ? (
                <>
                  <ChartContainer config={chartConfig}>
                    <AreaChart accessibilityLayer data={series} margin={{ left: 0, right: 10 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="x" tickLine={false} axisLine={false} tickMargin={8} hide />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                      <Area dataKey="n" type="natural" fill="var(--color-n)" fillOpacity={0.4} stroke="var(--color-n)" />
                    </AreaChart>
                  </ChartContainer>
                  <Separator />
                </>
              ) : null}
              <div className="grid gap-2">
                {rel ? <div className="flex gap-2 leading-none font-medium">최근 7일 {item[rel.col]} {d.entity.plural} {total}{d.entity.unit} <TrendingUpIcon className="size-4" /></div> : null}
                <div className="flex flex-wrap items-center gap-2">
                  {R.priority ? <ToneBadge text={String(item[R.priority])} tone={cellOf(ctx, item, R.priority).tone === 'urgent' ? 'strong' : cellOf(ctx, item, R.priority).tone} /> : null}
                  {R.status ? <ToneBadge text={String(item[R.status])} tone={cellOf(ctx, item, R.status).tone} /> : null}
                  {cellOf(ctx, item, '_dday').text ? <span className={`text-sm tabular-nums ${cellOf(ctx, item, '_dday').tone === 'urgent' ? 'font-medium' : 'text-muted-foreground'}`}>{cellOf(ctx, item, '_dday').text}</span> : null}
                </div>
                <p className="rounded-md bg-muted/50 p-2 text-xs break-all text-muted-foreground">{dataCols.filter((c) => !c.virtual && c.key !== '_dday').map((c) => item[c.key]).join(' / ')}</p>
                {applied.map((r: { text: string }) => <p key={r.text} className="text-xs text-muted-foreground">{r.text}</p>)}
              </div>
              <Separator />
            </>
          )}
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save() }}>
            <div className="grid grid-cols-2 gap-4">
              {fields.map((c) => (
                <div key={c.key} className="flex flex-col gap-3">
                  <Label htmlFor={`d-${c.key}`}>{c.label}</Label>
                  {c.type === 'enum' || (c.type === 'person' && (c.options || c.unassigned)) ? (
                    <Select value={draft[c.key]} onValueChange={set(c.key)}>
                      <SelectTrigger id={`d-${c.key}`} className="w-full"><SelectValue placeholder={`${c.label} 선택`} /></SelectTrigger>
                      <SelectContent><SelectGroup>{opts(c).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                  ) : (
                    <Input id={`d-${c.key}`} inputMode={c.type === 'number' ? 'numeric' : undefined} value={draft[c.key]} onChange={(e) => set(c.key)(e.target.value)} />
                  )}
                </div>
              ))}
            </div>
          </form>
        </div>
        <DrawerFooter>
          <Button onClick={save}>미리보기에 적용</Button>
          {item.__local ? null : <Button variant="outline" asChild><a href={`#/item/${rid(item)}`}>상세 열기</a></Button>}
          <DrawerClose asChild><Button variant="outline">닫기</Button></DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
