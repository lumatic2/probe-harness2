// ⑬ 내 정보 #/me — 로그인 계정과 「내 것」(구성원 역할의 첫 화면). 사이드바 사용자 메뉴 「내 정보」와 lib/auth.tsx HOME_BY_ROLE 이 여기로 보낸다.
// 실전에서는 아래 MyThings 를 그 사용자의 것(내 결과·내 일정·내 담당 건)으로 채운다 — 계정 id 로 결과(/api/run-status result.items 등)에서 내 행을 고르면 된다.
// 화면에서 고르는 것은 표시 필터일 뿐이라 구성원도 /api/run-result 전체를 받는다 — 과제가 개인정보 분리를 요구하면 서버(vite.config.ts 의 GET 분기)에서 역할·id 로 걸러 내려보낸다.
import { CircleUserRoundIcon } from 'lucide-react'
import { LimitNote } from '@/components/page-parts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { roleLabel, useAuth } from '@/lib/auth'
import { ctx } from '@/lib/derive'
import { Empty, WidgetCard } from '@/widgets/panel'

function MyThings({ userId }: { userId: string }) {
  // 연결 지점: userId 로 내 항목을 골라 아래에 그린다. 기본은 안내만.
  const cfg = ctx.d.me ?? {}
  return (
    <WidgetCard title={cfg.title ?? '내 항목'} sub={cfg.sub ?? '이 계정에 배정된 것'} className="@4xl/main:col-span-8">
      <Empty>{cfg.empty ?? `${userId} 계정에 배정된 항목이 아직 없습니다.`}</Empty>
      {ctx.d.graph ? <div className="mt-3"><Button variant="outline" size="sm" asChild><a href="#/graph">그래프에서 보기</a></Button></div> : null}
    </WidgetCard>
  )
}

export default function Me() {
  const { user, enabled } = useAuth()
  const u = user ?? { id: 'guest', name: ctx.d.app.user?.name ?? '기본 계정', role: 'operator' }
  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-12">
        <WidgetCard title="계정" className="@4xl/main:col-span-4">
          <div className="flex items-center gap-3" data-account>
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-muted"><CircleUserRoundIcon className="size-5" /></span>
            <div className="flex flex-col gap-1">
              <span className="font-medium">{u.name}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">{u.id}<Badge variant="outline" className="font-normal">{roleLabel(u.role)}</Badge>{!enabled ? <span>· 로그인 꺼짐</span> : null}</span>
            </div>
          </div>
        </WidgetCard>
        <MyThings userId={u.id} />
      </div>
      <LimitNote />
    </>
  )
}
