// chat.mjs — W17 AI 대화창의 공통 로직(화면과 서버가 같이 쓴다). DOM 없음, Node 에서 테스트된다.
// - chatConfig(d): 도메인 설정 domain.json 의 chat → 켜져 있으면 {title, suggestions}, 아니면 null
// - chatContext(ctx, state): 지금 화면 데이터를 「라벨: 값」 줄로 요약한 글자 → 서버 /api/chat 의 context
// - isSendKey(e): 입력칸에서 Enter 가 「전송」인지 (Shift+Enter 줄바꿈, 한글 조합 중 Enter 는 전송 아님)
// - 대화 보관(sessionStorage): storageKey · readMessages · appendMessage · clearMessages — 페이지를 옮겨도 남는다
// - askChat: POST /api/chat → 답 메시지 {role:'assistant', content, source, reason?, refs?}
//   근거 문서(domain.json chat.docs, 검색은 docs.mjs): paragraphs 를 주면 질문과 가까운 문단을 골라 passages 로 보내고, 답에 쓴 근거를 refs([{doc,n,heading,text}])로 붙인다 — 화면의 근거 칩
import { docsEnabled, passagesForRequest, selectPassages } from './docs.mjs';
import { buildInputs, display, findRow, fmt, groupName, periodLabel } from './core.mjs';

export const MAX_STORED = 40;
export const MAX_CONTENT = 2000;
export const MAX_CONTEXT = 8000;

export function chatConfig(d) {
  const c = d?.chat;
  if (!c || typeof c !== 'object' || c.on === false) return null;
  return { title: String(c.title || 'AI에게 묻기'), suggestions: (Array.isArray(c.suggestions) ? c.suggestions : []).filter((s) => typeof s === 'string' && s.trim()).slice(0, 3), ...(docsEnabled(d) ? { docs: true } : {}) };
}

const arrow = (n) => (n > 0 ? '▲' : n < 0 ? '▼' : '=');
const diffUnit = (u) => (u === '%' ? '%p' : u || '');

export function chatContext(ctx, state) {
  const d = ctx.d;
  const i = buildInputs(ctx, state);
  const out = [`서비스: ${d.app.title}`, `데이터 기준: ${d.app.asOf}`, `조건: ${periodLabel(state.period)} · ${groupName(ctx, state.group)}`];
  if (state.page === 'item') {
    const row = findRow(ctx, state.id ?? '');
    if (row) {
      out.push('선택한 건:');
      for (const c of d.cols) { const v = display(ctx, c.key, row[c.key]); if (v) out.push(`${c.label}: ${v}`); }
    }
  }
  out.push('지표:');
  for (const it of i.w1.items) {
    const dec = it.decimals ?? 0;
    const delta = Number.isFinite(it.delta) ? ` (직전 기간 대비 ${arrow(it.delta)}${fmt(Math.abs(it.delta), dec)}${diffUnit(it.unit)})` : '';
    out.push(`${it.label}: ${fmt(it.value, dec)}${it.unit || ''}${delta}`);
  }
  if (i.w3.rows.length) {
    out.push('상위 항목:');
    [...i.w3.rows].sort((x, y) => y.value - x.value).slice(0, 3).forEach((r, k) => out.push(`${i.w3.title} ${k + 1}위 ${r.label}: ${fmt(r.value)}${i.w3.unit || ''}`));
  }
  if (i.w9.items.length) {
    out.push('지금 문제:');
    i.w9.items.slice(0, 3).forEach((a, k) => out.push(`${i.w9.title} ${k + 1}: ${a.title} · ${a.badge} · ${a.ts}`));
  }
  return out.join('\n').slice(0, MAX_CONTEXT);
}

// 입력칸 keydown 이벤트 → 전송이면 true. 한글 조합 중에는 Enter 가 글자 확정이므로 isComposing(또는 구형 keyCode 229)을 본다.
export const isSendKey = (e) => e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229;

export const storageKey = (name) => `sk-chat-${name}`;

export function readMessages(raw) {
  let list;
  try { list = JSON.parse(raw ?? '[]'); } catch { return []; }
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content, ...(m.source ? { source: m.source } : {}), ...(m.reason ? { reason: m.reason } : {}), ...(Array.isArray(m.refs) && m.refs.length ? { refs: m.refs } : {}) }))
    .slice(-MAX_STORED);
}
export function appendMessage(storage, key, msg) {
  const next = [...readMessages(storage.getItem(key)), msg].slice(-MAX_STORED);
  storage.setItem(key, JSON.stringify(next));
  return next;
}
export const clearMessages = (storage, key) => storage.removeItem(key);

// 서버로 보낼 대화 — role·content 만, 마지막 사용자 말까지(서버가 마지막은 user 여야 받는다)
export function requestMessages(messages) {
  const list = messages.map((m) => ({ role: m.role, content: String(m.content).slice(0, MAX_CONTENT) }));
  while (list.length && list[list.length - 1].role !== 'user') list.pop();
  return list.slice(-MAX_STORED);
}

export const badgeText = (m) => (m.source === 'openai' ? 'AI 응답' : '모의 응답');
const REASON = { timeout: '시간 초과', network: '연결 실패', empty: '빈 응답' };
export const reasonText = (r) => (!r || r === 'no-key' ? '' : String(r).startsWith('http-') ? `응답 오류 ${String(r).slice(5)}` : REASON[r] ?? String(r));

export async function askChat({ fetchImpl = globalThis.fetch, messages, context, paragraphs }) {
  const req = requestMessages(messages);
  const body = { messages: req, context: String(context ?? '').slice(0, MAX_CONTEXT) };
  let picked = [];
  if (Array.isArray(paragraphs)) { // 근거 문서 켜짐 — 마지막 질문과 가까운 문단 상위 3개만 서버로
    picked = selectPassages(paragraphs, req[req.length - 1]?.content ?? '');
    body.docs = true;
    body.passages = passagesForRequest(picked);
  }
  const res = await fetchImpl('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`응답 오류 ${res.status}`);
  const j = await res.json();
  const content = String(j?.reply ?? '').trim();
  if (!content) throw new Error('빈 응답');
  const refs = (Array.isArray(j.refs) ? j.refs : []).map((r) => picked.find((p) => p.doc === r?.doc && p.n === r?.n)).filter(Boolean).map((p) => ({ doc: p.doc, n: p.n, heading: p.heading, text: p.text }));
  return { role: 'assistant', content, source: j.source === 'openai' ? 'openai' : 'mock', ...(j.reason ? { reason: j.reason } : {}), ...(refs.length ? { refs } : {}) };
}
