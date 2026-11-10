import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useApp } from '@/lib/app-context'
import { ctx } from '@/lib/derive'
import { PAGE_META } from '@/lib/pages'
import { ChatButton } from '@/widgets/chat'

// 머리줄 = 사이드바 여닫기 + 화면 이름 + 데이터 기준 시각 + AI 대화 버튼.
// 다른 화면으로 가는 버튼은 두지 않는다 — 이동은 사이드바가 맡고, 그 화면에서 할 일은 본문 안의 버튼이 맡는다(같은 곳으로 가는 길을 여러 개 두지 않는다).
// 데이터 기준 시각은 「지금 보는 숫자가 언제 것인가」의 답이라 남긴다. domain.json app.asOf 가 비어 있으면 보이지 않는다.
export function SiteHeader() {
  const { route } = useApp()
  const meta = PAGE_META[route.page]
  return (
    <header className="flex min-h-(--header-height) md:h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 py-2 md:py-0 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" aria-label="사이드바 여닫기" title="사이드바 여닫기" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <h1 className="shrink-0 text-base font-medium">{meta?.name ?? '없는 화면'}</h1>
        <div className="ml-auto flex items-center gap-3">
          {ctx.d.app.asOf ? <span className="hidden text-xs text-muted-foreground md:block">데이터 기준 {ctx.d.app.asOf}</span> : null}
          <ChatButton />
        </div>
      </div>
    </header>
  )
}
