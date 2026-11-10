// auth.mjs — 로그인·역할 껍데기. /api/auth-login(POST) · /api/auth-logout(POST) · /api/auth-me(GET) 와 서버 측 권한 검사.
// 켜기: 서버 환경변수(또는 앱 폴더 .env) AUTH_ON=1. 꺼져 있으면 모든 요청이 기본 역할(AUTH_DEFAULT_ROLE, 기본 operator)로 통과하고 화면도 로그인을 묻지 않는다.
// 계정: AUTH_USERS="id:비밀번호:역할:표시이름;id2:…" — 비밀번호는 .env 에만(커밋 금지). 역할 이름은 자유(권장: user=보기 · operator=쓰기).
// 쓰기(POST·PUT /api/*)는 AUTH_WRITE_ROLES(기본 "operator", 쉼표 구분)에 든 역할만 — 버튼 숨김과 별개로 서버가 막는다(읽기 성격의 POST 예외는 vite.config.ts READ_POSTS). auth-me·auth-login 응답의 canWrite 가 그 판정이라 화면은 역할 이름을 몰라도 된다.
// 세션: 서버 메모리의 토큰(쿠키 sk_session, HttpOnly, 8시간). 응시 환경의 Browser 는 앱을 다른 사이트의 틀(iframe) 안에 띄워 SameSite=Lax 쿠키가 돌아오지 않을 수 있다(증상: 로그인 직후 다시 미로그인) — 그래서 로그인 응답에 token 도 주고, 화면은 그것을 Authorization: Bearer 로 같이 보낸다(api.mjs 가 쿠키 자리로 합친다, 화면 쪽은 src/lib/session-fetch.ts). 재시작하면 풀린다 — 과제가 세션 영속을 요구하면 data/store 로 옮긴다.
// 빠른 로그인: AUTH_QUICK=1 이면 로그인 화면 아래에 계정별 「○○로 로그인」 버튼이 뜬다(QA·시연용 — 비밀번호 없이 그 계정으로 들어간다). 로그인 전 auth-me 응답의 quick 에 계정 목록(id·표시이름·역할, 비밀번호 없음)이 실리고, auth-login 이 {quick:id} 를 받는다. 꺼져 있으면(기본) 목록도 안 나가고 {quick} 요청은 403.
// 응답·로그·오류 문구에 비밀번호·토큰을 넣지 않는다. 실패 5회면 그 id 는 60초 잠근다.
import { randomUUID } from 'node:crypto';

export const COOKIE = 'sk_session';
export const TTL_MS = 8 * 60 * 60 * 1000;
export const LOCK_AFTER = 5;
export const LOCK_MS = 60 * 1000;
const MAX_ID = 64, MAX_PW = 128;

// "id:비밀번호:역할:표시이름;…" → [{id,password,role,name}] (비어 있거나 모양이 틀린 항목은 버린다)
export function parseUsers(text) {
  return String(text ?? '').split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [id, password, role, ...rest] = s.split(':');
    if (!id || !password || !role) return null;
    return { id: id.trim(), password, role: role.trim(), name: rest.join(':').trim() || id.trim() };
  }).filter(Boolean);
}

export function parseCookie(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const publicUser = (u) => ({ id: u.id, name: u.name, role: u.role });
const cookieOf = (token, maxAge) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

// env: 환경변수 객체, now: 시각(테스트용), token: 토큰 생성기(테스트용)
export function createAuth({ env = process.env, now = Date.now, token = randomUUID } = {}) {
  const enabled = String(env.AUTH_ON ?? '').trim() === '1';
  const users = parseUsers(env.AUTH_USERS);
  const writeRoles = String(env.AUTH_WRITE_ROLES ?? 'operator').split(',').map((s) => s.trim()).filter(Boolean);
  const defaultRole = String(env.AUTH_DEFAULT_ROLE ?? '').trim() || 'operator';
  const quickOn = enabled && String(env.AUTH_QUICK ?? '').trim() === '1';
  const sessions = new Map(); // token → {user, exp}
  const failures = new Map(); // id → {n, until}
  const guest = { id: 'guest', name: '기본 계정', role: defaultRole };

  const sweep = () => { for (const [t, s] of sessions) if (s.exp <= now()) sessions.delete(t); };

  function userFrom(cookieHeader) {
    if (!enabled) return guest;
    const t = parseCookie(cookieHeader)[COOKIE];
    const s = t && sessions.get(t);
    if (!s) return null;
    if (s.exp <= now()) { sessions.delete(t); return null; }
    return s.user;
  }

  function login(body) {
    if (!enabled) return { status: 200, json: { user: guest, enabled: false, canWrite: true } };
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, json: { error: '본문이 JSON 객체가 아닙니다.' } };
    if (body.quick !== undefined) {
      if (!quickOn) return { status: 403, json: { error: '빠른 로그인이 꺼져 있습니다.' } };
      const q = users.find((x) => x.id === String(body.quick).trim());
      if (!q) return { status: 401, json: { error: '없는 계정입니다.' } };
      return open(q);
    }
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!id || !password) return { status: 400, json: { error: '아이디와 비밀번호를 입력하세요.' } };
    if (id.length > MAX_ID || password.length > MAX_PW) return { status: 400, json: { error: '아이디 또는 비밀번호가 너무 깁니다.' } };
    const f = failures.get(id);
    if (f && f.until > now()) return { status: 429, json: { error: '잠시 뒤 다시 시도하세요.' } };
    const u = users.find((x) => x.id === id && x.password === password);
    if (!u) {
      const n = (f && f.until > now() - LOCK_MS ? f.n : 0) + 1;
      failures.set(id, { n, until: n >= LOCK_AFTER ? now() + LOCK_MS : 0 });
      return { status: 401, json: { error: '아이디 또는 비밀번호가 맞지 않습니다.' } };
    }
    failures.delete(id);
    return open(u);
  }

  // 세션을 열고 로그인 응답을 만든다 — 비밀번호 로그인과 빠른 로그인이 같이 쓴다.
  function open(u) {
    sweep();
    const t = token();
    sessions.set(t, { user: publicUser(u), exp: now() + TTL_MS });
    return { status: 200, json: { user: publicUser(u), enabled: true, canWrite: writeRoles.includes(u.role), token: t }, cookie: cookieOf(t, Math.floor(TTL_MS / 1000)) };
  }

  function logout(cookieHeader) {
    const t = parseCookie(cookieHeader)[COOKIE];
    if (t) sessions.delete(t);
    return { status: 200, json: { ok: true }, cookie: cookieOf('', 0) };
  }

  function me(cookieHeader) {
    const u = userFrom(cookieHeader);
    if (!u) return { status: 401, json: { error: '로그인이 필요합니다.', enabled: true, quick: quickOn ? users.map(publicUser) : [] } };
    return { status: 200, json: { user: u, enabled, canWrite: canWrite(u) } };
  }

  const canWrite = (u) => !!u && (!enabled || writeRoles.includes(u.role));

  return { enabled, quick: quickOn, users: users.map(publicUser), login, logout, me, userFrom, canWrite };
}
