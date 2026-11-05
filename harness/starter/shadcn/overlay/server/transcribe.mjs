// transcribe.mjs — /api/transcribe 의 서버 쪽: 녹음 파일(base64 JSON)을 글로 바꾼다.
// OPENAI_API_KEY 가 있으면 OpenAI 전사 API(언어 ko)를 부르고, 없거나 실패(시간 초과·HTTP 오류·빈 응답)하면 녹음 길이에 따라 정해진 예시 문장 「모의 전사」로 돌아간다.
// 키는 이 서버 프로세스의 환경변수에서만 읽는다 — 브라우저로 보내지 않고, 응답·로그·오류 문구에 넣지 않는다.
// 요청: {audio: base64 글자, mime: 'audio/webm' | 'audio/ogg' | 'audio/mp4' | 'audio/mpeg' | 'audio/wav' | 'audio/x-m4a'}   응답: {text, source: 'openai'|'mock', mock: boolean, model?, reason?}
// reason(모의일 때만) = no-key | timeout | http-<코드> | network | empty
export const DEFAULT_STT_MODEL = 'whisper-1';
export const TIMEOUT_MS = 20000;
// 주소 = env.OPENAI_BASE_URL(과제 환경이 주는 API 주소, 끝 / 정리; 없으면 OpenAI 기본) + 경로. 키·주소는 응답·로그에 싣지 않는다.
const DEFAULT_BASE = 'https://api.openai.com/v1';
const apiUrl = (env, path) => `${String(env.OPENAI_BASE_URL ?? '').trim().replace(/\/+$/, '') || DEFAULT_BASE}${path}`;
export const STT_URL = `${DEFAULT_BASE}/audio/transcriptions`;
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a' };
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

// 모의 전사 — 녹음 크기(바이트)만으로 정해지는 고정 문장 (같은 녹음이면 같은 글)
const S1 = '네, 먼저 오늘 경기에 대해 간단히 말씀드리겠습니다.';
const S2 = '네, 오늘 경기에서는 초반 운영이 가장 중요했다고 생각합니다. 팀원들과 미리 맞춘 계획대로 움직였고, 결과도 만족스럽습니다.';
const S3 = `${S2} 중간에 흐름이 넘어갈 뻔한 순간이 있었지만 서로 목소리를 맞추며 다시 가져왔습니다. 다음 경기도 같은 마음으로 준비하겠습니다.`;
export function mockTranscript(bytes) {
  return bytes < 30000 ? S1 : bytes < 200000 ? S2 : S3;
}

// 본문 검사 — 모양이 틀리면 {error}
export function parseBody(body) {
  if (!body || typeof body !== 'object') return { error: '본문이 JSON 객체가 아닙니다.' };
  const { audio, mime } = body;
  if (typeof audio !== 'string' || !audio || !B64.test(audio) || audio.length % 4 === 1) return { error: 'audio 는 base64 글자여야 합니다.' };
  const type = typeof mime === 'string' ? mime.split(';')[0].trim().toLowerCase() : '';
  if (!EXT[type]) return { error: '오디오 형식(webm · ogg · mp4 · mp3 · wav · m4a)만 보낼 수 있습니다.' };
  const bytes = Math.floor((audio.length * 3) / 4) - (audio.endsWith('==') ? 2 : audio.endsWith('=') ? 1 : 0);
  if (bytes < 1) return { error: '오디오가 비어 있습니다.' };
  if (bytes > MAX_AUDIO_BYTES) return { error: `녹음이 너무 큽니다(최대 ${MAX_AUDIO_BYTES / 1024 / 1024}MB).` };
  return { value: { audio, type, ext: EXT[type], bytes } };
}

// env: 환경변수 객체(기본 process.env), fetchImpl: fetch 대체(테스트용), timeoutMs: 호출 제한 시간
export function createTranscribe({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  return async function transcribe(body) {
    const parsed = parseBody(body);
    if (parsed.error) return { status: 400, json: { error: parsed.error } };
    const v = parsed.value;
    const mock = (reason) => ({ status: 200, json: { text: mockTranscript(v.bytes), source: 'mock', mock: true, reason } });
    const key = String(env.OPENAI_API_KEY ?? '').trim();
    if (!key) return mock('no-key');
    const model = String(env.OPENAI_STT_MODEL ?? '').trim() || DEFAULT_STT_MODEL;
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(v.audio, 'base64')], { type: v.type }), `audio.${v.ext}`);
    form.append('model', model);
    form.append('language', 'ko');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(apiUrl(env, '/audio/transcriptions'), { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: ctl.signal });
      if (!res.ok) return mock(`http-${res.status}`);
      const data = await res.json();
      const text = String(data?.text ?? '').trim();
      if (!text) return mock('empty');
      return { status: 200, json: { text, source: 'openai', mock: false, model } };
    } catch (e) {
      return mock(e?.name === 'AbortError' ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  };
}
