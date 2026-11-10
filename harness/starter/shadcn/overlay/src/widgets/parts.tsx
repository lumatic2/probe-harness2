// parts.tsx — 기본 부품 U1~U19. 데이터 위젯(W1~W19)과 달리 도메인 설정을 읽지 않는다 — props 로 받은 것만 그린다.
// 카탈로그는 #/widgets 「기본 부품」. 실전 화면에서는 여기서 import 해 props 만 채운다(모양·상태 표현은 그대로 둔다).
// 원본 shadcn 부품(accordion·tabs·calendar·breadcrumb·skeleton·resizable·alert)은 그대로 쓰고, 원본에 없는 것(단계 표시·트리·끌어다 놓기·태그 입력·조건 필터·세로 탭 레이아웃·설정 행·선택 카드·반복 입력 줄·다중 선택 필터·카드 격자·상태 화면)만 여기서 만든다.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CalendarIcon, CheckIcon, ChevronRightIcon, PlusIcon, UploadIcon, XIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

// ───────── 움직임 도우미 — 한도는 sk-theme.css 「움직임」(접힘 150ms · 새 행 강조 1회).
// Reveal: 내용을 150ms 로 펼치고 접는다. 접힌 동안에도 DOM 에 남으므로 inert 로 포커스·읽기를 막는다.
export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return <div className="sk-reveal" data-open={open} inert={!open}><div>{children}</div></div>
}
// useFreshIds: 처음 그린 뒤에 새로 생긴 id 만 돌려준다 — 방금 저장된 행에 className="sk-flash" 를 붙일 때 쓴다(1.3초 뒤에는 새것이 아니다).
export function useFreshIds(ids: string[]): Set<string> {
  const seen = useRef<Set<string> | null>(null)
  if (seen.current === null) seen.current = new Set(ids)
  const fresh = new Set(ids.filter((id) => !seen.current!.has(id)))
  const key = ids.join('|')
  useEffect(() => {
    const t = setTimeout(() => { for (const id of key ? key.split('|') : []) seen.current!.add(id) }, 1300)
    return () => clearTimeout(t)
  }, [key])
  return fresh
}

// ───────── U3 단계 표시 — 여러 화면에 걸친 절차에서 지금 어디인지. current = 0 부터, 그 앞은 완료.
export type Step = { label: string; note?: string }
export function Stepper({ steps, current, onStep }: { steps: Step[]; current: number; onStep?: (index: number) => void }) {
  return (
    <ol className="flex flex-wrap items-start gap-x-2 gap-y-3" aria-label="진행 단계">
      {steps.map((s, i) => {
        const state = i < current ? '완료' : i === current ? '진행 중' : '대기'
        const dot = (
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums ${i < current ? 'border-primary bg-primary text-primary-foreground' : i === current ? 'border-primary font-semibold' : 'text-muted-foreground'}`}>
            {i < current ? <CheckIcon className="size-4" /> : i + 1}
          </span>
        )
        const body = (
          <span className="flex flex-col text-left">
            <span className={`text-sm ${i === current ? 'font-semibold' : i > current ? 'text-muted-foreground' : ''}`}>{s.label}</span>
            <span className="text-xs text-muted-foreground">{s.note ?? state}</span>
          </span>
        )
        return (
          <li key={s.label} className="flex items-center gap-2" aria-current={i === current ? 'step' : undefined}>
            {onStep && i < current
              ? <button type="button" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onStep(i)} aria-label={`${s.label} 단계로 돌아가기`}>{dot}{body}</button>
              : <span className="flex items-center gap-2">{dot}{body}</span>}
            {i < steps.length - 1 ? <span className="mx-1 hidden h-px w-8 bg-border sm:block" aria-hidden /> : null}
          </li>
        )
      })}
    </ol>
  )
}

// ───────── U4 트리 — 라인 > 설비 > 챔버처럼 계층이 있는 대상을 접고 펴며 고를 때.
export type TreeNode = { id: string; label: string; meta?: string; children?: TreeNode[] }
export function TreeView({ nodes, selected, onSelect, defaultOpen = [] }: { nodes: TreeNode[]; selected?: string; onSelect?: (id: string) => void; defaultOpen?: string[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpen))
  const toggle = (id: string) => setOpen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const render = (list: TreeNode[], depth: number): ReactNode => (
    <ul role={depth ? 'group' : 'tree'} className={depth ? 'ml-4 border-l pl-2' : ''}>
      {list.map((n) => {
        const has = !!n.children?.length
        const isOpen = open.has(n.id)
        return (
          <li key={n.id} role="treeitem" aria-expanded={has ? isOpen : undefined} aria-selected={selected === n.id}>
            <div className={`flex items-center gap-1 rounded-md px-1 py-1 text-sm ${selected === n.id ? 'bg-muted font-medium' : 'hover:bg-muted/60'}`}>
              {has
                ? <button type="button" className="rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => toggle(n.id)} aria-label={`${n.label} ${isOpen ? '접기' : '펼치기'}`}><ChevronRightIcon className={`size-4 transition-transform duration-100 ${isOpen ? 'rotate-90' : ''}`} /></button>
                : <span className="inline-block size-5" aria-hidden />}
              <button type="button" className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onSelect?.(n.id)}>
                <span className="truncate">{n.label}</span>
                {n.meta ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{n.meta}</span> : null}
              </button>
            </div>
            {has ? <Reveal open={isOpen}>{render(n.children!, depth + 1)}</Reveal> : null}
          </li>
        )
      })}
    </ul>
  )
  return render(nodes, 0)
}

// ───────── U5 기간 고르기 — 시작일~종료일. 값은 'YYYY-MM-DD' 글자(시간대 계산 없이 그대로 서버에 넘긴다).
export type DateRange = { from?: string; to?: string }
const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fromYmd = (s?: string) => { if (!s) return undefined; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export function DateRangePicker({ value, onChange, placeholder = '기간 선택' }: { value: DateRange; onChange: (next: DateRange) => void; placeholder?: string }) {
  const label = value.from ? `${value.from} ~ ${value.to ?? ''}` : placeholder
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`justify-start gap-2 font-normal tabular-nums ${value.from ? '' : 'text-muted-foreground'}`}><CalendarIcon className="size-4" />{label}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="range" numberOfMonths={2} selected={{ from: fromYmd(value.from), to: fromYmd(value.to) }} onSelect={(r) => onChange({ from: r?.from ? toYmd(r.from) : undefined, to: r?.to ? toYmd(r.to) : undefined })} />
        <div className="flex justify-end border-t p-2"><Button variant="ghost" size="sm" onClick={() => onChange({})}>지우기</Button></div>
      </PopoverContent>
    </Popover>
  )
}

// ───────── U6 파일 끌어다 놓기 — 파일을 브라우저에서 읽기만 한다(전송은 onFiles 를 받은 쪽이 한다). accept 는 '.csv,.xlsx' 꼴.
export function Dropzone({ accept, multiple, maxBytes = 5 * 1024 * 1024, onFiles, hint }: { accept?: string; multiple?: boolean; maxBytes?: number; onFiles: (files: File[]) => void; hint?: string }) {
  const [over, setOver] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const take = (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    const exts = (accept ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    const bad = files.find((f) => exts.length && !exts.some((e) => f.name.toLowerCase().endsWith(e)))
    if (bad) { setError(`「${bad.name}」은 받을 수 없는 형식입니다. 받을 수 있는 형식: ${exts.join(', ')}`); return }
    const big = files.find((f) => f.size > maxBytes)
    if (big) { setError(`「${big.name}」이 너무 큽니다. 한 파일 최대 ${(maxBytes / 1024 / 1024).toFixed(0)}MB`); return }
    setError('')
    onFiles(multiple ? files : files.slice(0, 1))
  }
  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm focus-within:ring-2 focus-within:ring-ring ${over ? 'bg-muted' : 'hover:bg-muted/50'}`}
      >
        <UploadIcon className="size-5 text-muted-foreground" />
        <span>파일을 여기에 놓거나 눌러서 고르세요</span>
        <span className="text-xs text-muted-foreground">{hint ?? `${accept ? `${accept} · ` : ''}한 파일 최대 ${(maxBytes / 1024 / 1024).toFixed(0)}MB`}</span>
        <input ref={input} id={id} type="file" accept={accept} multiple={multiple} className="sr-only" onChange={(e) => { take(e.target.files); if (input.current) input.current.value = '' }} aria-describedby={error ? `${id}-error` : undefined} />
      </label>
      {error ? <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

// ───────── U7 태그 입력 — 자유 입력 값 여러 개(설비 ID·키워드). Enter 또는 쉼표로 추가, 빈 입력에서 Backspace 로 마지막 것 삭제.
export function TagsInput({ value, onChange, placeholder = '입력 후 Enter', max = 20, label }: { value: string[]; onChange: (next: string[]) => void; placeholder?: string; max?: number; label: string }) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const items = raw.split(',').map((s) => s.trim()).filter(Boolean)
    if (!items.length) return
    const next = [...value]
    for (const it of items) if (!next.includes(it) && next.length < max) next.push(it)
    onChange(next); setDraft('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
      {value.map((t) => (
        <Badge key={t} variant="secondary" className="gap-1">
          {t}
          <button type="button" className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`${t} 삭제`}><XIcon className="size-3" /></button>
        </Badge>
      ))}
      <input
        value={draft}
        aria-label={label}
        placeholder={value.length >= max ? `최대 ${max}개` : placeholder}
        disabled={value.length >= max}
        className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
        onChange={(e) => { if (e.target.value.includes(',')) add(e.target.value); else setDraft(e.target.value) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); add(draft) }
          else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={() => add(draft)}
      />
    </div>
  )
}

// ───────── U8 조건 필터 — 「열 · 비교 · 값」 줄을 여러 개 쌓고 모두/하나라도 로 묶는다. matchRow 로 행을 거른다.
export type FilterField = { key: string; label: string; type: 'text' | 'number' }
export type FilterRule = { id: string; field: string; op: string; value: string }
export type FilterState = { join: 'and' | 'or'; rules: FilterRule[] }
const OPS: Record<FilterField['type'], { v: string; label: string }[]> = {
  text: [{ v: 'has', label: '포함' }, { v: 'eq', label: '같음' }, { v: 'ne', label: '다름' }],
  number: [{ v: 'gte', label: '이상' }, { v: 'lte', label: '이하' }, { v: 'eq', label: '같음' }],
}
export function matchRow(row: Record<string, unknown>, state: FilterState): boolean {
  const active = state.rules.filter((r) => r.value.trim() !== '')
  if (!active.length) return true
  const test = (r: FilterRule) => {
    const cell = row[r.field]
    if (r.op === 'gte' || r.op === 'lte') { const a = Number(cell), b = Number(r.value); return Number.isFinite(a) && Number.isFinite(b) && (r.op === 'gte' ? a >= b : a <= b) }
    const a = String(cell ?? '').toLowerCase(), b = r.value.trim().toLowerCase()
    return r.op === 'has' ? a.includes(b) : r.op === 'ne' ? a !== b : a === b
  }
  return state.join === 'and' ? active.every(test) : active.some(test)
}
export function FilterBuilder({ fields, value, onChange }: { fields: FilterField[]; value: FilterState; onChange: (next: FilterState) => void }) {
  const seq = useRef(0)
  const typeOf = (key: string) => fields.find((f) => f.key === key)?.type ?? 'text'
  const patch = (id: string, part: Partial<FilterRule>) => onChange({ ...value, rules: value.rules.map((r) => (r.id === id ? { ...r, ...part } : r)) })
  const addRule = () => { seq.current += 1; onChange({ ...value, rules: [...value.rules, { id: `r${Date.now()}-${seq.current}`, field: fields[0].key, op: OPS[fields[0].type][0].v, value: '' }] }) }
  return (
    <div className="flex flex-col gap-2">
      {value.rules.length > 1 ? (
        <ToggleGroup type="single" variant="outline" size="sm" value={value.join} onValueChange={(v) => v && onChange({ ...value, join: v as 'and' | 'or' })} aria-label="조건 묶는 방식" className="self-start">
          <ToggleGroupItem value="and">모두 만족</ToggleGroupItem>
          <ToggleGroupItem value="or">하나라도 만족</ToggleGroupItem>
        </ToggleGroup>
      ) : null}
      {value.rules.map((r, i) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2">
          <Select value={r.field} onValueChange={(v) => patch(r.id, { field: v, op: OPS[typeOf(v)][0].v })}>
            <SelectTrigger size="sm" className="w-36" aria-label={`조건 ${i + 1} 열`}><SelectValue /></SelectTrigger>
            <SelectContent>{fields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={r.op} onValueChange={(v) => patch(r.id, { op: v })}>
            <SelectTrigger size="sm" className="w-24" aria-label={`조건 ${i + 1} 비교`}><SelectValue /></SelectTrigger>
            <SelectContent>{OPS[typeOf(r.field)].map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="h-8 w-40" inputMode={typeOf(r.field) === 'number' ? 'decimal' : 'text'} value={r.value} onChange={(e) => patch(r.id, { value: e.target.value })} aria-label={`조건 ${i + 1} 값`} placeholder="값" />
          <Button variant="ghost" size="icon" className="size-8" onClick={() => onChange({ ...value, rules: value.rules.filter((x) => x.id !== r.id) })} aria-label={`조건 ${i + 1} 삭제`}><XIcon className="size-4" /></Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="self-start" onClick={addRule}><PlusIcon className="size-4" />조건 추가</Button>
    </div>
  )
}

// ───────── U9 알림 띠 — 화면 전체에 걸리는 상태(데이터 기준 시각·점검 중·한도 임박)를 맨 위에 한 줄로. 닫아도 원인이 남아 있으면 다음 진입 때 다시 보인다(닫힘을 저장하지 않는다).
export function Banner({ title, children, tone = 'info', action, dismissible = true }: { title: string; children?: ReactNode; tone?: 'info' | 'warn'; action?: ReactNode; dismissible?: boolean }) {
  const [leaving, setLeaving] = useState(false)
  const [closed, setClosed] = useState(false)
  if (closed) return null
  const close = () => { setLeaving(true); setTimeout(() => setClosed(true), 160) } // 접히는 150ms 뒤에 치운다
  return (
    <Reveal open={!leaving}>
    <Alert className={`flex items-start justify-between gap-3 ${tone === 'warn' ? 'sk-urgent' : ''}`}>
      <div>
        <AlertTitle>{tone === 'warn' ? '주의 · ' : ''}{title}</AlertTitle>
        {children ? <AlertDescription className={tone === 'warn' ? 'text-inherit' : ''}>{children}</AlertDescription> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {action}
        {dismissible ? <Button variant="ghost" size="icon" className="size-7" onClick={close} aria-label="알림 닫기"><XIcon className="size-4" /></Button> : null}
      </div>
    </Alert>
    </Reveal>
  )
}

// ───────── U10 로딩 뼈대 — 1초 넘게 걸리는 요청(계산 실행·AI 응답·큰 조회)에서만. 로컬에서 바로 뜨는 데이터에는 쓰지 않는다. 움직임은 원본 그대로.
export function LoadingRows({ rows = 4, label = '불러오는 중' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-24" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-16" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
}

// ───────── U13 세로 탭 레이아웃 — 설정처럼 묶음이 4개 넘는 화면. 왼쪽에 묶음 이름, 오른쪽에 고른 묶음의 내용. 좁은 화면에서는 위쪽 가로 줄로 바뀐다.
export type Section = { key: string; label: string; icon?: ReactNode; content: ReactNode }
export function SectionNav({ sections, value, onChange, label }: { sections: Section[]; value: string; onChange: (key: string) => void; label: string }) {
  const current = sections.find((s) => s.key === value) ?? sections[0]
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <nav aria-label={label} className="flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col">
        {sections.map((s) => (
          <button key={s.key} type="button" aria-current={s.key === current.key ? 'page' : undefined} onClick={() => onChange(s.key)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${s.key === current.key ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>
            {s.icon}{s.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{current.content}</div>
    </div>
  )
}

// ───────── U14 설정 행 — 켜고 끄는 항목 하나를 「이름 + 설명 + 스위치」 한 줄로. 여러 개를 세로로 쌓는다. 바꾸면 바로 적용되는 항목에만(저장 버튼이 따로 있으면 Checkbox).
export function SettingRow({ title, description, checked, onChange, disabled }: { title: string; description?: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">{title}</label>
        {description ? <p id={`${id}-d`} className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-describedby={description ? `${id}-d` : undefined} />
    </div>
  )
}

// ───────── U15 선택 카드 — 2~4개 중 하나를 고르는데 글자만으로는 차이가 안 보일 때(보기 방식·배치·계산 방식). 카드 안에 미리보기나 설명을 둔다.
export type Choice = { value: string; label: string; description?: string; preview?: ReactNode }
export function ChoiceCards({ options, value, onChange, label }: { options: Choice[]; value: string; onChange: (value: string) => void; label: string }) {
  const name = useId()
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {options.map((o) => (
        <label key={o.value} className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${o.value === value ? 'border-primary bg-muted/50' : 'hover:bg-muted/40'}`}>
          <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} className="sr-only" />
          {o.preview ? <div className="rounded-md border bg-background p-2">{o.preview}</div> : null}
          <span className="flex items-center justify-between gap-2 text-sm font-medium">{o.label}{o.value === value ? <CheckIcon className="size-4" aria-hidden /> : null}</span>
          {o.description ? <span className="text-xs text-muted-foreground">{o.description}</span> : null}
        </label>
      ))}
    </div>
  )
}

// ───────── U16 반복 입력 줄 — 같은 모양의 값을 줄 단위로 더하고 빼는 입력(연락처·주소·기준 구간). 줄이 0개가 되지 않게 min 을 둔다.
export function RepeatRows({ value, onChange, label, placeholder, addLabel = '줄 추가', min = 1, max = 10 }: { value: string[]; onChange: (next: string[]) => void; label: string; placeholder?: string; addLabel?: string; min?: number; max?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {value.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={v} placeholder={placeholder} aria-label={`${label} ${i + 1}`} onChange={(e) => onChange(value.map((x, k) => (k === i ? e.target.value : x)))} />
          <Button variant="ghost" size="icon" className="size-8 shrink-0" disabled={value.length <= min} onClick={() => onChange(value.filter((_, k) => k !== i))} aria-label={`${label} ${i + 1} 삭제`}><XIcon className="size-4" /></Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="self-start" disabled={value.length >= max} onClick={() => onChange([...value, ''])}><PlusIcon className="size-4" />{addLabel}</Button>
    </div>
  )
}

// ───────── U17 다중 선택 필터 — 한 열의 값 여러 개를 골라 목록을 좁히는 버튼. 값마다 건수를 보여 주고, 고른 것은 버튼에 배지로 남는다.
export type FacetOption = { value: string; label: string; count?: number }
export function FacetFilter({ title, options, value, onChange }: { title: string; options: FacetOption[]; value: string[]; onChange: (next: string[]) => void }) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  const picked = options.filter((o) => value.includes(o.value))
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-dashed">
          <PlusIcon className="size-4" />{title}
          {picked.length ? <span className="flex items-center gap-1 border-l pl-2">{picked.length > 2 ? <Badge variant="secondary">{picked.length}개 선택</Badge> : picked.map((o) => <Badge key={o.value} variant="secondary">{o.label}</Badge>)}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <ul role="listbox" aria-label={title} aria-multiselectable>
          {options.map((o) => {
            const on = value.includes(o.value)
            return (
              <li key={o.value} role="option" aria-selected={on}>
                <button type="button" onClick={() => toggle(o.value)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                  <span className={`flex size-4 items-center justify-center rounded-sm border ${on ? 'border-primary bg-primary text-primary-foreground' : ''}`}>{on ? <CheckIcon className="size-3" /> : null}</span>
                  <span className="flex-1">{o.label}</span>
                  {o.count !== undefined ? <span className="text-xs tabular-nums text-muted-foreground">{o.count}</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
        {value.length ? <div className="mt-1 border-t pt-1"><Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>선택 지우기</Button></div> : null}
      </PopoverContent>
    </Popover>
  )
}

// ───────── U18 카드 격자 — 표로 만들기엔 항목마다 설명이 필요한 목록(연결할 시스템·데이터 원천·보고서 종류). 카드마다 이름·설명·상태 버튼 하나.
export type GridCard = { id: string; title: string; description: string; icon?: ReactNode; status?: string; actionLabel: string; onAction?: () => void; done?: boolean }
export function CardGrid({ items, empty = '조건에 맞는 항목이 없습니다.' }: { items: GridCard[]; empty?: string }) {
  if (!items.length) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <li key={it.id} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">{it.icon}</span>
            <Button variant={it.done ? 'secondary' : 'outline'} size="sm" onClick={it.onAction}>{it.actionLabel}</Button>
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">{it.title}{it.status ? <Badge variant="outline">{it.status}</Badge> : null}</div>
            <p className="mt-1 text-sm text-muted-foreground">{it.description}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ───────── U19 상태 화면 — 페이지 전체가 내용을 못 보여 줄 때(없는 주소·권한 없음·서버 오류·점검 중·아직 없음). 무슨 일인지 한 줄, 할 수 있는 일 한두 개.
export type PageStatus = 'not-found' | 'forbidden' | 'error' | 'maintenance' | 'empty'
const PAGE_STATUS: Record<PageStatus, { code?: string; title: string; text: string }> = {
  'not-found': { code: '404', title: '없는 화면입니다', text: '주소가 바뀌었거나 지워진 화면입니다.' },
  forbidden: { code: '403', title: '볼 권한이 없습니다', text: '이 화면은 권한이 있는 계정만 볼 수 있습니다.' },
  error: { code: '500', title: '화면을 불러오지 못했습니다', text: '서버가 응답하지 않았습니다. 잠시 뒤 다시 시도해 주세요.' },
  maintenance: { code: '503', title: '점검 중입니다', text: '점검이 끝나면 다시 열립니다.' },
  empty: { title: '아직 내용이 없습니다', text: '데이터가 들어오면 여기에 보입니다.' },
}
export function StatusPage({ kind, title, text, detail, actions }: { kind: PageStatus; title?: string; text?: string; detail?: string; actions?: ReactNode }) {
  const s = PAGE_STATUS[kind]
  return (
    <section role={kind === 'empty' ? 'status' : 'alert'} data-state={kind} className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-12 text-center">
      {s.code ? <span className="text-5xl font-bold tabular-nums">{s.code}</span> : null}
      <h1 className="text-lg font-semibold">{title ?? s.title}</h1>
      <p className="text-sm text-muted-foreground">{text ?? s.text}</p>
      {detail ? <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{detail}</p> : null}
      {actions ? <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </section>
  )
}
