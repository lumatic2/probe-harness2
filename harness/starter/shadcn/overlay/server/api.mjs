// /api/<이름> 라우팅 — 화면이 쓰는 단일 JSON API 의 분기(인증·메서드·본문 상한·저장물)를 한 곳에 둔다.
// vite.config.ts 는 환경변수를 읽어 서비스 객체(auth·assist·chat·datasets·run·transcribe)를 만들고 createApi 에 넘기기만 한다.
// 그래서 이 파일은 node --test 로 서비스 모형(mock)을 꽂아 분기만 검사할 수 있다(api.test.mjs).
//
// 분기 순서(위에서 아래로 처음 맞는 것):
//   1. /api/ 로 시작하지 않으면 next()
//   2. 이름 검사 — decode 실패·^[a-z0-9-]+$ 아니면 400
//   3. health — 인증 없이 200 {ok, auth, ai, aiModel?} (ai = 서버에 AI 키가 있나. 키 값은 내보내지 않는다)
//   4. auth-me(GET) · auth-login(POST) · auth-logout(POST) — 그 외 메서드 405. Set-Cookie 전달
//   5. 세션 검사 — auth.userFrom 이 null 이면 401 (AUTH_ON 꺼져 있으면 기본 역할로 통과)
//   6. 쓰기 권한 — POST/PUT 이고 READ_POSTS 가 아니고 canWrite 가 아니면 403
//   7. 서비스 경로 — datasets·run-status(GET) · datasets-validate·datasets-apply·run(POST, 빈 본문 허용) · assist·chat(POST) · transcribe(POST, 큰 본문 상한)
//   8. 저장물 — GET: store → data 씨앗 → src/domain/<도메인>/ 씨앗 → import-* 는 빈 {} → 404 · POST/PUT: PROTECTED_STORE 면 405, 아니면 data/store/<이름>.json 에 원자적 쓰기 · 그 외 메서드 405
// 오류: 처리 중 예외는 500 {error} 로 돌려주고 서버는 계속 돈다. 본문이 상한을 넘으면 413, JSON 이 아니면 400 (HttpError).
import fs from 'node:fs'
import path from 'node:path'

export const MAX_BODY = 1024 * 1024
export const MAX_AUDIO_BODY = 12 * 1024 * 1024
// 읽기 성격의 POST — 쓰기 역할이 아니어도 부를 수 있다(화면에서 모든 역할에게 보이는 버튼: 대화창·AI 기능·녹음 전사·데이터셋 검증 미리보기)
export const READ_POSTS = new Set(['chat', 'assist', 'transcribe', 'datasets-validate'])
// 화면 경로로만 바뀌는 저장물 — 일반 POST/PUT 로 덮어쓰면 「검증 통과한 것만 적용」 보장이 깨진다
export const PROTECTED_STORE = new Set(['dataset-current', 'run-result'])
const NAME_RE = /^[a-z0-9-]+$/
const DOMAIN_SEED_RE = /^(decisions|schedule|review|settings)-([a-z0-9]+)$/

export class HttpError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) { super(message); this.status = status }
}

/** @param {import('node:http').ServerResponse} res */
export function sendJson(res, code, obj) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(obj))
}

/** @param {import('node:http').IncomingMessage} req */
export function readBody(req, max = MAX_BODY) {
  return new Promise((ok, fail) => {
    /** @type {Buffer[]} */
    const chunks = []
    let size = 0
    let over = false
    req.on('data', (c) => {
      size += c.length
      if (over) return
      if (size > max) { over = true; chunks.length = 0; fail(Object.assign(new Error('too large'), { code: 413 })); return }
      chunks.push(c)
    })
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')))
    req.on('error', fail)
  })
}

// 본문을 JSON 으로 — 상한 초과 413, 못 읽으면 400, JSON 아니면 400 (HttpError 로 던지고 middleware 가 응답한다)
export async function readJsonBody(req, max = MAX_BODY, emptyOk = false) {
  let text
  try { text = await readBody(req, max) } catch (e) {
    if (e && e.code === 413) throw new HttpError(413, `본문이 ${Math.round(max / 1024 / 1024)}MB 를 넘습니다.`)
    throw new HttpError(400, '본문을 읽지 못했습니다.')
  }
  if (!text && emptyOk) return {}
  try { return JSON.parse(text) } catch { throw new HttpError(400, 'JSON 형식이 아닙니다.') }
}

const SESSION_COOKIE = 'sk_session' // auth.mjs 의 COOKIE 와 같은 이름
/**
 * @param {{
 *   root: string,
 *   auth: { enabled: boolean, me: Function, login: Function, logout: Function, userFrom: Function, canWrite: Function },
 *   assist: Function, chat: Function, transcribe: Function,
 *   datasets: { list: Function, validate: Function, apply: Function },
 *   run: { start: Function, status: Function },
 *   maxBody?: number, maxAudioBody?: number, fs?: typeof fs
 * }} opts
 */
export function createApi(opts) {
  const { root, auth, assist, chat, transcribe, datasets, run } = opts
  const maxBody = opts.maxBody ?? MAX_BODY
  const maxAudioBody = opts.maxAudioBody ?? MAX_AUDIO_BODY
  const io = opts.fs ?? fs
  const DATA = path.join(root, 'data')
  const STORE = path.join(DATA, 'store')

  // 세션 자격 = 쿠키 + (있으면) Authorization: Bearer 토큰. 토큰을 쿠키 꼴로 뒤에 붙여 넘긴다 — 뒤에 온 값이 이기므로 쿠키가 막힌 환경(다른 사이트의 틀 안)에서도 같은 검사를 탄다.
  const cred = (req) => {
    const m = /^Bearer\s+([A-Za-z0-9._-]{8,200})$/.exec(String(req.headers.authorization ?? ''))
    return m ? `${req.headers.cookie ? `${req.headers.cookie}; ` : ''}${SESSION_COOKIE}=${m[1]}` : req.headers.cookie
  }
  async function handle(req, res, next) {
    const url = req.url ?? ''
    if (!url.startsWith('/api/')) return next()
    let name
    try { name = decodeURIComponent(url.slice(5).split('?')[0]) } catch { return sendJson(res, 400, { error: '잘못된 주소' }) }
    if (!NAME_RE.test(name)) return sendJson(res, 400, { error: '이름은 소문자·숫자·하이픈만 쓸 수 있습니다.' })
    if (name === 'health') return sendJson(res, 200, { ok: true, auth: auth.enabled, ai: !!opts.ai?.enabled, ...(opts.ai?.enabled && opts.ai.model ? { aiModel: opts.ai.model } : {}) })
    if (name.startsWith('auth-')) {
      let out
      if (name === 'auth-me' && req.method === 'GET') out = auth.me(cred(req))
      else if (name === 'auth-logout' && req.method === 'POST') out = auth.logout(cred(req))
      else if (name === 'auth-login' && req.method === 'POST') out = auth.login(await readJsonBody(req, maxBody))
      else return sendJson(res, 405, { error: 'auth-me 는 GET, auth-login·auth-logout 은 POST' })
      if (out.cookie) res.setHeader('Set-Cookie', out.cookie)
      return sendJson(res, out.status, out.json)
    }
    // 서버 측 권한 검사 — 버튼 숨김과 별개. 꺼져 있으면(AUTH_ON≠1) 기본 역할로 통과한다.
    const user = auth.userFrom(cred(req))
    if (!user) return sendJson(res, 401, { error: '로그인이 필요합니다.' })
    const writes = req.method === 'POST' || req.method === 'PUT'
    if (writes && !READ_POSTS.has(name) && !auth.canWrite(user)) return sendJson(res, 403, { error: '이 작업은 쓰기 권한이 있는 계정만 할 수 있습니다.' })
    if (name === 'datasets' || name === 'run-status') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: '허용 메서드: GET' })
      const out = name === 'datasets' ? datasets.list() : run.status()
      return sendJson(res, out.status, out.json)
    }
    if (name === 'datasets-validate' || name === 'datasets-apply' || name === 'run') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: '허용 메서드: POST' })
      const body = await readJsonBody(req, maxBody, true)
      const out = name === 'run' ? run.start(body) : name === 'datasets-apply' ? datasets.apply(body) : datasets.validate(body)
      return sendJson(res, out.status, out.json)
    }
    if (name === 'assist' || name === 'chat') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: '허용 메서드: POST' })
      const out = await (name === 'chat' ? chat : assist)(await readJsonBody(req, maxBody))
      return sendJson(res, out.status, out.json)
    }
    if (name === 'transcribe') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: '허용 메서드: POST' })
      const out = await transcribe(await readJsonBody(req, maxAudioBody))
      return sendJson(res, out.status, out.json)
    }
    // 저장물 — data/store/<이름>.json (쓰기) · 씨앗 data/<이름>.json (읽기)
    const stored = path.join(STORE, `${name}.json`)
    const seed = path.join(DATA, `${name}.json`)
    if (!stored.startsWith(STORE + path.sep) || !seed.startsWith(DATA + path.sep)) return sendJson(res, 400, { error: '잘못된 경로' })
    if (req.method === 'GET') {
      // decisions-<도메인> 은 처음엔 src/domain/<도메인>/decisions.json 을 씨앗으로 쓴다. 일정 확정(schedule-)·문서 검토(review-)·기준값(settings-)도 같은 방식 — 씨앗이 비어 있어도 있어야 브라우저에 404 가 안 뜬다.
      const dm = DOMAIN_SEED_RE.exec(name)
      const domSeed = dm ? path.join(root, 'src', 'domain', dm[2], `${dm[1]}.json`) : ''
      const file = io.existsSync(stored) ? stored : io.existsSync(seed) ? seed : domSeed && io.existsSync(domSeed) ? domSeed : null
      if (!file && name.startsWith('import-')) return sendJson(res, 200, {}) // CSV 올리기 저장물 — 올린 적 없으면 빈 값
      if (!file) return sendJson(res, 404, { error: `/api/${name} 데이터가 없습니다.` })
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      return res.end(io.readFileSync(file))
    }
    if (writes) {
      if (PROTECTED_STORE.has(name)) return sendJson(res, 405, { error: `${name} 은 화면 경로(datasets-apply·run)로만 바뀝니다.` })
      const parsed = await readJsonBody(req, maxBody)
      io.mkdirSync(STORE, { recursive: true })
      const tmp = `${stored}.tmp`
      io.writeFileSync(tmp, JSON.stringify(parsed))
      io.renameSync(tmp, stored)
      return sendJson(res, 200, { ok: true })
    }
    return sendJson(res, 405, { error: '허용 메서드: GET, POST, PUT' })
  }

  // 모든 /api 요청을 감싼다 — 예외가 나도 응답 없이 멈추거나 프로세스가 죽지 않게 500(또는 HttpError 의 상태)으로 돌려준다
  async function middleware(req, res, next) {
    try { await handle(req, res, next) } catch (e) {
      if (res.headersSent) return
      const he = e instanceof HttpError ? e : null
      sendJson(res, he ? he.status : 500, { error: he ? he.message : `서버 오류: ${(e && e.message) || String(e)}` })
    }
  }

  return { handle, middleware }
}
