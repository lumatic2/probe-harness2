// chat.tsx — W17 AI 대화창. 화면 데이터(context)를 근거로 AI 에게 묻는다 (서버 POST /api/chat — 키가 없으면 모의 응답).
// ChatPanel = 대화창 본체(메시지 목록 · 입력 · 보내기 · 대화 지우기), ChatSheet = 헤더 오른쪽 버튼으로 여는 옆 패널(도메인 설정 chat 키가 있을 때만).
// 근거 문서: domain.json 의 chat.docs 가 켜져 있으면 src/domain/<도메인>/docs/*.md|txt 를 번들에 넣고(import.meta.glob), 보낼 때 질문과 가까운 문단만 골라 서버에 싣는다. 답 아래 근거 칩(문서명 §n)을 누르면 그 문단 원문이 펼쳐진다.
// 공통 로직(전송 키 · 대화 보관 · 서버 호출 · 화면 요약)은 src/domain/chat.mjs. 대화는 sessionStorage 라 페이지를 옮겨도 남는다.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { appendMessage, askChat, badgeText, chatConfig, chatContext, clearMessages, isSendKey, readMessages, reasonText, storageKey } from '@/domain/chat.mjs'
import { buildParagraphs, loadDomainDocs } from '@/domain/docs.mjs'
import { useApp } from '@/lib/app-context'
import { ctx, domainName } from '@/lib/derive'
import { Empty } from '@/widgets/panel'

const docFiles = import.meta.glob('../domain/*/docs/*.{md,txt}', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
const paragraphs = chatConfig(ctx.d)?.docs ? buildParagraphs(loadDomainDocs(docFiles, domainName)) : undefined
const KEY = storageKey(domainName)
const EVENT = 'sk-chat'
const subscribe = (cb: () => void) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb) }
const snapshot = () => sessionStorage.getItem(KEY) ?? ''
const changed = () => window.dispatchEvent(new Event(EVENT))

export function ChatPanel({ context, suggestions = [], title = 'AI에게 묻기', listClassName = 'max-h-96 min-h-40' }: { context: string; suggestions?: string[]; title?: string; listClassName?: string }) {
  const raw = useSyncExternalStore(subscribe, snapshot)
  const messages = useMemo(() => readMessages(raw || null), [raw])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const ctxText = useRef(context)
  ctxText.current = context
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }) }, [messages, pending, error])

  const submit = async (text: string) => {
    const content = text.trim()
    if (!content || pending) return
    setError('')
    setDraft('')
    appendMessage(sessionStorage, KEY, { role: 'user', content })
    changed()
    setPending(true)
    try {
      const reply = await askChat({ messages: readMessages(sessionStorage.getItem(KEY)), context: ctxText.current, paragraphs })
      appendMessage(sessionStorage, KEY, reply)
      changed()
    } catch (e) {
      setError(`답변을 불러오지 못했습니다(${(e as Error).message}).`)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" role="group" aria-label={title} data-chat>
      <div ref={list} role="log" aria-live="polite" className={`flex flex-col gap-3 overflow-y-auto ${listClassName}`} data-chat-list>
        {!messages.length && !pending && !error ? <Empty>아직 대화가 없습니다.</Empty> : null}
        {messages.map((m, i) => m.role === 'user' ? (
          <div key={i} className="flex justify-end">
            <div data-role="user" className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{m.content}</div>
          </div>
        ) : (
          <div key={i} className="flex flex-col items-start gap-1">
            <div data-role="assistant" className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm">{m.content}</div>
            {m.refs?.length ? (
              <div className="flex max-w-[85%] flex-col items-start gap-1" data-chat-refs>
                {m.refs.map((r) => (
                  <Collapsible key={`${r.doc}-${r.n}`} data-ref>
                    <CollapsibleTrigger asChild><Button type="button" variant="outline" size="sm">{r.doc} §{r.n}</Button></CollapsibleTrigger>
                    <CollapsibleContent className="mt-1 border-l-2 py-1 pl-3 text-sm">
                      {r.heading ? <p className="font-medium">{r.heading}</p> : null}
                      <p className="break-words">{r.text}</p>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={m.source === 'openai' ? 'outline' : 'secondary'} data-badge={m.source === 'openai' ? 'ai' : 'mock'}>{badgeText(m)}</Badge>
              {m.source !== 'openai' && reasonText(m.reason) ? <span>OpenAI 호출 실패({reasonText(m.reason)}) — 모의 응답으로 대신함</span> : null}
            </div>
          </div>
        ))}
        {pending ? <div data-pending className="max-w-[85%] self-start rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">답변을 만드는 중…</div> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
      {!messages.length && !pending && suggestions.length ? (
        <div className="flex flex-wrap gap-2" data-chat-chips>
          {suggestions.map((s) => <Button key={s} type="button" variant="outline" size="sm" onClick={() => submit(s)} data-chat-suggest={s}>{s}</Button>)}
        </div>
      ) : null}
      <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); submit(draft) }}>
        <Textarea
          aria-label="질문" placeholder="질문" rows={2} className="max-h-40 min-h-16 resize-none" value={draft} data-chat-input
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (!isSendKey(e.nativeEvent)) return // Shift+Enter 줄바꿈, 한글 조합 중 Enter(글자 확정) 는 전송하지 않는다
            e.preventDefault()
            submit(draft)
          }}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending || !draft.trim()} data-chat-send>보내기</Button>
          <Button type="button" variant="outline" disabled={!messages.length && !error} onClick={() => { clearMessages(sessionStorage, KEY); setError(''); changed() }} data-chat-clear>대화 지우기</Button>
        </div>
      </form>
    </div>
  )
}

// 헤더 오른쪽 버튼 + 옆 패널. 도메인 설정(domain.json)에 chat 키가 있을 때만 보인다. context = 열려 있는 동안 그 페이지가 가진 요약.
export function ChatSheet() {
  const cfg = useMemo(() => chatConfig(ctx.d), [])
  const { route } = useApp()
  const [open, setOpen] = useState(false)
  const context = useMemo(() => (open ? chatContext(ctx, route) : ''), [open, route])
  if (!cfg) return null
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-chat-open>{cfg.title}</Button>
      <SheetContent side="right" className="gap-0 sm:max-w-md" aria-describedby={undefined}>
        <SheetHeader><SheetTitle>{cfg.title}</SheetTitle></SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          <ChatPanel context={context} suggestions={cfg.suggestions} title={cfg.title} listClassName="flex-1" />
        </div>
      </SheetContent>
    </Sheet>
  )
}
