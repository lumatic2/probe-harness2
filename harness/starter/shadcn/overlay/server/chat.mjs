// chat.mjs — /api/chat 의 서버 쪽: 대화(messages)와 지금 화면 데이터(context)를 받아 AI 답 한 개를 돌려준다.
// OPENAI_API_KEY 가 있으면 OpenAI Chat Completions 를 부르고, 없거나 실패(시간 초과·HTTP 오류·빈 응답)하면 결정적 「모의 응답」으로 돌아간다.
// 키는 이 서버 프로세스의 환경변수에서만 읽는다 — 브라우저로 보내지 않고, 응답·로그·오류 문구에 넣지 않는다.
// 입력: {messages:[{role:'user'|'assistant',content}] (1~40개, 글자 2000자 이하, 마지막은 user), context?: 글자 8000자 이하}
// 근거 문서(domain.json chat.docs): {docs?:true, passages?:[{doc(문서명 100자 이하), n(문단 번호 1~999), text(1000자 이하)}] (5개까지)} — 문단은 화면이 질문과 가까운 순으로 골라 보낸다.
//   docs 가 켜지면 근거 문단에서만 답하고 [문서명 §n] 로 출처를 적는다. 키가 없으면 가장 가까운 문단의 첫 문장 + 출처, 근거가 없으면 「근거 문서에서 찾지 못했습니다.」
// 응답: {reply, source:'openai'|'mock', mock:boolean, model?, reason?, refs?:[{doc,n}] (답에 쓴 근거)}   reason(모의일 때만) = no-key | timeout | http-<코드> | network | empty
export const DEFAULT_MODEL = 'gpt-4o-mini';
export const TIMEOUT_MS = 10000;
// 주소 = env.OPENAI_BASE_URL(과제 환경이 주는 API 주소, 끝 / 정리; 없으면 OpenAI 기본) + 경로. 키·주소는 응답·로그에 싣지 않는다.
const DEFAULT_BASE = 'https://api.openai.com/v1';
const apiUrl = (env, path) => `${String(env.OPENAI_BASE_URL ?? '').trim().replace(/\/+$/, '') || DEFAULT_BASE}${path}`;
export const OPENAI_URL = `${DEFAULT_BASE}/chat/completions`;
export const NO_BASIS = '이 화면 데이터에서 근거를 찾지 못해 모릅니다.';
export const NO_DOC = '근거 문서에서 찾지 못했습니다.';
const MAX_MESSAGES = 40, MAX_CONTENT = 2000, MAX_CONTEXT = 8000, MAX_PASSAGES = 5, MAX_DOC_NAME = 100, MAX_PASSAGE = 1000;
const ROLES = ['user', 'assistant'];
const SYSTEM_DOCS = '근거 문서 질문이면 아래 근거 문단에서만 답하고, 쓴 근거를 문장 끝에 [문서명 §n] 으로 표시한다. 근거 문단에 답이 없으면 모른다고 한다. 근거 문단에 없는 규정·숫자를 만들지 않는다. 화면 데이터를 묻는 질문은 위 「이 화면 데이터」로 답한다.';
const SYSTEM = '너는 지금 화면에 보이는 데이터를 읽어 주는 보조자다. 아래 「이 화면 데이터」에 근거해 한국어로 짧게(두세 문장) 답한다. 근거가 없으면 모른다고 한다. 데이터에 없는 숫자를 만들지 않는다. 인사말·목록·이모지 없이 문장만.';

// 본문 검사 — 모양이 틀리면 {error}
export function parseChatBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: '본문이 JSON 객체가 아닙니다.' };
  const { messages, context } = body;
  if (!Array.isArray(messages) || !messages.length) return { error: 'messages 는 1개 이상의 배열이어야 합니다.' };
  if (messages.length > MAX_MESSAGES) return { error: `messages 는 ${MAX_MESSAGES}개까지입니다.` };
  for (const m of messages) {
    if (!m || typeof m !== 'object' || !ROLES.includes(m.role)) return { error: 'role 은 user 또는 assistant 여야 합니다.' };
    if (typeof m.content !== 'string' || !m.content.trim()) return { error: 'content 는 비어 있지 않은 글자여야 합니다.' };
    if (m.content.length > MAX_CONTENT) return { error: `글이 너무 깁니다(${MAX_CONTENT}자 이하).` };
  }
  if (messages[messages.length - 1].role !== 'user') return { error: '마지막 메시지는 user 여야 합니다.' };
  if (context !== undefined && typeof context !== 'string') return { error: 'context 는 글자여야 합니다.' };
  if (context && context.length > MAX_CONTEXT) return { error: `context 가 너무 깁니다(${MAX_CONTEXT}자 이하).` };
  const { docs, passages } = body;
  if (docs !== undefined && typeof docs !== 'boolean') return { error: 'docs 는 true/false 여야 합니다.' };
  if (passages !== undefined) {
    if (!Array.isArray(passages) || passages.length > MAX_PASSAGES) return { error: `passages 는 ${MAX_PASSAGES}개까지의 배열이어야 합니다.` };
    for (const p of passages) {
      if (!p || typeof p !== 'object' || typeof p.doc !== 'string' || !p.doc.trim() || p.doc.length > MAX_DOC_NAME) return { error: `passages 의 doc 은 ${MAX_DOC_NAME}자 이하의 글자여야 합니다.` };
      if (!Number.isInteger(p.n) || p.n < 1 || p.n > 999) return { error: 'passages 의 n 은 1~999 정수여야 합니다.' };
      if (typeof p.text !== 'string' || !p.text.trim() || p.text.length > MAX_PASSAGE) return { error: `passages 의 text 는 ${MAX_PASSAGE}자 이하의 글자여야 합니다.` };
    }
  }
  const value = { messages: messages.map((m) => ({ role: m.role, content: m.content })), context: context ?? '' };
  if (docs || passages?.length) { value.docs = true; value.passages = (passages ?? []).map((p) => ({ doc: p.doc, n: p.n, text: p.text })); }
  return { value };
}

// 모의 응답 — 질문과 겹치는 「라벨: 숫자…」 줄을 최대 두 개 인용한다(같은 입력이면 같은 글). 숫자 줄이 하나도 없으면 모른다고 답한다.
const NUM_LINE = /^[^:]+:\s*[-+▲▼]?\d/;
const stems = (t) => [t, t.slice(0, -1), t.slice(0, -2)].filter((s) => s.length >= 2);
const firstSentence = (t) => { const s = String(t).trim(); const m = /^.*?[.!?。](?=\s|$)/s.exec(s); return m ? m[0] : s; };
// 근거 문서 모의 응답 — 첫 번째(가장 가까운) 문단의 첫 문장 + 출처. 소제목 줄(본문 앞 줄)은 건너뛴다.
const mockDocReply = (top) => `${firstSentence(String(top.text).split('\n').pop())} [${top.doc} §${top.n}]`;
export function mockReply({ messages = [], context = '', docs = false, passages = [] }) {
  const lines = String(context).split('\n').map((l) => l.trim().replace(/^[-•]\s*/, '')).filter((l) => NUM_LINE.test(l));
  if (!lines.length) return passages.length ? mockDocReply(passages[0]) : docs ? NO_DOC : NO_BASIS;
  const asked = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const tokens = asked.split(/[^0-9A-Za-z가-힣]+/).filter(Boolean);
  // 점수 = 줄에 들어 있는 질문 낱말의 겹친 글자 수(긴 낱말이 맞을수록 높다)
  const scored = lines.map((line, i) => ({ line, i, score: tokens.reduce((sum, t) => sum + Math.max(0, ...stems(t).filter((s) => line.includes(s)).map((s) => s.length)), 0) }));
  const hit = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i);
  if (passages.length && !(hit[0]?.score >= 3)) return mockDocReply(passages[0]); // 세 글자 이상 맞는 지표 이름이 있으면 화면 데이터가 먼저(칩 질문), 아니면 문서
  if (docs && !hit.length) return NO_DOC; // 근거 문서도 화면 데이터도 질문과 맞지 않는다
  const pick = (hit.length ? hit : scored).slice(0, 2).map((x) => `「${x.line}」`);
  return `화면 데이터 기준으로 ${pick.join(', ')}입니다.`;
}

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function systemPrompt(v) {
  const base = `${SYSTEM}\n\n이 화면 데이터:\n${v.context || '(없음)'}`;
  if (!v.docs) return base;
  const doc = v.passages.length ? v.passages.map((p) => `[${p.doc} §${p.n}]\n${p.text}`).join('\n\n') : '(질문과 가까운 문단 없음)';
  return `${base}\n\n${SYSTEM_DOCS}\n\n근거 문단:\n${doc}`;
}

// env: 환경변수 객체(기본 process.env), fetchImpl: fetch 대체(테스트용), timeoutMs: 호출 제한 시간
export function createChat({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  return async function chat(body) {
    const parsed = parseChatBody(body);
    if (parsed.error) return { status: 400, json: { error: parsed.error } };
    const v = parsed.value;
    const mock = (reason) => {
      const reply = mockReply(v), top = v.passages?.[0];
      return { status: 200, json: { reply, source: 'mock', mock: true, reason, ...(top && reply.endsWith(`[${top.doc} §${top.n}]`) ? { refs: [{ doc: top.doc, n: top.n }] } : {}) } };
    };
    const key = String(env.OPENAI_API_KEY ?? '').trim();
    if (!key) return mock('no-key');
    const model = String(env.OPENAI_MODEL ?? '').trim() || DEFAULT_MODEL;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(apiUrl(env, '/chat/completions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt(v) }, ...v.messages], temperature: 0.2, max_tokens: 400 }),
        signal: ctl.signal,
      });
      if (!res.ok) return mock(`http-${res.status}`);
      const data = await res.json();
      const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
      if (!text) return mock('empty');
      const refs = (v.passages ?? []).filter((p) => new RegExp(`${escapeRe(p.doc)} §${p.n}(?!\\d)`).test(text)).map((p) => ({ doc: p.doc, n: p.n }));
      return { status: 200, json: { reply: text, source: 'openai', mock: false, model, ...(v.docs ? { refs } : {}) } };
    } catch (e) {
      return mock(e?.name === 'AbortError' ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  };
}
