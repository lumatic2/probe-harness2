// 실행: node --test starter/shadcn/overlay/server/chat.test.mjs   (앱 안에서는 node --test server/)
// 실제 OpenAI 호출은 하지 않는다 — 키가 없으면 모의 응답, 키가 있으면 fetch(대역)가 불리는 모양만 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChat, DEFAULT_MODEL, mockReply, OPENAI_URL, parseChatBody } from './chat.mjs';

const context = ['서비스: 인터뷰 답변 연습 현황 · 데이터 기준 2026-10-28 09:00', '연습 완료율: 42.5% (직전 기간 대비 ▲3.1%p)', '미연습: 12개', '기한 초과: 3개'].join('\n');
const body = { messages: [{ role: 'user', content: '미연습 질문이 몇 개야?' }], context };
const failFetch = () => { throw new Error('키가 없을 때는 fetch 를 부르면 안 된다'); };

test('키 없음: 결정적 모의 응답(같은 입력 → 같은 답), context 의 숫자를 인용, mock:true, 외부 호출 없음', async () => {
  const c = createChat({ env: {}, fetchImpl: failFetch });
  const r1 = await c(body), r2 = await c(body);
  assert.equal(r1.status, 200);
  assert.deepEqual(r1, r2);
  assert.equal(r1.json.mock, true);
  assert.equal(r1.json.source, 'mock');
  assert.equal(r1.json.reason, 'no-key');
  assert.equal(r1.json.reply, '화면 데이터 기준으로 「미연습: 12개」입니다.');
  const two = await c({ messages: [{ role: 'user', content: '완료율이랑 기한 초과는?' }], context });
  assert.equal(two.json.reply, '화면 데이터 기준으로 「기한 초과: 3개」, 「연습 완료율: 42.5% (직전 기간 대비 ▲3.1%p)」입니다.');
  assert.equal((await createChat({ env: { OPENAI_API_KEY: '   ' }, fetchImpl: failFetch })(body)).json.mock, true);
});

test('모의 응답: 질문과 겹치는 줄이 없으면 앞쪽 숫자 줄, 숫자 줄이 없으면 모른다고 답한다', () => {
  assert.equal(mockReply({ messages: [{ role: 'user', content: '날씨는?' }], context }), '화면 데이터 기준으로 「연습 완료율: 42.5% (직전 기간 대비 ▲3.1%p)」, 「미연습: 12개」입니다.');
  assert.equal(mockReply({ messages: [{ role: 'user', content: '미연습은?' }], context: '화면: 대시보드' }), '이 화면 데이터에서 근거를 찾지 못해 모릅니다.');
  assert.equal(mockReply({ messages: [{ role: 'user', content: '미연습은?' }] }), '이 화면 데이터에서 근거를 찾지 못해 모릅니다.');
});

test('모의 응답: 질문 낱말이 길게 맞는 줄을 먼저 인용한다 (미연습이 배정 질문보다 앞)', () => {
  const ctx = ['배정 질문: 37개', '미연습: 19개 (직전 기간 대비 ▲11개)'].join('\n');
  assert.equal(mockReply({ messages: [{ role: 'user', content: '미연습 질문이 몇 개야?' }], context: ctx }), '화면 데이터 기준으로 「미연습: 19개 (직전 기간 대비 ▲11개)」, 「배정 질문: 37개」입니다.');
});

test('키 있음: OpenAI Chat Completions 를 부르고(주소·헤더·모델·시스템 프롬프트에 context·대화 순서), 키는 응답에 없다', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, init]); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '  미연습은 12개입니다.  ' } }] }) }; };
  const msgs = [{ role: 'user', content: '현황은?' }, { role: 'assistant', content: '완료율 42.5% 입니다.' }, { role: 'user', content: '미연습은?' }];
  const r = await createChat({ env: { OPENAI_API_KEY: 'sk-test-0000', OPENAI_MODEL: 'my-model' }, fetchImpl })({ messages: msgs, context });
  assert.equal(calls.length, 1);
  const [url, init] = calls[0];
  assert.equal(url, OPENAI_URL);
  assert.equal(url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer sk-test-0000');
  const sent = JSON.parse(init.body);
  assert.equal(sent.model, 'my-model');
  assert.deepEqual(sent.messages.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.match(sent.messages[0].content, /한국어로 짧게/);
  assert.match(sent.messages[0].content, /근거가 없으면 모른다고/);
  assert.ok(sent.messages[0].content.includes('미연습: 12개'));
  assert.deepEqual(sent.messages.slice(1), msgs);
  assert.deepEqual(r, { status: 200, json: { reply: '미연습은 12개입니다.', source: 'openai', mock: false, model: 'my-model' } });
  assert.ok(!JSON.stringify(r).includes('sk-test-0000'));
  assert.equal((await createChat({ env: { OPENAI_API_KEY: 'sk-test-0000' }, fetchImpl })(body)).json.model, DEFAULT_MODEL);
});

test('키 있음이지만 실패하면 모의로 돌아가고 이유만 알린다: HTTP 오류 · 빈 응답 · 네트워크 · 시간 초과', async () => {
  const env = { OPENAI_API_KEY: 'sk-test-0000' };
  const run = (fetchImpl, timeoutMs) => createChat({ env, fetchImpl, timeoutMs })(body);
  const http = await run(async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'bad key sk-test-0000' } }) }));
  assert.deepEqual([http.status, http.json.source, http.json.mock, http.json.reason], [200, 'mock', true, 'http-401']);
  assert.equal(http.json.reply, '화면 데이터 기준으로 「미연습: 12개」입니다.');
  assert.ok(!JSON.stringify(http).includes('sk-test-0000'));
  assert.equal((await run(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: ' ' } }] }) }))).json.reason, 'empty');
  const net = await run(async () => { throw new TypeError('fetch failed sk-test-0000'); });
  assert.equal(net.json.reason, 'network');
  assert.ok(!JSON.stringify(net).includes('sk-test-0000'));
  const slow = await run((_u, init) => new Promise((_ok, fail) => init.signal.addEventListener('abort', () => fail(Object.assign(new Error('aborted'), { name: 'AbortError' })))), 30);
  assert.deepEqual([slow.json.source, slow.json.reason], ['mock', 'timeout']);
});

test('본문 검사: 모양이 틀리거나 너무 길면 400', async () => {
  const c = createChat({ env: {}, fetchImpl: failFetch });
  const u = (content) => ({ role: 'user', content });
  const bad = [
    null, 'x', {}, { messages: [] }, { messages: 'x' },
    { messages: [{ role: 'system', content: 'x' }] },
    { messages: [{ role: 'user', content: 5 }] },
    { messages: [{ role: 'user', content: '   ' }] },
    { messages: [{ role: 'assistant', content: '안녕' }] }, // 마지막은 사용자 말이어야 한다
    { messages: [u('a'.repeat(2001))] },
    { messages: Array.from({ length: 41 }, () => u('a')) },
    { messages: [u('질문')], context: 5 },
    { messages: [u('질문')], context: 'a'.repeat(8001) },
  ];
  for (const b of bad) assert.equal((await c(b)).status, 400, JSON.stringify(b)?.slice(0, 60));
  assert.equal((await c({ messages: [u('질문')] })).status, 200); // context 는 선택
  assert.equal((await c({ messages: Array.from({ length: 40 }, () => u('a')) })).status, 200);
  assert.ok(parseChatBody({ messages: [u('질문')], context: 5 }).error);
});

// ---------- 근거 문서 답변 (domain.json chat.docs) — 화면이 고른 근거 문단(passages)을 받아 그 안에서만 답한다 ----------
const passages = [
  { doc: '개인정보 처리 기준', n: 3, text: '3. 개인정보는 어떻게 처리하는가\n개인정보는 연습 담당 권한이 있는 사람만 열람할 수 있으며, 열람할 때마다 열람자와 시각을 기록한다. 외부 AI 서비스에 보낼 때는 이름을 먼저 가린다.' },
  { doc: '개인정보 처리 기준', n: 1, text: '연습 기록에는 대상자 번호만 남긴다.' },
];
const docBody = { messages: [{ role: 'user', content: '개인정보는 어떻게 처리해요?' }], context, docs: true, passages };

test('근거 문서(키 없음): 가장 가까운 문단의 첫 문장을 인용하고 [문서명 §n] 출처를 붙인다 · refs 로 인용 문단을 알린다', async () => {
  const r = await createChat({ env: {}, fetchImpl: failFetch })(docBody);
  assert.equal(r.status, 200);
  assert.equal(r.json.mock, true);
  assert.equal(r.json.reply, '개인정보는 연습 담당 권한이 있는 사람만 열람할 수 있으며, 열람할 때마다 열람자와 시각을 기록한다. [개인정보 처리 기준 §3]');
  assert.deepEqual(r.json.refs, [{ doc: '개인정보 처리 기준', n: 3 }]);
  assert.deepEqual(await createChat({ env: {}, fetchImpl: failFetch })(docBody), r);
});

test('근거 문서(키 없음): 근거 문단이 없으면 화면 데이터에 맞는 줄이 있을 때만 화면 데이터로, 아니면 「근거 문서에서 찾지 못했습니다」', async () => {
  const c = createChat({ env: {}, fetchImpl: failFetch });
  const screen = await c({ messages: [{ role: 'user', content: '미연습 질문이 몇 개야?' }], context, docs: true, passages: [] });
  assert.equal(screen.json.reply, '화면 데이터 기준으로 「미연습: 12개」입니다.');
  assert.equal(screen.json.refs, undefined);
  const none = await c({ messages: [{ role: 'user', content: '점심 메뉴 추천' }], context, docs: true, passages: [] });
  assert.equal(none.json.reply, '근거 문서에서 찾지 못했습니다.');
  assert.equal(none.json.mock, true);
  // docs 가 꺼져 있으면 예전 그대로
  assert.equal((await c(body)).json.reply, '화면 데이터 기준으로 「미연습: 12개」입니다.');
});

test('근거 문서(키 있음): 시스템 프롬프트에 근거 문단과 「근거 문단에서만 · [문서명 §n] 표시 · 없으면 모른다」 지시가 들어가고, 답에 적힌 출처만 refs 로', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push(init); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '열람자와 시각을 기록합니다. [개인정보 처리 기준 §3]' } }] }) }; };
  const r = await createChat({ env: { OPENAI_API_KEY: 'sk-test-0000' }, fetchImpl })(docBody);
  const sys = JSON.parse(calls[0].body).messages[0].content;
  assert.match(sys, /근거 문단에서만 답하고/);
  assert.match(sys, /\[문서명 §n\]/);
  assert.match(sys, /모른다고/);
  assert.match(sys, /\[개인정보 처리 기준 §3\]\n3\. 개인정보는 어떻게 처리하는가\n개인정보는 연습 담당 권한/);
  assert.match(sys, /\[개인정보 처리 기준 §1\]\n연습 기록에는 대상자 번호만 남긴다\./);
  assert.equal(r.json.mock, false);
  assert.deepEqual(r.json.refs, [{ doc: '개인정보 처리 기준', n: 3 }]);
  assert.doesNotMatch(JSON.stringify(r), /sk-test-0000/);
  // docs 가 아니면 근거 문단 지시는 없다
  await createChat({ env: { OPENAI_API_KEY: 'sk-test-0000' }, fetchImpl })(body);
  assert.doesNotMatch(JSON.parse(calls[1].body).messages[0].content, /근거 문단/);
});

test('근거 문서 본문 검사: passages 모양·개수·길이가 틀리면 400', async () => {
  const c = createChat({ env: {}, fetchImpl: failFetch });
  const bad = async (patch) => (await c({ ...docBody, ...patch })).status;
  assert.equal(await bad({ passages: 'x' }), 400);
  assert.equal(await bad({ passages: Array.from({ length: 6 }, () => passages[0]) }), 400);
  assert.equal(await bad({ passages: [{ doc: '문서', n: 0, text: 'a' }] }), 400);
  assert.equal(await bad({ passages: [{ doc: '', n: 1, text: 'a' }] }), 400);
  assert.equal(await bad({ passages: [{ doc: '문서', n: 1, text: 'a'.repeat(1001) }] }), 400);
  assert.equal(await bad({ docs: 'yes' }), 400);
  assert.equal(await bad({}), 200);
});

test('근거 문서(키 없음): 질문이 화면 지표 이름(세 글자 이상)과 맞으면 문서 문단이 같이 붙어 와도 화면 데이터로 답한다 — 칩 질문 「미연습 질문이 몇 개야?」', async () => {
  const c = createChat({ env: {}, fetchImpl: failFetch });
  const r = await c({ messages: [{ role: 'user', content: '미연습 질문이 몇 개야?' }], context, docs: true, passages: [{ doc: '면접 질문 작성 지침', n: 5, text: '4. 답변 시간과 상태 관리\n질문의 상태는 미연습, 연습중, 완료로 관리한다.' }] });
  assert.equal(r.json.reply, '화면 데이터 기준으로 「미연습: 12개」입니다.');
  assert.equal(r.json.refs, undefined);
});

test('OPENAI_BASE_URL: 있으면 그 주소(끝 / 정리)+/chat/completions 로, 없거나 비면 기본 주소로 부른다 · 키·주소는 응답에 없다', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '답입니다.' } }] }) }; };
  const base = 'http://proxy.internal:9/v1/';
  const r = await createChat({ env: { OPENAI_API_KEY: 'sk-test-0000', OPENAI_BASE_URL: base }, fetchImpl })(body);
  await createChat({ env: { OPENAI_API_KEY: 'sk-test-0000', OPENAI_BASE_URL: '  ' }, fetchImpl })(body);
  await createChat({ env: { OPENAI_API_KEY: 'sk-test-0000' }, fetchImpl })(body);
  assert.deepEqual(urls, ['http://proxy.internal:9/v1/chat/completions', OPENAI_URL, OPENAI_URL]);
  const bad = await createChat({ env: { OPENAI_API_KEY: 'sk-test-0000', OPENAI_BASE_URL: base }, fetchImpl: async () => { throw new TypeError(`fetch failed ${base} sk-test-0000`); } })(body);
  for (const x of [r, bad]) assert.ok(!JSON.stringify(x).includes('sk-test-0000') && !JSON.stringify(x).includes('proxy.internal'));
});
