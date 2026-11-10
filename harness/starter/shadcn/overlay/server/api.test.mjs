// 실행: node --test starter/shadcn/overlay/server/api.test.mjs   (앱 안에서는 node --test server/)
// /api 라우팅 분기만 본다 — 서비스는 모형(mock). 실제 auth 규칙은 auth.test.mjs, datasets·run 은 각자 테스트.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi, HttpError, PROTECTED_STORE, READ_POSTS, readJsonBody } from './api.mjs';

// ---- 요청·응답 모형
function makeReq(method, url, { body, cookie, authorization, chunks } = {}) {
  const req = new EventEmitter();
  req.method = method; req.url = url; req.headers = { ...(cookie ? { cookie } : {}), ...(authorization ? { authorization } : {}) };
  const parts = chunks ?? (body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  queueMicrotask(() => { for (const c of parts) req.emit('data', c); req.emit('end'); });
  return req;
}
function makeRes() {
  const res = { statusCode: 0, headers: {}, body: '', headersSent: false };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (b) => { res.headersSent = true; res.body = b == null ? '' : String(b); };
  res.json = () => JSON.parse(res.body);
  return res;
}
async function call(api, method, url, opts) {
  const res = makeRes();
  let nexted = false;
  await api.middleware(makeReq(method, url, opts), res, () => { nexted = true; });
  return { res, nexted, status: res.statusCode, json: res.body ? JSON.parse(res.body) : undefined };
}

// ---- 서비스 모형
const OK = (json = { ok: true }) => ({ status: 200, json });
function makeAuth({ enabled = true, user = { id: 'op', role: 'operator' }, canWrite = true } = {}) {
  const calls = [];
  return {
    enabled, calls,
    me: (c) => { calls.push(['me', c]); return { status: 200, json: { enabled, user } }; },
    login: (b) => { calls.push(['login', b]); return { status: 200, json: { user }, cookie: 'sid=tok; Path=/' }; },
    logout: (c) => { calls.push(['logout', c]); return { status: 200, json: { ok: true }, cookie: 'sid=; Max-Age=0' }; },
    userFrom: () => user,
    canWrite: () => canWrite,
  };
}
function makeServices(root, authOpts) {
  const log = [];
  const rec = (name) => (...a) => { log.push([name, ...a]); return OK({ via: name }); };
  const recAsync = (name) => async (...a) => { log.push([name, ...a]); return OK({ via: name }); };
  return {
    log,
    opts: {
      root,
      auth: makeAuth(authOpts),
      assist: recAsync('assist'), chat: recAsync('chat'), transcribe: recAsync('transcribe'),
      datasets: { list: rec('datasets.list'), validate: rec('datasets.validate'), apply: rec('datasets.apply') },
      run: { start: rec('run.start'), status: rec('run.status') },
    },
  };
}
function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-test-'));
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  return root;
}

test('/api 밖은 next(), 이름이 틀리면 400, health 는 인증 없이 200', async () => {
  const s = makeServices(tmpRoot(), { user: null });
  const api = createApi(s.opts);
  assert.equal((await call(api, 'GET', '/index.html')).nexted, true);
  assert.equal((await call(api, 'GET', '/api/Bad_Name')).status, 400);
  assert.equal((await call(api, 'GET', '/api/%E0%A4%A')).status, 400); // decode 실패
  const h = await call(api, 'GET', '/api/health?x=1');
  assert.equal(h.status, 200);
  assert.deepEqual(h.json, { ok: true, auth: true, ai: false });
  const withAi = await call(createApi({ ...makeServices(tmpRoot()).opts, ai: { enabled: true, model: 'm-1' } }), 'GET', '/api/health');
  assert.deepEqual(withAi.json, { ok: true, auth: true, ai: true, aiModel: 'm-1' });
});

test('auth-* — me 는 GET, login·logout 은 POST, 그 외 405, Set-Cookie 전달, 로그인 전에도 닿는다', async () => {
  const s = makeServices(tmpRoot(), { user: null });
  const api = createApi(s.opts);
  assert.equal((await call(api, 'GET', '/api/auth-me', { cookie: 'sid=a' })).status, 200);
  const login = await call(api, 'POST', '/api/auth-login', { body: { id: 'op', password: 'x' } });
  assert.equal(login.status, 200);
  assert.equal(login.res.headers['Set-Cookie'], 'sid=tok; Path=/');
  assert.deepEqual(s.opts.auth.calls.find((c) => c[0] === 'login')[1], { id: 'op', password: 'x' });
  assert.equal((await call(api, 'POST', '/api/auth-logout')).res.headers['Set-Cookie'], 'sid=; Max-Age=0');
  assert.equal((await call(api, 'POST', '/api/auth-me')).status, 405);
  assert.equal((await call(api, 'GET', '/api/auth-login')).status, 405);
  assert.equal((await call(api, 'GET', '/api/auth-whatever')).status, 405);
  // 로그인 본문이 JSON 이 아니면 400 (HttpError 가 middleware 에서 응답으로)
  assert.equal((await call(api, 'POST', '/api/auth-login', { body: '{broken' })).status, 400);
});

test('세션 없으면 auth-*·health 빼고 전부 401 — GET 저장물·서비스·POST 모두', async () => {
  const s = makeServices(tmpRoot(), { user: null });
  const api = createApi(s.opts);
  for (const [m, u] of [['GET', '/api/decisions-alarm'], ['GET', '/api/datasets'], ['POST', '/api/chat'], ['POST', '/api/run'], ['PUT', '/api/memo']]) {
    const r = await call(api, m, u, { body: {} });
    assert.equal(r.status, 401, `${m} ${u}`);
  }
  assert.equal(s.log.length, 0, '서비스가 불리면 안 된다');
});

test('쓰기 권한 없는 역할 — POST/PUT 은 403, 단 READ_POSTS 는 통과, GET 은 통과', async () => {
  const root = tmpRoot();
  fs.writeFileSync(path.join(root, 'data', 'memo.json'), '{"a":1}');
  const s = makeServices(root, { user: { id: 'u1', role: 'user' }, canWrite: false });
  const api = createApi(s.opts);
  assert.deepEqual([...READ_POSTS].sort(), ['assist', 'chat', 'datasets-validate', 'transcribe']);
  for (const name of READ_POSTS) {
    const r = await call(api, 'POST', `/api/${name}`, { body: { q: 1 } });
    assert.equal(r.status, 200, name);
  }
  assert.equal((await call(api, 'POST', '/api/datasets-apply', { body: {} })).status, 403);
  assert.equal((await call(api, 'POST', '/api/run', { body: {} })).status, 403);
  assert.equal((await call(api, 'PUT', '/api/memo', { body: { a: 2 } })).status, 403);
  assert.equal((await call(api, 'POST', '/api/anything-new', { body: {} })).status, 403);
  const g = await call(api, 'GET', '/api/memo');
  assert.equal(g.status, 200);
  assert.deepEqual(g.json, { a: 1 });
  assert.ok(!s.log.some((l) => l[0] === 'datasets.apply' || l[0] === 'run.start'), '403 뒤에 서비스가 불리면 안 된다');
});

test('서비스 경로 — 메서드 맞으면 서비스로, 틀리면 405, 빈 본문은 datasets-*·run 에만 허용', async () => {
  const s = makeServices(tmpRoot());
  const api = createApi(s.opts);
  assert.equal((await call(api, 'GET', '/api/datasets')).json.via, 'datasets.list');
  assert.equal((await call(api, 'GET', '/api/run-status')).json.via, 'run.status');
  assert.equal((await call(api, 'POST', '/api/datasets')).status, 405);
  assert.equal((await call(api, 'POST', '/api/run-status')).status, 405);
  assert.equal((await call(api, 'POST', '/api/run')).json.via, 'run.start'); // 빈 본문 → {}
  assert.deepEqual(s.log.find((l) => l[0] === 'run.start')[1], {});
  assert.equal((await call(api, 'POST', '/api/datasets-validate', { body: { name: 'x' } })).json.via, 'datasets.validate');
  assert.equal((await call(api, 'POST', '/api/datasets-apply', { body: { name: 'x' } })).json.via, 'datasets.apply');
  assert.equal((await call(api, 'GET', '/api/run')).status, 405);
  assert.equal((await call(api, 'POST', '/api/chat', { body: { messages: [] } })).json.via, 'chat');
  assert.equal((await call(api, 'POST', '/api/assist', { body: { text: 'a' } })).json.via, 'assist');
  assert.equal((await call(api, 'POST', '/api/transcribe', { body: { audio: 'x' } })).json.via, 'transcribe');
  assert.equal((await call(api, 'GET', '/api/chat')).status, 405);
  assert.equal((await call(api, 'GET', '/api/transcribe')).status, 405);
  // 빈 본문은 chat·assist 에선 400
  assert.equal((await call(api, 'POST', '/api/chat')).status, 400);
});

test('저장물 — GET 은 store → data 씨앗 → 도메인 씨앗 → import-* 빈 값 → 404, POST/PUT 은 data/store 에 원자적 쓰기', async () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, 'src', 'domain', 'alarm'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'domain', 'alarm', 'decisions.json'), '{"seed":"domain"}');
  fs.writeFileSync(path.join(root, 'data', 'memo.json'), '{"seed":"data"}');
  const s = makeServices(root);
  const api = createApi(s.opts);
  assert.deepEqual((await call(api, 'GET', '/api/decisions-alarm')).json, { seed: 'domain' });
  assert.deepEqual((await call(api, 'GET', '/api/memo')).json, { seed: 'data' });
  assert.deepEqual((await call(api, 'GET', '/api/import-x')).json, {});
  assert.equal((await call(api, 'GET', '/api/nothing-here')).status, 404);
  // 쓰기 → store 가 씨앗을 가린다
  assert.equal((await call(api, 'PUT', '/api/memo', { body: { v: 2 } })).status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'data', 'store', 'memo.json'), 'utf8')), { v: 2 });
  assert.deepEqual((await call(api, 'GET', '/api/memo')).json, { v: 2 });
  assert.equal(fs.existsSync(path.join(root, 'data', 'store', 'memo.json.tmp')), false, 'tmp 가 남으면 안 된다');
  assert.equal((await call(api, 'POST', '/api/decisions-alarm', { body: [1] })).status, 200);
  assert.deepEqual((await call(api, 'GET', '/api/decisions-alarm')).json, [1]);
  assert.equal((await call(api, 'DELETE', '/api/memo')).status, 405);
  assert.equal((await call(api, 'POST', '/api/memo', { body: 'not json' })).status, 400);
});

test('PROTECTED_STORE — dataset-current·run-result 는 일반 POST/PUT 405, GET 은 된다', async () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, 'data', 'store'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'store', 'run-result.json'), '{"r":1}');
  const s = makeServices(root);
  const api = createApi(s.opts);
  assert.deepEqual([...PROTECTED_STORE].sort(), ['dataset-current', 'run-result']);
  for (const name of PROTECTED_STORE) {
    assert.equal((await call(api, 'POST', `/api/${name}`, { body: {} })).status, 405, name);
    assert.equal((await call(api, 'PUT', `/api/${name}`, { body: {} })).status, 405, name);
  }
  assert.deepEqual((await call(api, 'GET', '/api/run-result')).json, { r: 1 });
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'data', 'store', 'run-result.json'), 'utf8')).r, 1, '덮어쓰이면 안 된다');
});

test('본문 상한 — 넘으면 413, transcribe 는 큰 상한, 서비스 예외는 500 으로 돌아오고 프로세스는 산다', async () => {
  const s = makeServices(tmpRoot());
  s.opts.maxBody = 16; s.opts.maxAudioBody = 64;
  s.opts.assist = async () => { throw new Error('schema 깨짐'); };
  const api = createApi(s.opts);
  const big = Buffer.alloc(32, 'a');
  assert.equal((await call(api, 'POST', '/api/chat', { chunks: [big] })).status, 413);
  const t = await call(api, 'POST', '/api/transcribe', { chunks: [Buffer.from(JSON.stringify({ a: 'x'.repeat(20) }))] });
  assert.equal(t.status, 200, '32B 는 audio 상한(64) 안');
  assert.equal((await call(api, 'POST', '/api/transcribe', { chunks: [Buffer.alloc(100, 'b')] })).status, 413);
  const boom = await call(api, 'POST', '/api/assist', { body: {} });
  assert.equal(boom.status, 500);
  assert.match(boom.json.error, /schema 깨짐/);
  // 이미 응답을 시작했으면 두 번 쓰지 않는다
  const res = makeRes(); res.headersSent = true; res.statusCode = 200;
  s.opts.chat = async () => { throw new Error('late'); };
  await createApi(s.opts).middleware(makeReq('POST', '/api/chat', { body: {} }), res, () => {});
  assert.equal(res.statusCode, 200);
});

test('readJsonBody — HttpError 상태를 그대로 들고 온다', async () => {
  await assert.rejects(readJsonBody(makeReq('POST', '/x', { body: '{' })), (e) => e instanceof HttpError && e.status === 400);
  await assert.rejects(readJsonBody(makeReq('POST', '/x', { chunks: [Buffer.alloc(10)] }), 4), (e) => e instanceof HttpError && e.status === 413);
  assert.deepEqual(await readJsonBody(makeReq('POST', '/x'), 100, true), {});
});

test('Authorization: Bearer 토큰은 쿠키 자리로 합쳐져 auth 에 넘어간다 — 쿠키가 없어도, 있어도(뒤에 붙는다)', async () => {
  const s = makeServices(tmpRoot());
  const api = createApi(s.opts);
  await call(api, 'GET', '/api/auth-me', { authorization: 'Bearer tok-12345678' });
  await call(api, 'GET', '/api/auth-me', { cookie: 'x=1', authorization: 'Bearer tok-12345678' });
  await call(api, 'GET', '/api/auth-me', { cookie: 'x=1', authorization: 'Basic abc' });
  const seen = s.opts.auth.calls.filter((c) => c[0] === 'me').map((c) => c[1]);
  assert.deepEqual(seen, ['sk_session=tok-12345678', 'x=1; sk_session=tok-12345678', 'x=1']);
});
