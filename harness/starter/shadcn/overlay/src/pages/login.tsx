// login.tsx — 로그인 화면. shadcn 공식 블록 login-03(연한 배경 + 가운데 카드 + 위에 로고·서비스명)을 SK 테마로: 소셜 로그인·가입·약관 줄은 없다. 카드 아래 「빠른 로그인」 줄은 서버 AUTH_QUICK=1 일 때만 뜬다(계정마다 버튼 하나 — QA·시연에서 역할을 바로 바꿔 보려고 둔다).
// 로그인이 켜져 있고(.env AUTH_ON=1) 세션이 없을 때 App 이 사이드바 없이 이것만 그린다. 안내(입력 누락·실패·성공)는 전부 toast — 폼 안에 문장을 두지 않는다.
import { useEffect, useState, type FormEvent } from 'react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Toaster } from '@/components/ui/sonner'
import { roleLabel, useAuth } from '@/lib/auth'
import { ctx } from '@/lib/derive'

export default function Login() {
  const { login, quick, quickLogin } = useAuth()
  const [show, setShow] = useState(false)
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  // 로그아웃 뒤 새로고침으로 왔으면 한 번 알린다(auth.tsx 가 표식을 남긴다)
  useEffect(() => {
    let flag: string | null = null
    try { flag = sessionStorage.getItem('sk-auth-toast') } catch { /* 저장소가 막힌 틀 */ }
    if (flag === 'logout') { try { sessionStorage.removeItem('sk-auth-toast') } catch { /* 위와 같음 */ } toast('로그아웃했습니다') }
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
  async function enterAs(userId: string) {
    if (busy) return
    setBusy(true)
    const err = await quickLogin(userId)
    setBusy(false)
    if (err) toast.error(err)
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
                  <div className="relative">
                    <Input id="login-pw" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} className="pr-10" />
                    <button type="button" className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setShow((v) => !v)} aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={show}>
                      {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                    </button>
                  </div>
                </Field>
                <Field>
                  <Button type="submit" disabled={busy}>{busy ? '확인 중…' : '로그인'}</Button>
                </Field>
              </FieldGroup>
            </form>
            {quick.length ? (
              <div className="mt-6 flex flex-col gap-3" data-quick-login>
                <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />빠른 로그인<span className="h-px flex-1 bg-border" /></div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {quick.map((u) => (
                    <Button key={u.id} type="button" variant="outline" disabled={busy} onClick={() => enterAs(u.id)}>{roleLabel(u.role)}로 로그인</Button>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <Toaster position="top-center" />{/* 폼 피드백은 카드 위쪽 — 구석이면 안 보인다 */}
    </main>
  )
}
