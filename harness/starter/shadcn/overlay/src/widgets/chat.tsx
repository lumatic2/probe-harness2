// chat.tsx — W17 AI 대화창. 화면 데이터(context)를 근거로 AI 에게 묻는다 (서버 POST /api/chat — 키가 없으면 모의 응답).
// ChatPanel = 대화창 본체(메시지 목록 · 입력 · 보내기 · 대화 지우기), ChatButton = 머리줄 오른쪽 둥근 버튼, ChatDock = 본문을 밀어내며 열리는 옆 패널(도메인 설정 chat 키가 있을 때만).
// 근거 문서: domain.json 의 chat.docs 가 켜져 있으면 src/domain/<도메인>/docs/*.md|txt 를 번들에 넣고(import.meta.glob), 보낼 때 질문과 가까운 문단만 골라 서버에 싣는다. 답 아래 근거 칩(문서명 §n)을 누르면 그 문단 원문이 펼쳐진다.
// 공통 로직(전송 키 · 대화 보관 · 서버 호출 · 화면 요약)은 src/domain/chat.mjs. 대화는 sessionStorage 라 페이지를 옮겨도 남는다.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { SparklesIcon, XIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
              {m.source !== 'openai' && reasonText(m.reason) ? <span>OpenAI 호출 실패({reasonText(m.reason)}), 모의 응답으로 대신함</span> : null}
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

// ── AI 대화 패널: 머리줄 오른쪽 둥근 버튼(ChatButton)으로 여닫는다. 패널(ChatDock)은 화면 오른쪽에 고정된 별도 영역이다 — 본문이 스크롤돼도 입력창은 제자리에 있고, 패널 안의 대화만 따로 스크롤된다.
// 자리는 머리줄 아래, 본문 오른쪽의 칸이다(App.tsx 가 본문과 같은 줄에 둔다). 머리줄을 덮지 않고, 여백을 둔 둥근 카드로 보인다. 열리면 본문이 그 폭만큼 좁아진다(덮지 않는다. 표·차트를 보면서 묻는다).
// 도메인 설정(domain.json)에 chat 키가 있을 때만 보인다. 열림 상태는 탭 안에서 기억한다(페이지를 옮겨도 열린 채). 좁은 화면(lg 미만)에서는 밀어낼 자리가 없어 화면 전체를 덮는다.
// 버튼 그림: src/assets/ai-mark.svg(또는 .png)를 두면 그것을, 없으면 반짝임 아이콘. 상표가 있는 로고는 쓸 권리를 확인하고 넣는다.
const markFiles = import.meta.glob('../assets/ai-mark.{svg,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const markUrl = Object.values(markFiles)[0]
export function AiMark({ className = 'size-5' }: { className?: string }) {
  return markUrl ? <img src={markUrl} alt="" className={className} /> : <SparklesIcon className={className} />
}

const OPEN_KEY = 'sk-chat-open'
const OPEN_EVENT = 'sk-chat-open'
const readOpen = () => { try { return sessionStorage.getItem(OPEN_KEY) === '1' } catch { return false } }
const subscribeOpen = (cb: () => void) => { window.addEventListener(OPEN_EVENT, cb); return () => window.removeEventListener(OPEN_EVENT, cb) }
export function setChatOpen(open: boolean) {
  try { if (open) sessionStorage.setItem(OPEN_KEY, '1'); else sessionStorage.removeItem(OPEN_KEY) } catch { /* 저장소가 막힌 틀 — 이번 화면에서만 */ }
  memOpen = open
  window.dispatchEvent(new Event(OPEN_EVENT))
}
let memOpen = readOpen()
export const useChatOpen = () => useSyncExternalStore(subscribeOpen, () => memOpen)

// 패널 맨 아래 한 줄: 실제 AI 에 연결됐는지, 모의 응답인지. 서버의 /api/health 가 알려 준다(키 값은 오지 않는다. 있다/없다와 모델 이름만).
// 연결하는 법: 서버 환경변수(또는 앱 폴더 .env)에 OPENAI_API_KEY, 필요하면 OPENAI_BASE_URL·OPENAI_MODEL. 넣고 서버를 다시 켜면 이 줄이 「연결됨」으로 바뀐다.
function AiStatus() {
  const [ai, setAi] = useState<{ on: boolean; model?: string } | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/health', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (live) setAi({ on: !!j.ai, model: j.aiModel }) }).catch(() => { if (live) setAi({ on: false }) })
    return () => { live = false }
  }, [])
  if (!ai) return null
  return <p className="text-center text-xs text-muted-foreground" data-ai-status={ai.on ? 'on' : 'off'}>{ai.on ? `AI 연결됨${ai.model ? ` · ${ai.model}` : ''}` : 'API 키가 없어 모의 응답으로 답합니다'} · AI 의 답은 틀릴 수 있습니다</p>
}

// 머리줄 오른쪽 버튼 — 누르면 패널이 열리고 다시 누르면 닫힌다.
export function ChatButton() {
  const cfg = useMemo(() => chatConfig(ctx.d), [])
  const open = useChatOpen()
  if (!cfg) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={open ? 'secondary' : 'outline'} size="icon" className="size-9 rounded-full" onClick={() => setChatOpen(!open)} aria-pressed={open} aria-label={`${cfg.title}: AI 대화 패널 ${open ? '닫기' : '열기'}`} data-chat-open>
          <AiMark />
        </Button>
      </TooltipTrigger>
      <TooltipContent>AI에게 물어보기</TooltipContent>
    </Tooltip>
  )
}

// 본문 옆 칸. 넓은 화면: 머리줄 아래에서 화면 아래까지, 폭 23rem 의 둥근 카드. 닫혀 있으면 폭 0, 열리면 150ms 로 넓어지며 본문을 민다. 본문만 스크롤되므로 패널은 늘 제자리다.
// 좁은 화면(lg 미만)에서는 밀어낼 자리가 없어 화면 전체를 덮는다.
export function ChatDock() {
  const cfg = useMemo(() => chatConfig(ctx.d), [])
  const { route } = useApp()
  const open = useChatOpen()
  const context = useMemo(() => (open ? chatContext(ctx, route) : ''), [open, route])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role=dialog],[role=menu],[role=listbox]')) setChatOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!cfg) return null
  return (
    <aside data-chat-dock data-open={open} inert={!open} aria-label={cfg.title}
      className={`flex shrink-0 flex-col overflow-hidden bg-background transition-[width,opacity] duration-150 ease-out max-lg:fixed max-lg:inset-0 max-lg:z-40 ${open ? 'w-full opacity-100 lg:w-[24.5rem]' : 'w-0 opacity-0 max-lg:hidden'}`}>
      {/* 안쪽 상자는 폭이 정해져 있어 열리고 닫히는 동안 글자가 다시 접히지 않는다. 넓은 화면에서는 여백을 둔 둥근 카드. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 lg:m-3 lg:w-[23rem] lg:rounded-xl lg:border lg:shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold"><AiMark className="size-4" />{cfg.title}</h2>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setChatOpen(false)} aria-label="AI 대화 패널 닫기" data-chat-close><XIcon className="size-4" /></Button>
        </div>
        {open ? <ChatPanel context={context} suggestions={cfg.suggestions} title={cfg.title} listClassName="flex-1" /> : null}
        {open ? <AiStatus /> : null}
      </div>
    </aside>
  )
}
