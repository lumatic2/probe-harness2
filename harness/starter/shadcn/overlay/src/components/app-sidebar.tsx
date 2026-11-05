import * as React from 'react'
import { NavDocuments } from '@/components/nav-documents'
import { NavMain } from '@/components/nav-main'
import { NavSecondary } from '@/components/nav-secondary'
import { NavUser } from '@/components/nav-user'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { useApp } from '@/lib/app-context'
import { ctx } from '@/lib/derive'
import { NAV, PAGE_META } from '@/lib/pages'

// 사이드바 — dashboard-01 AppSidebar 와 같은 짜임: 머리(앱 이름) · NavMain · NavDocuments(docs 설정 있을 때만) · NavSecondary · NavUser.
// 필터(기간·그룹)는 메뉴를 옮겨도 유지한다(link).
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { route, link } = useApp()
  const activePage = route.page === 'item' ? 'list' : route.page
  const items = NAV.flatMap((g) => g.pages).map(({ key, icon: Icon }) => ({ key, title: PAGE_META[key].name, url: link(key), icon: <Icon /> }))
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="h-auto flex-col items-start gap-3 px-2 py-3">
              <a href={link('dashboard')}>
                <img src="/brand/sk-hynix-ci.png" alt="SK hynix" width={110} height={58} className="h-[58px] w-[110px] shrink-0 object-contain" />
                <span className="max-w-full whitespace-normal! text-base leading-snug font-semibold">{ctx.d.app.name}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={items} activeKey={activePage} quickHref={link('form')} />
        <NavDocuments />
        <NavSecondary className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
