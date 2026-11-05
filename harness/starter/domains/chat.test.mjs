// 실행: node --test starter/domains/chat.test.mjs
// W17 AI 대화창의 공통 로직(chat.mjs) — 설정 읽기, 화면 요약(context) 만들기, 전송 키 판정(한글 조합 중 Enter), 대화 보관, 서버 호출.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_STATE, makeCtx } from './core.mjs';
import { appendMessage, askChat, badgeText, chatConfig, chatContext, clearMessages, isSendKey, readMessages, reasonText, requestMessages, storageKey } from './chat.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (n, f) => JSON.parse(fs.readFileSync(path.join(here, n, f), 'utf8'));
const load = (n) => makeCtx(read(n, 'domain.json'), read(n, 'sample.json'));
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('설정: chat 키가 있고 on 이 false 가 아닐 때만 켜진다 — alarm·interview·yield 만, 칩은 최대 3개', () => {
  const on = ['alarm', 'interview', 'yield'], off = ['education', 'inspection', 'documents', 'power', 'purchase', 'transport'];
  for (const n of on) {
    const c = chatConfig(load(n).d);
    assert.ok(c && c.title && c.suggestions.length >= 2 && c.suggestions.length <= 3, n);
  }
  for (const n of off) assert.equal(chatConfig(load(n).d), null, n);
  assert.equal(chatConfig({ chat: { on: false, title: 'x', suggestions: ['a'] } }), null);
  assert.deepEqual(chatConfig({ chat: { title: '묻기', suggestions: ['a', 'b', 'c', 'd'] } }), { title: '묻기', suggestions: ['a', 'b', 'c'] });
  assert.deepEqual(chatConfig({ chat: {} }), { title: 'AI에게 묻기', suggestions: [] });
});

test('화면 요약(context): 서비스·기준 시각·조건·지표 값·상위 항목이 「라벨: 값」 줄로 들어간다 (알람, 기본 7일)', () => {
  const ctx = load('alarm');
  const t = chatContext(ctx, { ...DEFAULT_STATE, page: 'dashboard' });
  const lines = t.split('\n');
  assert.equal(lines[0], `서비스: ${ctx.d.app.title}`);
  assert.equal(lines[1], `데이터 기준: ${ctx.d.app.asOf}`);
  assert.equal(lines[2], '조건: 최근 7일 · 전체 공정');
  const m = lines.filter((l) => l.startsWith('평균 가동률: '));
  assert.equal(m.length, 1);
  assert.match(m[0], /^평균 가동률: \d+(\.\d)?%( \(직전 기간 대비 [▲▼=]\d+(\.\d)?%p\))?$/);
  assert.ok(lines.includes('지표:'));
  assert.ok(lines.some((l) => /^.+ 1위 .+: [\d,]+개?$/.test(l) || /^.+ 1위 .+: [\d,]+건$/.test(l)), t);
  assert.ok(t.length < 3000);
  assert.ok(!/undefined|NaN|\[object Object\]/.test(t));
  assert.equal(t, chatContext(ctx, { ...DEFAULT_STATE, page: 'dashboard' })); // 결정적
});

test('화면 요약(context): 상세 페이지면 선택한 건의 칸이 붙는다 · 그룹 필터가 조건에 반영', () => {
  const ctx = load('interview');
  const row = ctx.rows[0];
  const t = chatContext(ctx, { ...DEFAULT_STATE, page: 'item', id: row.q_id });
  assert.ok(t.includes('선택한 건:'));
  assert.ok(t.includes(`질문 ID: ${row.q_id}`));
  assert.ok(t.includes(`질문: ${row.question}`));
  assert.match(chatContext(ctx, { ...DEFAULT_STATE, group: '협업·갈등' }), /조건: 최근 7일 · 협업·갈등/);
});

test('전송 키: Enter 만 전송 — Shift+Enter 는 줄바꿈, 한글 조합 중(isComposing · keyCode 229) Enter 는 전송 안 함', () => {
  assert.equal(isSendKey({ key: 'Enter', shiftKey: false, isComposing: false }), true);
  assert.equal(isSendKey({ key: 'Enter' }), true);
  assert.equal(isSendKey({ key: 'Enter', shiftKey: true }), false);
  assert.equal(isSendKey({ key: 'Enter', isComposing: true }), false);
  assert.equal(isSendKey({ key: 'Enter', keyCode: 229 }), false);
  assert.equal(isSendKey({ key: 'a' }), false);
  assert.equal(isSendKey({ key: 'Enter', ctrlKey: true, isComposing: false }), true);
});

test('대화 보관: 도메인별 키, 읽을 때 걸러내고, 추가는 최신 저장본에 이어 붙이고 40개까지, 지우기', () => {
  assert.equal(storageKey('alarm'), 'sk-chat-alarm');
  assert.deepEqual(readMessages(null), []);
  assert.deepEqual(readMessages('깨진 json'), []);
  assert.deepEqual(readMessages('{"a":1}'), []);
  assert.deepEqual(readMessages(JSON.stringify([{ role: 'user', content: '안녕' }, { role: 'x', content: 'a' }, { role: 'assistant', content: 5 }, { role: 'assistant', content: '네', source: 'mock', reason: 'no-key' }])),
    [{ role: 'user', content: '안녕' }, { role: 'assistant', content: '네', source: 'mock', reason: 'no-key' }]);
  const s = memory(), k = storageKey('alarm');
  appendMessage(s, k, { role: 'user', content: 'a' });
  appendMessage(s, k, { role: 'assistant', content: 'b', source: 'openai' });
  assert.deepEqual(readMessages(s.getItem(k)), [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b', source: 'openai' }]);
  for (let i = 0; i < 50; i++) appendMessage(s, k, { role: 'user', content: String(i) });
  const all = readMessages(s.getItem(k));
  assert.equal(all.length, 40);
  assert.equal(all[39].content, '49');
  clearMessages(s, k);
  assert.deepEqual(readMessages(s.getItem(k)), []);
});

test('서버로 보낼 대화: role·content 만, 마지막 사용자 말까지, 2000자로 자른다', () => {
  const m = [{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1', source: 'mock', reason: 'no-key' }, { role: 'user', content: 'x'.repeat(2500) }];
  const r = requestMessages(m);
  assert.deepEqual(r.map((x) => Object.keys(x)), [['role', 'content'], ['role', 'content'], ['role', 'content']]);
  assert.equal(r[2].content.length, 2000);
  assert.deepEqual(requestMessages([{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }]).map((x) => x.role), ['user']);
});

test('배지·이유 글자: AI 응답 / 모의 응답, 키 없음은 이유를 말하지 않는다', () => {
  assert.equal(badgeText({ source: 'openai' }), 'AI 응답');
  assert.equal(badgeText({ source: 'mock' }), '모의 응답');
  assert.equal(reasonText('no-key'), '');
  assert.equal(reasonText(undefined), '');
  assert.equal(reasonText('timeout'), '시간 초과');
  assert.equal(reasonText('network'), '연결 실패');
  assert.equal(reasonText('empty'), '빈 응답');
  assert.equal(reasonText('http-401'), '응답 오류 401');
});

test('askChat: /api/chat 으로 대화와 context 를 보내고 답 메시지를 만든다 · 실패하면 던진다', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, init]); return { ok: true, status: 200, json: async () => ({ reply: '12개입니다.', source: 'mock', mock: true, reason: 'no-key' }) }; };
  const msg = await askChat({ fetchImpl, messages: [{ role: 'user', content: '미연습은?' }], context: '미연습: 12개' });
  assert.equal(calls[0][0], '/api/chat');
  assert.equal(calls[0][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[0][1].body), { messages: [{ role: 'user', content: '미연습은?' }], context: '미연습: 12개' });
  assert.deepEqual(msg, { role: 'assistant', content: '12개입니다.', source: 'mock', reason: 'no-key' });
  const ai = await askChat({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ reply: '네', source: 'openai', mock: false, model: 'm' }) }), messages: [{ role: 'user', content: 'q' }], context: '' });
  assert.deepEqual(ai, { role: 'assistant', content: '네', source: 'openai' });
  await assert.rejects(askChat({ fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({}) }), messages: [{ role: 'user', content: 'q' }], context: '' }), /400/);
  await assert.rejects(askChat({ fetchImpl: async () => { throw new TypeError('fetch failed'); }, messages: [{ role: 'user', content: 'q' }], context: '' }), /fetch failed/);
  await assert.rejects(askChat({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }), messages: [{ role: 'user', content: 'q' }], context: '' }), /빈 응답/);
});

// ---------- 근거 문서 (chat.docs) ----------
import { buildParagraphs } from './docs.mjs';
const DOCS = buildParagraphs({ 'privacy.md': '# 개인정보 처리 기준\n\n## 1. 수집\n\n연습 기록에는 대상자 번호만 남긴다.\n\n## 2. 열람\n\n개인정보는 연습 담당 권한이 있는 사람만 열람할 수 있다. 열람할 때마다 기록한다.' });

test('설정: chat.docs 가 켜져 있으면 chatConfig 에 docs:true, 아니면 키 없음', () => {
  assert.deepEqual(chatConfig({ chat: { title: 'x', suggestions: ['a'], docs: true } }), { title: 'x', suggestions: ['a'], docs: true });
  assert.deepEqual(chatConfig({ chat: { title: 'x', suggestions: ['a'] } }), { title: 'x', suggestions: ['a'] });
  assert.equal(chatConfig(load('interview').d).docs, true);
  assert.equal(chatConfig(load('alarm').d).docs, true);
  assert.equal(chatConfig(load('yield').d).docs, undefined);
});

test('askChat(근거 문서): 질문과 가까운 문단만 passages 로 보내고, 서버가 알려 준 출처를 문단 원문(refs)과 붙여 돌려준다', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ reply: '열람 기록을 남깁니다. [개인정보 처리 기준 §2]', source: 'mock', mock: true, reason: 'no-key', refs: [{ doc: '개인정보 처리 기준', n: 2 }] }) }; };
  const msg = await askChat({ fetchImpl, messages: [{ role: 'user', content: '개인정보는 누가 열람할 수 있어요?' }], context: 'c', paragraphs: DOCS });
  assert.equal(calls[0].docs, true);
  assert.deepEqual(calls[0].passages.map((p) => `${p.doc} §${p.n}`), ['개인정보 처리 기준 §2']);
  assert.equal(calls[0].passages[0].text, '2. 열람\n개인정보는 연습 담당 권한이 있는 사람만 열람할 수 있다. 열람할 때마다 기록한다.');
  assert.deepEqual(msg.refs, [{ doc: '개인정보 처리 기준', n: 2, heading: '2. 열람', text: '개인정보는 연습 담당 권한이 있는 사람만 열람할 수 있다. 열람할 때마다 기록한다.' }]);
  assert.equal(msg.content, '열람 기록을 남깁니다. [개인정보 처리 기준 §2]');
  // 문서에 없는 질문 → passages 빈 배열(docs 는 true), 응답에 refs 없으면 메시지에도 없다
  const none = await askChat({ fetchImpl: async (u, i) => { calls.push(JSON.parse(i.body)); return { ok: true, status: 200, json: async () => ({ reply: '근거 문서에서 찾지 못했습니다.', source: 'mock', mock: true, reason: 'no-key' }) }; }, messages: [{ role: 'user', content: '점심 메뉴 추천' }], context: '', paragraphs: DOCS });
  assert.deepEqual(calls[1].passages, []);
  assert.equal(calls[1].docs, true);
  assert.equal(none.refs, undefined);
  // paragraphs 를 안 주면(docs 꺼짐) 예전 요청 모양 그대로
  await askChat({ fetchImpl, messages: [{ role: 'user', content: 'q' }], context: '' });
  assert.deepEqual(Object.keys(calls[2]), ['messages', 'context']);
});

test('대화 보관: refs 가 있는 답은 다시 읽어도 refs 가 남는다', () => {
  const refs = [{ doc: '개인정보 처리 기준', n: 2, heading: '2. 열람', text: '본문' }];
  const raw = JSON.stringify([{ role: 'assistant', content: 'a', source: 'mock', refs }, { role: 'assistant', content: 'b', refs: 'x' }]);
  assert.deepEqual(readMessages(raw), [{ role: 'assistant', content: 'a', source: 'mock', refs }, { role: 'assistant', content: 'b' }]);
});
