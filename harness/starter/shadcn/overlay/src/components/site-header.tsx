import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useApp } from '@/lib/app-context'
import { ctx, findRow, isDone } from '@/lib/derive'
import { PAGE_META } from '@/lib/pages'
import { ChatSheet } from '@/widgets/chat'

// 헤더 = 사이드바 토글 + 페이지 제목 + 데이터 기준 시각 + 오른쪽 보조·주 버튼
export function SiteHeader() {
  const { route, link } = useApp()
  const meta = PAGE_META[route.page] ?? PAGE_META.dashboard
  const toReport = route.page === 'report'
  // 본문에 폼이 있는 페이지, 이미 끝난 건의 상세는 헤더 버튼을 outline 으로 — 한 화면에 검정 버튼은 하나
  const row = route.page === 'item' ? findRow(ctx, route.id ?? '') : undefined
  const quiet = ['form', 'review', 'assist', 'schedule', 'import', 'settings', 'datasets', 'run', 'graph', 'me'].includes(route.page) || (!!row && isDone(ctx, row))
  return (
    <header className="flex min-h-(--header-height) md:h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full flex-wrap items-center gap-1 px-4 py-2 md:flex-nowrap md:py-0 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <h1 className="shrink-0 text-base font-medium">{meta.name}</h1>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <span className="hidden text-xs text-muted-foreground md:block">데이터 기준 {ctx.d.app.asOf}</span>
          <ChatSheet />
          <Button variant="outline" size="sm" asChild>
            <a href={toReport ? link('dashboard') : link('report')}>{toReport ? '대시보드' : '리포트'}</a>
          </Button>
          <Button size="sm" variant={quiet ? 'outline' : 'default'} asChild>
            <a href={meta.action.href(route)}>{meta.action.label}</a>
          </Button>
        </div>
      </div>
    </header>
  )
}
