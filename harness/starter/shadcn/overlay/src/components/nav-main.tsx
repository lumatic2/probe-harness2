// nav-main.tsx — dashboard-01 NavMain 그대로: 빠른 등록(주 버튼) + 알림 아이콘 버튼 + 메인 내비. 라벨·동작만 도메인 설정에서 가져온다.
import { BellIcon, CirclePlusIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { navigate } from '@/lib/app-context'
import { buildHash, ctx, matchWhere, shortTs, sortRows, titleOf, whereToFilters } from '@/lib/derive'

// 알림 = 설정(alerts.where)에 걸리는 건
const urgentOpen = sortRows(ctx, ctx.rows.filter((r) => matchWhere(ctx, r, ctx.d.alerts.where)), 'queue')
export const URGENT_OPEN_HASH = buildHash('list', whereToFilters(ctx.d.alerts.where))

export function NavMain({ items, activeKey, quickHref }: { items: { key: string; title: string; url: string; icon: React.ReactNode }[]; activeKey: string; quickHref: string }) {
  const { isMobile } = useSidebar()
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="빠른 등록"
              onClick={() => navigate(quickHref)}
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <CirclePlusIcon />
              <span>빠른 등록</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" className="size-8 group-data-[collapsible=icon]:opacity-0" variant="outline">
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
        <SidebarMenu>
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
