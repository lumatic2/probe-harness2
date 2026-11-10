// 실행: node --test starter/shadcn/overlay/server/auth.test.mjs   (앱 안에서는 node --test server/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COOKIE, createAuth, LOCK_AFTER, parseCookie, parseUsers, TTL_MS } from './auth.mjs';

// 비밀번호 값은 상수로만(점검기가 「password: '…'」 꼴을 시크릿으로 본다)
const OP = 'op-pw1', U1 = 'u1-pw1';
const env = { AUTH_ON: '1', AUTH_USERS: `op:${OP}:operator:운영자;u1:${U1}:user:사용자 1;broken;x::user` };

test('AUTH_USERS 파싱 — 모양이 틀린 항목은 버리고 표시이름이 없으면 id', () => {
  const u = parseUsers(env.AUTH_USERS);
  assert.deepEqual(u.map((x) => [x.id, x.role, x.name]), [['op', 'operator', '운영자'], ['u1', 'user', '사용자 1']]);
  assert.deepEqual(parseUsers('a:b:c'), [{ id: 'a', password: 'b', role: 'c', name: 'a' }]);
  assert.deepEqual(parseCookie(`x=1; ${COOKIE}=tok; y=2`), { x: '1', [COOKIE]: 'tok', y: '2' });
});

test('꺼져 있으면(AUTH_ON 없음) 누구나 기본 역할로 통과, 쓰기 허용, me 는 enabled:false', () => {
  const a = createAuth({ env: {} });
  assert.equal(a.enabled, false);
  const u = a.userFrom(undefined);
  assert.equal(u.role, 'operator');
  assert.equal(a.canWrite(u), true);
  assert.equal(a.me('').json.enabled, false);
  assert.equal(a.me('').json.canWrite, true);
  assert.equal(createAuth({ env: { AUTH_DEFAULT_ROLE: 'user' } }).userFrom('').role, 'user');
});

test('켜져 있으면 로그인 전 401, 로그인 뒤 쿠키로 me 200, 역할에 따라 쓰기 허용/거부, 로그아웃 뒤 다시 401', () => {
  let t = 1000;
  const a = createAuth({ env, now: () => t, token: () => 'tok-1' });
  assert.equal(a.me('').status, 401);
  assert.equal(a.userFrom(''), null);
  const bad = a.login({ id: 'op', password: 'wrong' });
  assert.equal(bad.status, 401);
  assert.equal(bad.cookie, undefined);
  assert.ok(!JSON.stringify(bad.json).includes(OP), '응답에 비밀번호가 없어야 한다');
  const ok = a.login({ id: 'op', password: OP });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.user, { id: 'op', name: '운영자', role: 'operator' });
  assert.match(ok.cookie, new RegExp(`^${COOKIE}=tok-1; Path=/; HttpOnly; SameSite=Lax; Max-Age=\\d+$`));
  const cookie = `${COOKIE}=tok-1`;
  assert.equal(a.me(cookie).status, 200);
  assert.equal(a.me(cookie).json.canWrite, true);
  assert.equal(a.canWrite(a.userFrom(cookie)), true);
  // 보기 역할은 쓰기 거부
  const a2 = createAuth({ env, token: () => 'tok-2' });
  a2.login({ id: 'u1', password: U1 });
  assert.equal(a2.canWrite(a2.userFrom(`${COOKIE}=tok-2`)), false);
  // 만료
  t += TTL_MS + 1;
  assert.equal(a.me(cookie).status, 401);
  // 로그아웃
  t = 2000;
  a.login({ id: 'op', password: OP });
  const out = a.logout(cookie);
  assert.match(out.cookie, /Max-Age=0/);
  assert.equal(a.me(cookie).status, 401);
});

test('입력 검사와 잠금 — 빈 값 400, 실패 5회면 60초 429, 성공하면 풀림', () => {
  let t = 0;
  const a = createAuth({ env, now: () => t });
  assert.equal(a.login({}).status, 400);
  assert.equal(a.login({ id: 'op' }).status, 400);
  assert.equal(a.login('x').status, 400);
  assert.equal(a.login({ id: 'a'.repeat(65), password: 'p' }).status, 400);
  for (let i = 0; i < LOCK_AFTER; i++) assert.equal(a.login({ id: 'op', password: 'no' }).status, 401);
  assert.equal(a.login({ id: 'op', password: OP }).status, 429, '잠금 중에는 맞는 비밀번호도 거부');
  t += 60 * 1000 + 1;
  assert.equal(a.login({ id: 'op', password: OP }).status, 200);
});

test('로그인 응답에 token 이 있고, 그 값은 쿠키의 세션과 같다(쿠키가 막힌 환경의 헤더 통로)', () => {
  const a = createAuth({ env, token: () => 'tok-9' });
  const ok = a.login({ id: 'op', password: OP });
  assert.equal(ok.json.token, 'tok-9');
  assert.equal(a.me(`${COOKIE}=tok-9`).status, 200);
  assert.equal(a.login({ id: 'op', password: 'wrong' }).json.token, undefined);
});

test('빠른 로그인 — AUTH_QUICK=1 일 때만 계정 목록(비밀번호 없음)이 나가고 {quick:id} 로 들어간다', () => {
  const off = createAuth({ env });
  assert.deepEqual(off.me('').json.quick, []);
  assert.equal(off.login({ quick: 'op' }).status, 403);
  const on = createAuth({ env: { ...env, AUTH_QUICK: '1' }, token: () => 'tok-q' });
  const list = on.me('').json.quick;
  assert.deepEqual(list, [{ id: 'op', name: '운영자', role: 'operator' }, { id: 'u1', name: '사용자 1', role: 'user' }]);
  assert.ok(!JSON.stringify(list).includes(OP) && !JSON.stringify(list).includes(U1), '목록에 비밀번호가 없어야 한다');
  assert.equal(on.login({ quick: 'nobody' }).status, 401);
  const ok = on.login({ quick: 'u1' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.role, 'user');
  assert.equal(ok.json.canWrite, false);
  assert.equal(on.me(`${COOKIE}=tok-q`).status, 200);
  // 로그인이 꺼져 있으면 AUTH_QUICK 는 아무 일도 하지 않는다
  assert.equal(createAuth({ env: { AUTH_QUICK: '1' } }).quick, false);
});
