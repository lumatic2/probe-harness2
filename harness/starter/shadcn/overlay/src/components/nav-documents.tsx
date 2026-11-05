// nav-documents.tsx — 사이드바 「문서」 그룹. 도메인 설정 docs 가 있을 때만 그린다(없으면 그룹 자체가 없다 — 빈 메뉴를 두지 않는다).
// docs: [{ "name": "이용 안내", "href": "/HOW_TO_RUN.md" | "#/report" | "https://…", "external": true }] — 앱 안 해시는 그 자리에서 이동, 파일·URL 은 새 탭. 파일은 앱 public/ 에 있어야 서빙된다(없으면 vite 가 index.html 을 돌려줘 앱이 다시 열린다).
// 과제 산출물(실행 안내·출력 스키마·마지막 내보낸 결과)을 심사자가 앱 안에서 바로 열게 하는 용도. 공유·삭제 같은 꾸밈 메뉴는 없다.
import { ExternalLinkIcon, FileTextIcon } from 'lucide-react'
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { ctx } from '@/lib/derive'

export type DocLink = { name: string; href: string; external?: boolean }
export const DOCS: DocLink[] = Array.isArray(ctx.d.docs) ? (ctx.d.docs as DocLink[]).filter((d) => d && d.name && d.href) : []

export function NavDocuments() {
  if (!DOCS.length) return null
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden" data-docs>
      <SidebarGroupLabel>문서</SidebarGroupLabel>
      <SidebarMenu>
        {DOCS.map((d) => {
          const ext = d.external ?? !d.href.startsWith('#')
          return (
            <SidebarMenuItem key={d.href}>
              <SidebarMenuButton asChild>
                <a href={d.href} target={ext ? '_blank' : undefined} rel={ext ? 'noreferrer' : undefined}>
                  <FileTextIcon /><span>{d.name}</span>{ext ? <ExternalLinkIcon className="ml-auto size-3 text-sidebar-foreground/60" /> : null}
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
