// assist.mjs — /api/assist 의 서버 쪽: 개선 제안 한 문단을 만든다. 판정(위험 표현 있음/없음)은 여기서 하지 않는다 — 화면의 규칙 코드가 이미 정했다.
// OPENAI_API_KEY 가 있으면 OpenAI Chat Completions 를 부르고, 없거나 실패(시간 초과·HTTP 오류·빈 응답)하면 고정 템플릿 「모의 응답」으로 돌아간다.
// 키는 이 서버 프로세스의 환경변수에서만 읽는다 — 브라우저로 보내지 않고, 응답·로그·오류 문구에 넣지 않는다.
// 응답: {suggestion, source: 'openai'|'mock', model?, reason?}   reason(모의일 때만) = no-key | timeout | http-<코드> | network | empty
export const DEFAULT_MODEL = 'gpt-4o-mini';
export const TIMEOUT_MS = 8000;
// 주소 = env.OPENAI_BASE_URL(과제 환경이 주는 API 주소, 끝 / 정리; 없으면 OpenAI 기본) + 경로. 키·주소는 응답·로그에 싣지 않는다.
const DEFAULT_BASE = 'https://api.openai.com/v1';
const apiUrl = (env, path) => `${String(env.OPENAI_BASE_URL ?? '').trim().replace(/\/+$/, '') || DEFAULT_BASE}${path}`;
export const OPENAI_URL = `${DEFAULT_BASE}/chat/completions`;
const MAX_ANSWER = 4000, MAX_QUESTION = 500, MAX_TERMS = 20;
const CODES = ['risk', 'safe', 'short'];

// 모의 응답 — 판정 코드와 걸린 키워드만으로 정해지는 고정 문장 (같은 입력이면 같은 글)
export function mockSuggestion({ code, terms = [], minChars = 30 }) {
  if (code === 'risk') {
    const list = terms.slice(0, 3).map((t) => `「${t}」`).join(', ');
    return `${list} 같은 표현은 단정하거나 부정적으로 들릴 수 있습니다. 상황, 내가 한 행동, 결과 순서로 사실과 근거를 한 문장씩 적어 다시 말해 보세요.`;
  }
  if (code === 'short') return `답변이 짧습니다. 상황, 내가 한 행동, 결과를 각각 한 문장씩 더해 ${minChars}자 이상으로 늘려 보세요.`;
  return '위험으로 정한 표현은 없습니다. 결론을 먼저 말하고, 구체적인 사례와 숫자를 하나 덧붙이면 더 설득력이 생깁니다.';
}

// 본문 검사 — 모양이 틀리면 {error}
export function parseBody(body) {
  if (!body || typeof body !== 'object') return { error: '본문이 JSON 객체가 아닙니다.' };
  const { question, answer, code, terms, sentences, minChars } = body;
  if (typeof answer !== 'string' || typeof question !== 'string') return { error: 'question, answer 는 글자여야 합니다.' };
  if (!CODES.includes(code)) return { error: 'code 는 risk · safe · short 중 하나여야 합니다.' };
  if (answer.length > MAX_ANSWER || question.length > MAX_QUESTION) return { error: '글이 너무 깁니다.' };
  const list = (x) => (Array.isArray(x) ? x.filter((t) => typeof t === 'string').slice(0, MAX_TERMS).map((t) => t.slice(0, 200)) : []);
  return { value: { question, answer, code, terms: list(terms), sentences: list(sentences), minChars: Number.isFinite(minChars) ? minChars : 30 } };
}

function prompt(v) {
  return [
    { role: 'system', content: '너는 인터뷰 답변을 코칭하는 보조자다. 판정(위험 표현 있음/없음/답변 부족)은 이미 규칙으로 정해졌으니 바꾸거나 다시 판정하지 말고, 답변을 더 나아지게 하는 제안만 한국어 두세 문장으로 쓴다. 인사말·목록·이모지 없이 문장만.' },
    { role: 'user', content: `질문: ${v.question}\n답변: ${v.answer}\n판정 코드: ${v.code}\n걸린 표현: ${v.terms.join(', ') || '없음'}\n문제로 지적된 문장: ${v.sentences.join(' / ') || '없음'}` },
  ];
}

// env: 환경변수 객체(기본 process.env), fetchImpl: fetch 대체(테스트용), timeoutMs: 호출 제한 시간
export function createAssist({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  return async function assist(body) {
    const parsed = parseBody(body);
    if (parsed.error) return { status: 400, json: { error: parsed.error } };
    const v = parsed.value;
    const mock = (reason) => ({ status: 200, json: { suggestion: mockSuggestion(v), source: 'mock', reason } });
    const key = String(env.OPENAI_API_KEY ?? '').trim();
    if (!key) return mock('no-key');
    const model = String(env.OPENAI_MODEL ?? '').trim() || DEFAULT_MODEL;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(apiUrl(env, '/chat/completions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: prompt(v), temperature: 0.2, max_tokens: 300 }),
        signal: ctl.signal,
      });
      if (!res.ok) return mock(`http-${res.status}`);
      const data = await res.json();
      const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
      if (!text) return mock('empty');
      return { status: 200, json: { suggestion: text, source: 'openai', model } };
    } catch (e) {
      return mock(e?.name === 'AbortError' ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  };
}
