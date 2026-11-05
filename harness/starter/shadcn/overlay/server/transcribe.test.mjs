// 실행: node --test starter/shadcn/overlay/server/transcribe.test.mjs   (앱 안에서는 node --test server/)
// 실제 OpenAI 호출은 하지 않는다 — 키가 없으면 모의 전사, 키가 있으면 fetch(대역)가 받는 요청 모양만 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTranscribe, mockTranscript, parseBody, DEFAULT_STT_MODEL, STT_URL, MAX_AUDIO_BYTES } from './transcribe.mjs';

const b64 = (n) => Buffer.alloc(n, 7).toString('base64');
const small = { audio: b64(5000), mime: 'audio/webm;codecs=opus' };
const failFetch = () => { throw new Error('키가 없을 때는 fetch 를 부르면 안 된다'); };

test('키 없음: 모의 전사, 외부 호출 없음, 같은 입력이면 같은 글', async () => {
  const t = createTranscribe({ env: {}, fetchImpl: failFetch });
  const r1 = await t(small), r2 = await t(small);
  assert.deepEqual(r1, r2);
  assert.equal(r1.status, 200);
  assert.equal(r1.json.mock, true);
  assert.equal(r1.json.source, 'mock');
  assert.equal(r1.json.reason, 'no-key');
  assert.equal(r1.json.text, '네, 먼저 오늘 경기에 대해 간단히 말씀드리겠습니다.');
  assert.equal((await createTranscribe({ env: { OPENAI_API_KEY: '  ' }, fetchImpl: failFetch })(small)).json.mock, true);
});

test('모의 문장은 녹음 길이(바이트)에 따라 고정 세 단계', () => {
  assert.equal(mockTranscript(5000), '네, 먼저 오늘 경기에 대해 간단히 말씀드리겠습니다.');
  assert.equal(mockTranscript(60000), '네, 오늘 경기에서는 초반 운영이 가장 중요했다고 생각합니다. 팀원들과 미리 맞춘 계획대로 움직였고, 결과도 만족스럽습니다.');
  assert.equal(mockTranscript(500000), '네, 오늘 경기에서는 초반 운영이 가장 중요했다고 생각합니다. 팀원들과 미리 맞춘 계획대로 움직였고, 결과도 만족스럽습니다. 중간에 흐름이 넘어갈 뻔한 순간이 있었지만 서로 목소리를 맞추며 다시 가져왔습니다. 다음 경기도 같은 마음으로 준비하겠습니다.');
});

test('키 있음: OpenAI 전사 API 를 multipart 로 부른다(주소·헤더·모델·언어·파일), 키는 응답에 없다', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, init]); return { ok: true, status: 200, json: async () => ({ text: '  안녕하세요 전사 결과입니다.  ' }) }; };
  const r = await createTranscribe({ env: { OPENAI_API_KEY: 'sk-test-0000', OPENAI_STT_MODEL: 'my-stt' }, fetchImpl })(small);
  assert.equal(calls.length, 1);
  const [url, init] = calls[0];
  assert.equal(url, STT_URL);
  assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer sk-test-0000');
  assert.ok(init.body instanceof FormData);
  assert.equal(init.body.get('model'), 'my-stt');
  assert.equal(init.body.get('language'), 'ko');
  const f = init.body.get('file');
  assert.equal(f.name, 'audio.webm');
  assert.equal(f.size, 5000);
  assert.deepEqual(r, { status: 200, json: { text: '안녕하세요 전사 결과입니다.', source: 'openai', mock: false, model: 'my-stt' } });
  assert.ok(!JSON.stringify(r).includes('sk-test-0000'));
  const r2 = await createTranscribe({ env: { OPENAI_API_KEY: 'sk-test-0000' }, fetchImpl })(small);
  assert.equal(r2.json.model, DEFAULT_STT_MODEL);
  assert.equal(DEFAULT_STT_MODEL, 'whisper-1');
  await createTranscribe({ env: { OPENAI_API_KEY: 'k' }, fetchImpl })({ audio: b64(10), mime: 'audio/mp4' });
  assert.equal(calls[2][1].body.get('file').name, 'audio.mp4');
  await createTranscribe({ env: { OPENAI_API_KEY: 'k' }, fetchImpl })({ audio: b64(10), mime: 'audio/ogg' });
  assert.equal(calls[3][1].body.get('file').name, 'audio.ogg');
});

test('키 있음이지만 실패하면 모의 + 이유만: HTTP 오류 · 빈 응답 · 네트워크 · 시간 초과, 키는 어디에도 없다', async () => {
  const env = { OPENAI_API_KEY: 'sk-test-0000' };
  const run = (fetchImpl, timeoutMs) => createTranscribe({ env, fetchImpl, timeoutMs })(small);
  const http = await run(async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'bad key sk-test-0000' } }) }));
  assert.deepEqual([http.status, http.json.mock, http.json.reason], [200, true, 'http-401']);
  assert.ok(!JSON.stringify(http).includes('sk-test-0000'));
  assert.equal((await run(async () => ({ ok: true, status: 200, json: async () => ({ text: ' ' }) }))).json.reason, 'empty');
  const net = await run(async () => { throw new TypeError('fetch failed sk-test-0000'); });
  assert.equal(net.json.reason, 'network');
  assert.ok(!JSON.stringify(net).includes('sk-test-0000'));
  const slow = await run((_u, init) => new Promise((_ok, fail) => init.signal.addEventListener('abort', () => fail(Object.assign(new Error('x'), { name: 'AbortError' })))), 30);
  assert.deepEqual([slow.json.mock, slow.json.reason], [true, 'timeout']);
  assert.equal(slow.json.text, mockTranscript(5000));
});

test('본문 검사: 모양·형식·크기가 틀리면 400', async () => {
  const t = createTranscribe({ env: {}, fetchImpl: failFetch });
  assert.equal((await t(null)).status, 400);
  assert.equal((await t({ mime: 'audio/webm' })).status, 400);
  assert.equal((await t({ audio: '', mime: 'audio/webm' })).status, 400);
  assert.equal((await t({ audio: '###', mime: 'audio/webm' })).status, 400);
  assert.equal((await t({ audio: b64(100), mime: 'text/plain' })).status, 400);
  assert.equal((await t({ audio: b64(100), mime: 'video/mp4' })).status, 400);
  assert.equal((await t({ audio: b64(100) })).status, 400);
  const big = await t({ audio: b64(MAX_AUDIO_BYTES + 1), mime: 'audio/webm' });
  assert.equal(big.status, 400);
  assert.match(big.json.error, /큽니다/);
  assert.equal((await t({ audio: b64(MAX_AUDIO_BYTES), mime: 'audio/webm' })).status, 200);
  assert.equal(parseBody({ audio: b64(100), mime: 'audio/mpeg' }).value.ext, 'mp3');
  assert.equal(parseBody({ audio: b64(100), mime: 'audio/x-m4a' }).value.ext, 'm4a');
});

test('OPENAI_BASE_URL: 있으면 그 주소(끝 / 정리)+/audio/transcriptions 로, 없거나 비면 기본 주소로 부른다 · 키·주소는 응답에 없다', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => ({ text: '전사 결과입니다.' }) }; };
  const base = 'http://proxy.internal:9/v1/';
  const r = await createTranscribe({ env: { OPENAI_API_KEY: 'sk-test-0000', OPENAI_BASE_URL: base }, fetchImpl })(small);
  await createTranscribe({ env: { OPENAI_API_KEY: 'sk-test-0000', OPENAI_BASE_URL: '  ' }, fetchImpl })(small);
  await createTranscribe({ env: { OPENAI_API_KEY: 'sk-test-0000' }, fetchImpl })(small);
  assert.deepEqual(urls, ['http://proxy.internal:9/v1/audio/transcriptions', STT_URL, STT_URL]);
  const bad = await createTranscribe({ env: { OPENAI_API_KEY: 'sk-test-0000', OPENAI_BASE_URL: base }, fetchImpl: async () => { throw new TypeError(`fetch failed ${base} sk-test-0000`); } })(small);
  for (const x of [r, bad]) assert.ok(!JSON.stringify(x).includes('sk-test-0000') && !JSON.stringify(x).includes('proxy.internal'));
});
