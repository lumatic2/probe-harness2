// require-role.tsx — 페이지·부품을 역할로 막는 껍데기. 화면에서 숨기는 것일 뿐 — 실제 거부는 서버(server/auth.mjs canWrite)가 한다.
// 쓰기: <RequireRole roles={['operator']}>…</RequireRole>  또는 const ok = useAuth().hasRole(['operator'])
import { ShieldAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { roleLabel, useAuth } from '@/lib/auth'

export function RequireRole({ roles, children, fallback }: { roles?: string[]; children: ReactNode; fallback?: ReactNode }) {
  const { hasRole, user } = useAuth()
  if (hasRole(roles)) return <>{children}</>
  if (fallback !== undefined) return <>{fallback}</>
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-3 border bg-card p-6" role="alert" data-state="forbidden">
      <h1 className="flex items-center gap-2 text-lg font-semibold"><ShieldAlertIcon className="size-5" />이 화면을 볼 권한이 없습니다</h1>
      <p className="text-sm text-muted-foreground">
        필요한 역할: {(roles ?? []).map(roleLabel).join(' · ') || '없음'} · 지금 역할: {user ? roleLabel(user.role) : '로그인 안 됨'}
      </p>
    </section>
  )
}
