// nav-user.tsx — dashboard-01 NavUser: 하단 사용자 메뉴. 로그인이 켜져 있으면 로그인 계정·역할을 보이고 로그아웃이 실제로 세션을 끝낸다(꺼져 있으면 로그아웃 항목이 없다 — toast 만 뜨는 메뉴를 두지 않는다).
import { BellIcon, CircleUserRoundIcon, EllipsisVerticalIcon, LogOutIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { navigate } from '@/lib/app-context'
import { ctx } from '@/lib/derive'
import { roleLabel, useAuth } from '@/lib/auth'
import { URGENT_OPEN_HASH } from '@/components/nav-main'

const fallback = ctx.d.app.user as { name: string; email: string; initials: string }

export function NavUser() {
  const { isMobile } = useSidebar()
  const auth = useAuth()
  // 로그인 계정이 있으면 그 이름·역할, 없으면 도메인 설정의 가상 계정
  const user = auth.enabled && auth.user ? { name: auth.user.name, email: `${auth.user.id} · ${roleLabel(auth.user.role)}`, initials: auth.user.name.slice(0, 2) } : fallback
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Avatar className="h-8 w-8 rounded-lg grayscale"><AvatarFallback className="rounded-lg text-foreground">{user.initials}</AvatarFallback></Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <EllipsisVerticalIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" side={isMobile ? 'bottom' : 'right'} align="end" sideOffset={4}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg"><AvatarFallback className="rounded-lg text-foreground">{user.initials}</AvatarFallback></Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => navigate('#/me')}><CircleUserRoundIcon />내 정보</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate(URGENT_OPEN_HASH)}><BellIcon />알림</DropdownMenuItem>
            </DropdownMenuGroup>
            {auth.enabled ? <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => void auth.logout()}><LogOutIcon />로그아웃</DropdownMenuItem></> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
