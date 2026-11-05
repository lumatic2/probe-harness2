// docs.mjs — 근거 문서 검색(화면과 서버가 같이 쓴다). DOM·파일 읽기 없음, Node 에서 테스트된다. 의존성 0.
// 흐름: 문서 글(files = {파일명: 본문}) → buildParagraphs → 문단 배열 → selectPassages(문단, 질문) → 질문과 가까운 상위 k 문단 → passagesForRequest 로 서버에 보낸다.
// - docsEnabled(d): domain.json 의 chat.docs 가 켜져 있고 chat 이 꺼지지 않았나
// - buildParagraphs(files): 문서를 문단으로 — {doc(문서명), n(문서 안 번호 §n, 1부터), heading(소제목), text}
//     문서명 = 첫 「# 」 줄(없으면 파일명). 「>」 로 시작하는 블록(가상 문서 안내)은 건너뛴다. 800자 넘는 문단은 문장 경계에서 나눈다.
// - selectPassages(문단, 질문, {k=3}): 한국어는 조사가 붙어 낱말이 달라지므로 「낱말 + 글자 2-gram」 토큰으로 BM25 점수를 매긴다.
//     coverage = 질문 토큰 중 이 문단에 있는 것의 idf 가중 비율(0~1). 문서에 아예 없는 질문(coverage < MIN_COVERAGE)은 빈 배열.
// - firstSentence · passagesForRequest · citedRefs · loadDomainDocs: 모의 응답·요청 만들기·근거 칩 만들기·번들 글로브 읽기
export const MIN_COVERAGE = 0.2;
export const MAX_PARAGRAPH = 800;
const K1 = 1.2, B = 0.75;
// 질문 말투(어떻게·하나요 같은 낱말)는 어느 문서에나 있어 점수를 흐리므로 토큰으로 세지 않는다
const STOP = new Set('어떻게 어떤 무엇 뭐 뭔가요 언제 어디 어디서 왜 얼마 몇 누가 누구 하나요 해요 해야 합니까 되나요 되는지 인가요 있나요 있어요 있는지 건가요 알려줘 알려주세요 말해줘 어때 어때요 이야 인지 하면 하는지 해줘'.split(' '));

export const docsEnabled = (d) => { const c = d?.chat; return !!c && typeof c === 'object' && c.on !== false && !!c.docs; };

const baseName = (file) => String(file).replace(/^.*\//, '').replace(/\.(md|txt)$/i, '');

function splitLong(text) {
  if (text.length <= MAX_PARAGRAPH) return [text];
  const out = [];
  let cur = '';
  for (const s of text.split(/(?<=[.!?。])\s+/)) {
    if (cur && cur.length + 1 + s.length > MAX_PARAGRAPH) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out.flatMap((t) => (t.length > MAX_PARAGRAPH ? t.match(new RegExp(`.{1,${MAX_PARAGRAPH}}`, 'gs')) : [t]));
}

export function buildParagraphs(files) {
  const out = [];
  for (const file of Object.keys(files).sort()) {
    const blocks = String(files[file]).replace(/\r\n?/g, '\n').split(/\n\s*\n/);
    let title = '';
    const body = [];
    let heading = '';
    for (const raw of blocks) {
      const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
      const text = [];
      for (const l of lines) {
        const h = /^(#{1,6})\s+(.*)$/.exec(l);
        if (h) { if (h[1].length === 1 && !title) title = h[2].trim(); else heading = h[2].trim(); } else if (!l.startsWith('>')) text.push(l);
      }
      if (text.length) body.push({ heading, text: text.join(' ') });
    }
    const doc = title || baseName(file);
    let n = 0;
    for (const b of body) for (const t of splitLong(b.text)) out.push({ doc, n: ++n, heading: b.heading, text: t });
  }
  return out;
}

function tokens(text) {
  const out = [];
  for (const w of String(text).toLowerCase().split(/[^0-9a-z가-힣]+/)) {
    if (!w || STOP.has(w)) continue;
    if (w.length === 1) { if (/[0-9a-z]/.test(w)) out.push(w); continue; }
    if (w.length >= 3) out.push(`w:${w}`);
    for (let i = 0; i + 2 <= w.length; i++) out.push(w.slice(i, i + 2));
  }
  return out;
}

export function selectPassages(paragraphs, query, { k = 3 } = {}) {
  const q = [...new Set(tokens(query))];
  if (!q.length || !paragraphs.length) return [];
  const docs = paragraphs.map((p) => { const t = tokens(`${p.heading} ${p.text}`); const tf = new Map(); for (const x of t) tf.set(x, (tf.get(x) ?? 0) + 1); return { p, tf, len: t.length }; });
  const N = docs.length, avg = docs.reduce((s, x) => s + x.len, 0) / N || 1;
  const idf = new Map(q.map((t) => { const df = docs.filter((x) => x.tf.has(t)).length; return [t, Math.log(1 + (N - df + 0.5) / (df + 0.5))]; }));
  const cov = q.filter((t) => !t.startsWith('w:')) // coverage 는 2-gram 만 센다(통낱말은 활용형이 달라 잘 안 맞는다)
  const total = cov.reduce((s, t) => s + idf.get(t), 0) || 1;
  const scored = docs.map(({ p, tf, len }, i) => {
    let score = 0, hit = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      score += idf.get(t) * (f * (K1 + 1)) / (f + K1 * (1 - B + B * len / avg));
      if (!t.startsWith('w:')) hit += idf.get(t);
    }
    return { ...p, score, coverage: hit / total, i };
  });
  return scored.filter((x) => x.score > 0 && x.coverage >= MIN_COVERAGE).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, k).map(({ i, ...x }) => x);
}

export function firstSentence(text) {
  const t = String(text).trim();
  const m = /^.*?[.!?。](?=\s|$)/s.exec(t);
  return m ? m[0] : t;
}

export const passagesForRequest = (selected) => selected.map((p) => ({ doc: p.doc, n: p.n, text: (p.heading ? `${p.heading}\n${p.text}` : p.text).slice(0, MAX_PARAGRAPH + 100) }));

// 답 안에 적힌 「문서명 §n」 을 보낸 근거 문단과 맞춰 낸다(§1 이 §12 로 오인되지 않게 숫자 뒤를 본다)
export const citedRefs = (reply, passages) => passages.filter((p) => new RegExp(`${String(p.doc).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} §${p.n}(?!\\d)`).test(String(reply)));

// 번들러 글로브 결과({'../domain/<이름>/docs/a.md': 본문}) → {파일명: 본문}
export function loadDomainDocs(globbed, name) {
  const out = {};
  for (const [p, text] of Object.entries(globbed ?? {})) {
    const m = /\/([^/]+)\/docs\/([^/]+\.(?:md|txt))$/i.exec(p);
    if (m && m[1] === name) out[m[2]] = String(text);
  }
  return out;
}
