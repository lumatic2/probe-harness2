// login.tsx — 로그인 화면. shadcn 공식 블록 login-03(연한 배경 + 가운데 카드 + 위에 로고·서비스명)을 SK 테마로: 소셜 로그인·가입·약관 줄은 없다.
// 로그인이 켜져 있고(.env AUTH_ON=1) 세션이 없을 때 App 이 사이드바 없이 이것만 그린다. 안내(입력 누락·실패·성공)는 전부 toast — 폼 안에 문장을 두지 않는다.
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Toaster } from '@/components/ui/sonner'
import { useAuth } from '@/lib/auth'
import { ctx } from '@/lib/derive'

export default function Login() {
  const { login } = useAuth()
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  // 로그아웃 뒤 새로고침으로 왔으면 한 번 알린다(auth.tsx 가 표식을 남긴다)
  useEffect(() => {
    if (sessionStorage.getItem('sk-auth-toast') === 'logout') { sessionStorage.removeItem('sk-auth-toast'); toast('로그아웃했습니다') }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!id.trim() || !password) { toast.warning('아이디와 비밀번호를 모두 입력하세요'); return }
    setBusy(true)
    const err = await login(id.trim(), password)
    setBusy(false)
    if (err) { toast.error(err); setPassword('') }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 self-center">
          <img src="/brand/sk-hynix-ci.png" alt="SK hynix" width={132} height={70} className="h-[70px] w-[132px] object-contain" />
          <span className="text-base font-semibold">{ctx.d.app.title}</span>
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">로그인</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} aria-busy={busy} noValidate>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="login-id">아이디</FieldLabel>
                  <Input id="login-id" name="username" autoComplete="username" autoFocus value={id} onChange={(e) => setId(e.target.value)} maxLength={64} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="login-pw">비밀번호</FieldLabel>
                  <Input id="login-pw" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
                </Field>
                <Field>
                  <Button type="submit" disabled={busy}>{busy ? '확인 중…' : '로그인'}</Button>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
      <Toaster position="top-center" />{/* 폼 피드백은 카드 위쪽 — 구석이면 안 보인다 */}
    </main>
  )
}
