// nav-main.tsx — 빠른 등록(주 버튼, lib/pages.ts 의 QUICK 이 있을 때만) + 알림 아이콘 버튼 + 메인 내비.
// 빠른 등록: QUICK = { label, href } 면 그 화면으로, { label, dialog: true } 면 모달(components/quick-add.tsx — 아래 QUICK_FIELDS 와 저장을 과제에 맞게).
import { BellIcon, CirclePlusIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { navigate } from '@/lib/app-context'
import { QuickAddDialog, type QuickField } from '@/components/quick-add'
import { buildHash, ctx, domainName, matchWhere, shortTs, sortRows, titleOf, whereToFilters } from '@/lib/derive'
import { QUICK } from '@/lib/pages'
import { useStore } from '@/lib/store'

// 알림 = 설정(alerts.where)에 걸리는 건
const urgentOpen = sortRows(ctx, ctx.rows.filter((r) => matchWhere(ctx, r, ctx.d.alerts.where)), 'queue')
export const URGENT_OPEN_HASH = buildHash('list', whereToFilters(ctx.d.alerts.where))

// 빠른 등록 모달의 칸 — 과제에 맞게 바꾼다. 저장은 /api/quick-<도메인> 에 한 줄씩 쌓는다(일반 저장 경로, 쓰기 권한 계정만).
const QUICK_FIELDS: QuickField[] = [{ key: 'title', label: '제목', required: true }, { key: 'note', label: '메모', type: 'textarea' }]
type QuickRow = Record<string, string> & { id: string; ts: string }

// 모달형 빠른 등록 — 저장물(/api/quick-<도메인>)은 이 버튼이 그려질 때만 읽는다.
function QuickDialogButton({ label, trigger }: { label: string; trigger: React.ReactNode }) {
  const quick = useStore<QuickRow[]>(`quick-${domainName}`, [])
  return <QuickAddDialog trigger={trigger} title={label} fields={QUICK_FIELDS} onSubmit={async (v) => { await quick.save([...quick.data, { ...v, id: `q-${Date.now()}`, ts: new Date().toISOString() }]) }} />
}

export function NavMain({ items, activeKey }: { items: { key: string; title: string; url: string; icon: React.ReactNode }[]; activeKey: string }) {
  const { isMobile } = useSidebar()
  const quickButton = QUICK ? (
    <SidebarMenuButton
      tooltip={QUICK.label}
      onClick={QUICK.dialog ? undefined : () => navigate(QUICK?.href ?? '#/form')}
      className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
      data-quick
    >
      <CirclePlusIcon />
      <span>{QUICK.label}</span>
    </SidebarMenuButton>
  ) : null
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            {QUICK?.dialog && quickButton ? <QuickDialogButton label={QUICK.label} trigger={quickButton} /> : quickButton}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" className={`size-8 group-data-[collapsible=icon]:opacity-0 ${QUICK ? '' : 'ml-auto'}`} variant="outline">
                  <BellIcon />
                  <span className="sr-only">알림</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72 rounded-lg" side={isMobile ? 'bottom' : 'right'} align="start">
                <DropdownMenuLabel className="flex items-center justify-between">{ctx.d.alerts.title} <Badge variant="secondary">{urgentOpen.length}{ctx.d.entity.unit}</Badge></DropdownMenuLabel>
                <DropdownMenuSeparator />
                {urgentOpen.slice(0, 4).map((a) => (
                  <DropdownMenuItem key={a[ctx.R.id]} onSelect={() => navigate(`#/item/${a[ctx.R.id]}`)} className="flex-col items-start gap-0.5">
                    <span className="font-medium">{titleOf(ctx, a)}</span>
                    <span className="text-xs text-muted-foreground">{a[ctx.R.id]} · {shortTs(a[ctx.R.date])}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate(URGENT_OPEN_HASH)}>전체 보기</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu data-tour="menu">
          {items.map((item) => (
            <SidebarMenuItem key={item.key}>
              <SidebarMenuButton asChild tooltip={item.title} isActive={activeKey === item.key}>
                <a href={item.url} aria-current={activeKey === item.key ? 'page' : undefined}>{item.icon}<span>{item.title}</span></a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
