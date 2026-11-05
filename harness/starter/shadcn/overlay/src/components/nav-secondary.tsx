// nav-secondary.tsx — 사이드바 아래 보조 메뉴 셋. 전부 실제로 동작한다(빈 버튼을 두지 않는다).
//   설정 = 화면 설정 시트(글자 크기·표 밀도·기본 기간·시작 화면, lib/prefs.ts) — 업무 기준값은 「기준값 설정」 페이지가 따로 맡는다.
//   도움말 = 이 앱의 이용 순서(켜진 페이지 순서대로 자동 — 도메인 설정 help.steps 가 있으면 그것) + 데이터 기준·한계·문의.
//   검색 = 페이지·대상 건을 한 입력으로 찾아 이동(⌘K / Ctrl+K).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CircleHelpIcon, CornerDownLeftIcon, SearchIcon, Settings2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { navigate } from '@/lib/app-context'
import { ctx, PERIODS } from '@/lib/derive'
import { HELP, isEnabled, NAV, PAGE_META } from '@/lib/pages'
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from '@/lib/prefs'
import { titleOf } from '@/domain/core.mjs'

const menuPages = () => NAV.flatMap((g) => g.pages).map((p) => p.key).filter(isEnabled)

// ── 설정 시트
function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-col gap-1.5"><Label>{label}</Label>{children}</div>
}
function PrefsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [p, setP] = useState<Prefs>(loadPrefs)
  useEffect(() => { if (open) setP(loadPrefs()) }, [open])
  const set = (patch: Partial<Prefs>) => { const next = { ...p, ...patch }; setP(next); savePrefs(next) }
  const homes = ['dashboard', ...menuPages().filter((k) => k !== 'dashboard')]
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-sm" data-prefs>
        <SheetHeader><SheetTitle>화면 설정</SheetTitle><SheetDescription>이 브라우저에만 저장됩니다. 업무 기준값은 「기준값 설정」 메뉴에서 바꿉니다.</SheetDescription></SheetHeader>
        <div className="flex flex-col gap-5 px-4">
          <Row label="글자 크기">
            <ToggleGroup type="single" variant="outline" size="sm" value={p.font} onValueChange={(v) => v && set({ font: v as Prefs['font'] })} aria-label="글자 크기">
              <ToggleGroupItem value="small" className="px-3">작게</ToggleGroupItem><ToggleGroupItem value="normal" className="px-3">보통</ToggleGroupItem><ToggleGroupItem value="large" className="px-3">크게</ToggleGroupItem>
            </ToggleGroup>
          </Row>
          <Row label="표 밀도">
            <ToggleGroup type="single" variant="outline" size="sm" value={p.density} onValueChange={(v) => v && set({ density: v as Prefs['density'] })} aria-label="표 밀도">
              <ToggleGroupItem value="normal" className="px-3">보통</ToggleGroupItem><ToggleGroupItem value="compact" className="px-3">촘촘하게</ToggleGroupItem>
            </ToggleGroup>
          </Row>
          <Row label="기본 기간">
            <Select value={p.period} onValueChange={(v) => set({ period: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{(PERIODS as { v: string; label: string }[]).map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">다음에 페이지를 옮길 때부터 적용</p>
          </Row>
          <Row label="시작 화면">
            <Select value={homes.includes(p.home) ? p.home : 'dashboard'} onValueChange={(v) => set({ home: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{homes.map((k) => <SelectItem key={k} value={k}>{PAGE_META[k]?.name ?? k}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">주소 없이 열었을 때 처음 보이는 화면</p>
          </Row>
          <div><button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => { set({ ...DEFAULT_PREFS }); toast('기본값으로 되돌렸습니다') }}>기본값으로</button></div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── 도움말
function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const steps: string[] = ctx.d.help?.steps?.length ? ctx.d.help.steps : menuPages().filter((k) => k !== 'widgets').map((k) => `${PAGE_META[k].name} — ${HELP[k] ?? ''}`.replace(/ — $/, ''))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-help>
        <DialogHeader><DialogTitle>{ctx.d.app.name} 이용 안내</DialogTitle><DialogDescription>{ctx.d.help?.intro ?? '메뉴 순서대로 쓰면 됩니다. 각 화면이 무엇을 하는지 한 줄씩.'}</DialogDescription></DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">데이터 기준</dt><dd>{ctx.d.app.asOf}</dd>
          <dt className="text-muted-foreground">한계</dt><dd>{ctx.d.app.limit}</dd>
          {ctx.d.app.help ? <><dt className="text-muted-foreground">문의</dt><dd>{ctx.d.app.help}</dd></> : null}
          <dt className="text-muted-foreground">단축키</dt><dd>⌘K / Ctrl+K 검색</dd>
        </dl>
      </DialogContent>
    </Dialog>
  )
}

// ── 검색(⌘K): 페이지 이름 + 대상 건(제목·ID). 위·아래·Enter.
type Hit = { kind: '페이지' | string; label: string; sub?: string; href: string }
function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState('')
  const [cur, setCur] = useState(0)
  useEffect(() => { if (open) { setQ(''); setCur(0) } }, [open])
  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase()
    const pages: Hit[] = menuPages().map((k) => ({ kind: '페이지', label: PAGE_META[k].name, sub: HELP[k], href: `#/${k}` })).filter((h) => !s || h.label.toLowerCase().includes(s) || (h.sub ?? '').toLowerCase().includes(s))
    if (!s) return pages
    const rows = (ctx.rows as Record<string, unknown>[]).filter((r) => String(r[ctx.R.id]).toLowerCase().includes(s) || titleOf(ctx, r).toLowerCase().includes(s)).slice(0, 8)
      .map((r) => ({ kind: ctx.d.entity.singular as string, label: titleOf(ctx, r), sub: String(r[ctx.R.id]), href: `#/item/${encodeURIComponent(String(r[ctx.R.id]))}` }))
    return [...pages, ...rows]
  }, [q])
  const go = (h?: Hit) => { if (!h) return; onOpenChange(false); navigate(h.href) }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 p-0 sm:max-w-lg" aria-describedby={undefined} data-search>
        <DialogHeader className="sr-only"><DialogTitle>검색</DialogTitle></DialogHeader>
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="size-4 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setCur(0) }} placeholder={`페이지 이름 · ${ctx.d.entity.idLabel ?? 'ID'} · ${ctx.d.entity.singular} 검색`} className="h-11 border-0 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setCur((c) => Math.min(c + 1, hits.length - 1)) } else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(c - 1, 0)) } else if (e.key === 'Enter') { e.preventDefault(); go(hits[cur]) } }} />
        </div>
        <ul className="max-h-80 overflow-y-auto px-2 pb-2" role="listbox">
          {hits.length ? hits.map((h, i) => (
            <li key={h.href} role="option" aria-selected={i === cur}>
              <button type="button" onMouseEnter={() => setCur(i)} onClick={() => go(h)} className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm ${i === cur ? 'bg-muted' : ''}`}>
                <span className="w-14 shrink-0 text-xs text-muted-foreground">{h.kind}</span>
                <span className="min-w-0 flex-1 truncate">{h.label}{h.sub ? <span className="ml-2 text-xs text-muted-foreground">{h.sub}</span> : null}</span>
                {i === cur ? <CornerDownLeftIcon className="size-3.5 text-muted-foreground" /> : null}
              </button>
            </li>
          )) : <li className="px-2 py-6 text-center text-sm text-muted-foreground">「{q}」 에 맞는 페이지·{ctx.d.entity.singular}이(가) 없습니다.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

export function NavSecondary(props: React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const [prefs, setPrefs] = useState(false)
  const [help, setHelp] = useState(false)
  const [search, setSearch] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch((s) => !s) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem><SidebarMenuButton onClick={() => setPrefs(true)} title="글자 크기 · 표 밀도 · 기본 기간 · 시작 화면"><Settings2Icon /><span>설정</span></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton onClick={() => setHelp(true)}><CircleHelpIcon /><span>도움말</span></SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton onClick={() => setSearch(true)} title="⌘K / Ctrl+K"><SearchIcon /><span>검색</span></SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
      <PrefsSheet open={prefs} onOpenChange={setPrefs} />
      <HelpDialog open={help} onOpenChange={setHelp} />
      <SearchDialog open={search} onOpenChange={setSearch} />
    </SidebarGroup>
  )
}
