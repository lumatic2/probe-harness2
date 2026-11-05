// 실행: node --test starter/shadcn/overlay/server/assist.test.mjs   (앱 안에서는 node --test server/)
// 실제 OpenAI 호출은 하지 않는다 — 키가 없으면 모의 응답, 키가 있으면 fetch(목)가 불리는 것만 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssist, DEFAULT_MODEL, mockSuggestion, OPENAI_URL, parseBody } from './assist.mjs';

const body = { question: '왜 지원했나요?', answer: '솔직히 연봉이 중요해서 지원했습니다. 그래도 열심히 하겠습니다.', code: 'risk', terms: ['솔직히', '연봉'], sentences: ['솔직히 연봉이 중요해서 지원했습니다.'], minChars: 30 };
const failFetch = () => { throw new Error('키가 없을 때는 fetch 를 부르면 안 된다'); };

test('키 없음: 모의 응답, 외부 호출 없음, 같은 입력이면 같은 문장', async () => {
  const a = createAssist({ env: {}, fetchImpl: failFetch });
  const r1 = await a(body), r2 = await a(body);
  assert.equal(r1.status, 200);
  assert.equal(r1.json.source, 'mock');
  assert.equal(r1.json.reason, 'no-key');
  assert.deepEqual(r1, r2);
  assert.equal(r1.json.suggestion, '「솔직히」, 「연봉」 같은 표현은 단정하거나 부정적으로 들릴 수 있습니다. 상황, 내가 한 행동, 결과 순서로 사실과 근거를 한 문장씩 적어 다시 말해 보세요.');
  assert.equal((await createAssist({ env: { OPENAI_API_KEY: '   ' }, fetchImpl: failFetch })(body)).json.source, 'mock');
});

test('모의 문장은 판정 코드마다 고정', () => {
  assert.equal(mockSuggestion({ code: 'safe' }), '위험으로 정한 표현은 없습니다. 결론을 먼저 말하고, 구체적인 사례와 숫자를 하나 덧붙이면 더 설득력이 생깁니다.');
  assert.equal(mockSuggestion({ code: 'short', minChars: 40 }), '답변이 짧습니다. 상황, 내가 한 행동, 결과를 각각 한 문장씩 더해 40자 이상으로 늘려 보세요.');
});

test('키 있음: OpenAI Chat Completions 를 부르고(주소·헤더·모델·메시지), 키는 응답에 없다', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, init]); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '  결론을 먼저 말해 보세요.  ' } }] }) }; };
  const r = await createAssist({ env: { OPENAI_API_KEY: 'sk-test-0000', OPENAI_MODEL: 'my-model' }, fetchImpl })(body);
  assert.equal(calls.length, 1);
  const [url, init] = calls[0];
  assert.equal(url, OPENAI_URL);
  assert.equal(url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer sk-test-0000');
  const sent = JSON.parse(init.body);
  assert.equal(sent.model, 'my-model');
  assert.equal(sent.messages[0].role, 'system');
  assert.match(sent.messages[1].content, /질문: 왜 지원했나요\?/);
  assert.match(sent.messages[1].content, /판정 코드: risk/);
  assert.deepEqual(r, { status: 200, json: { suggestion: '결론을 먼저 말해 보세요.', source: 'openai', model: 'my-model' } });
  assert.ok(!JSON.stringify(r).includes('sk-test-0000'));
  // 모델을 안 정하면 기본값
  const r2 = await createAssist({ env: { OPENAI_API_KEY: 'sk-test-0000' }, fetchImpl })(body);
  assert.equal(r2.json.model, DEFAULT_MODEL);
});

test('키 있음이지만 실패하면 모의로 돌아가고 이유만 알린다: HTTP 오류 · 빈 응답 · 네트워크 · 시간 초과', async () => {
  const env = { OPENAI_API_KEY: 'sk-test-0000' };
  const run = (fetchImpl, timeoutMs) => createAssist({ env, fetchImpl, timeoutMs })(body);
  const http = await run(async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'bad key sk-test-0000' } }) }));
  assert.deepEqual([http.status, http.json.source, http.json.reason], [200, 'mock', 'http-401']);
  assert.ok(!JSON.stringify(http).includes('sk-test-0000'));
  const empty = await run(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: ' ' } }] }) }));
  assert.equal(empty.json.reason, 'empty');
  const net = await run(async () => { throw new TypeError('fetch failed sk-test-0000'); });
  assert.equal(net.json.reason, 'network');
  assert.ok(!JSON.stringify(net).includes('sk-test-0000'));
  const slow = await run((_u, init) => new Promise((_ok, fail) => init.signal.addEventListener('abort', () => fail(Object.assign(new Error('aborted'), { name: 'AbortError' })))), 30);
  assert.deepEqual([slow.json.source, slow.json.reason], ['mock', 'timeout']);
  assert.equal(slow.json.suggestion, mockSuggestion({ code: 'risk', terms: body.terms }));
});

test('본문 검사: 모양이 틀리면 400, 긴 글·많은 키워드는 자른다', async () => {
  const a = createAssist({ env: {}, fetchImpl: failFetch });
  assert.equal((await a(null)).status, 400);
  assert.equal((await a({ ...body, code: 'x' })).status, 400);
  assert.equal((await a({ ...body, answer: 5 })).status, 400);
  assert.equal((await a({ ...body, answer: 'a'.repeat(4001) })).status, 400);
  assert.equal(parseBody({ ...body, terms: Array.from({ length: 50 }, (_, i) => `t${i}`) }).value.terms.length, 20);
});

test('OPENAI_BASE_URL: 있으면 그 주소(끝 / 정리)+/chat/completions 로, 없거나 비면 기본 주소로 부른다 · 키·주소는 응답에 없다', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '답입니다.' } }] }) }; };
  const base = 'http://proxy.internal:9/v1/';
  const r = await createAssist({ env: { OPENAI_API_KEY: 'sk-test-0000', OPENAI_BASE_URL: base }, fetchImpl })(body);
  await createAssist({ env: { OPENAI_API_KEY: 'sk-test-0000', OPENAI_BASE_URL: '  ' }, fetchImpl })(body);
  await createAssist({ env: { OPENAI_API_KEY: 'sk-test-0000' }, fetchImpl })(body);
  assert.deepEqual(urls, ['http://proxy.internal:9/v1/chat/completions', OPENAI_URL, OPENAI_URL]);
  const bad = await createAssist({ env: { OPENAI_API_KEY: 'sk-test-0000', OPENAI_BASE_URL: base }, fetchImpl: async () => { throw new TypeError(`fetch failed ${base} sk-test-0000`); } })(body);
  for (const x of [r, bad]) assert.ok(!JSON.stringify(x).includes('sk-test-0000') && !JSON.stringify(x).includes('proxy.internal'));
});
