// 실행: node --test starter/domains/docs.test.mjs
// 근거 문서 검색(docs.mjs) — 문단 쪼개기, 한국어 낱말+2-gram BM25 선택, 근거 표시 읽기, 실제 견본 문서.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildParagraphs, citedRefs, docsEnabled, firstSentence, loadDomainDocs, MIN_COVERAGE, passagesForRequest, selectPassages } from './docs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = (name) => {
  const dir = path.join(here, name, 'docs');
  return Object.fromEntries(fs.readdirSync(dir).filter((f) => /\.(md|txt)$/.test(f)).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
};

const SMALL = {
  'a.md': '# 보안 지침\n\n> 가상 문서\n\n## 1. 출입\n\n사무실 출입증은 분실하면 즉시 보안팀에 신고한다. 재발급에는 이틀이 걸린다.\n\n## 2. 장비\n\n노트북은 퇴근할 때 잠금장치에 걸어 둔다.',
  'memo.txt': '휴가 신청은 사흘 전까지 한다.\n\n연차는 반차 단위로 쓸 수 있다.',
};

test('설정: chat.docs 가 켜져 있고 chat 이 꺼지지 않았을 때만', () => {
  assert.equal(docsEnabled({ chat: { on: true, docs: true } }), true);
  assert.equal(docsEnabled({ chat: { docs: true } }), true);
  assert.equal(docsEnabled({ chat: { on: false, docs: true } }), false);
  assert.equal(docsEnabled({ chat: { on: true } }), false);
  assert.equal(docsEnabled({}), false);
});

test('문단 쪼개기: 제목=첫 # 줄(없으면 파일명), 인용문(>) 건너뜀, 소제목은 문단에 붙고 번호 §n 은 1부터 문서별로', () => {
  const ps = buildParagraphs(SMALL);
  assert.deepEqual(ps.map((p) => [p.doc, p.n]), [['보안 지침', 1], ['보안 지침', 2], ['memo', 1], ['memo', 2]]);
  assert.equal(ps[0].heading, '1. 출입');
  assert.equal(ps[0].text, '사무실 출입증은 분실하면 즉시 보안팀에 신고한다. 재발급에는 이틀이 걸린다.');
  assert.equal(ps[2].heading, '');
  assert.equal(ps[3].text, '연차는 반차 단위로 쓸 수 있다.');
});

test('문단 쪼개기: 너무 긴 문단은 문장 경계에서 800자 아래로 나뉜다', () => {
  const long = Array.from({ length: 60 }, (_, i) => `이것은 ${i}번째 문장입니다.`).join(' ');
  const ps = buildParagraphs({ 'x.txt': long });
  assert.ok(ps.length >= 2);
  for (const p of ps) assert.ok(p.text.length <= 800, p.text.length);
  assert.equal(ps.map((p) => p.text).join(' '), long);
});

test('선택: 조사가 달라도(출입증을/출입증은) 맞는 문단이 1위, 점수 내림차순, k 개까지', () => {
  const ps = buildParagraphs(SMALL);
  const r = selectPassages(ps, '출입증을 분실하면 어떻게 하나요?');
  assert.equal(r[0].doc, '보안 지침');
  assert.equal(r[0].n, 1);
  assert.ok(r[0].coverage >= MIN_COVERAGE);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
  const r2 = selectPassages(ps, '휴가 신청은 언제까지 해요', { k: 1 });
  assert.equal(r2.length, 1);
  assert.equal(r2[0].doc, 'memo');
  assert.equal(r2[0].n, 1);
});

test('선택: 문서에 없는 질문은 빈 배열 · 빈 질문·빈 문서도 안전', () => {
  const ps = buildParagraphs(SMALL);
  assert.deepEqual(selectPassages(ps, '오늘 점심 메뉴 추천해줘'), []);
  assert.deepEqual(selectPassages(ps, '   '), []);
  assert.deepEqual(selectPassages([], '출입증'), []);
});

test('첫 문장: 마침표 기준 · 마침표가 없으면 전체', () => {
  assert.equal(firstSentence('가나다 라마바. 사아자.'), '가나다 라마바.');
  assert.equal(firstSentence('마침표 없는 글'), '마침표 없는 글');
});

test('서버로 보낼 근거: doc·n·text 만, 소제목은 본문 앞에', () => {
  const ps = buildParagraphs(SMALL);
  const sel = selectPassages(ps, '출입증을 분실하면');
  assert.deepEqual(passagesForRequest(sel).slice(0, 1), [{ doc: '보안 지침', n: 1, text: '1. 출입\n사무실 출입증은 분실하면 즉시 보안팀에 신고한다. 재발급에는 이틀이 걸린다.' }]);
});

test('근거 표시 읽기: 답 안의 [문서명 §n] 만 골라 낸다(§1 이 §12 로 오인되지 않는다)', () => {
  const passages = [{ doc: '보안 지침', n: 1, text: 'a' }, { doc: '보안 지침', n: 12, text: 'b' }, { doc: 'memo', n: 2, text: 'c' }];
  assert.deepEqual(citedRefs('즉시 신고합니다 [보안 지침 §12].', passages).map((p) => p.n), [12]);
  assert.deepEqual(citedRefs('둘 다 [보안 지침 §1][memo §2]', passages).map((p) => `${p.doc}${p.n}`), ['보안 지침1', 'memo2']);
  assert.deepEqual(citedRefs('근거 표시 없음', passages), []);
});

test('견본 interview: 개인정보는 어떻게 처리해요? → 개인정보 처리 기준 §3 이 1위', () => {
  const ps = buildParagraphs(files('interview'));
  assert.deepEqual([...new Set(ps.map((p) => p.doc))].sort(), ['개인정보 처리 기준', '답변 평가 기준', '면접 질문 작성 지침']);
  const r = selectPassages(ps, '개인정보는 어떻게 처리해요?');
  assert.ok(r.length >= 1 && r.length <= 3);
  assert.equal(`${r[0].doc} §${r[0].n}`, '개인정보 처리 기준 §3');
  assert.match(firstSentence(r[0].text), /^개인정보는 연습 담당 권한이 있는 사람만 열람할 수 있으며/);
});

test('견본 interview: 보관 기간 · 질문 작성 · 위험 키워드 질문이 각 문서의 맞는 문단으로', () => {
  const ps = buildParagraphs(files('interview'));
  const top = (q) => { const r = selectPassages(ps, q); return r.length ? `${r[0].doc} §${r[0].n}` : null; };
  assert.equal(top('녹음 파일은 며칠 보관하나요?'), '개인정보 처리 기준 §2');
  assert.equal(top('심화 질문에는 위험 키워드를 꼭 지정해야 하나요?'), '면접 질문 작성 지침 §3');
  assert.equal(top('위험 키워드가 두 개 나오면 어떻게 분류해?'), '답변 평가 기준 §2');
});

test('견본 interview: 문서에 없는 질문은 못 찾는다', () => {
  const ps = buildParagraphs(files('interview'));
  assert.deepEqual(selectPassages(ps, '오늘 점심 메뉴 추천해줘'), []);
  assert.deepEqual(selectPassages(ps, '배송 지연 보상금은 얼마예요?'), []);
});

test('견본 alarm: 긴급 알람 대응 시한 질문 → 알람 대응 표준 §2', () => {
  const ps = buildParagraphs(files('alarm'));
  const r = selectPassages(ps, '긴급 알람은 몇 분 안에 확인해야 해?');
  assert.equal(`${r[0].doc} §${r[0].n}`, '알람 대응 표준 §2');
});

test('모든 견본 문서 첫머리에 가상임이 적혀 있다 · 도메인 설정 chat.docs 는 interview·alarm 만', () => {
  for (const n of ['interview', 'alarm']) for (const t of Object.values(files(n))) assert.match(t.split('\n').slice(0, 3).join('\n'), /가상 문서/, n);
  for (const n of fs.readdirSync(here).filter((f) => fs.existsSync(path.join(here, f, 'domain.json')))) {
    const d = JSON.parse(fs.readFileSync(path.join(here, n, 'domain.json'), 'utf8'));
    assert.equal(docsEnabled(d), ['interview', 'alarm'].includes(n), n);
  }
});

test('loadDomainDocs: 글로브 결과({경로: 본문})에서 해당 도메인 폴더 파일만', () => {
  const g = { '../domain/interview/docs/a.md': 'A', '../domain/alarm/docs/b.md': 'B', '../domain/interview/docs/c.txt': 'C', '../domain/interview/docs/d.json': 'D' };
  assert.deepEqual(loadDomainDocs(g, 'interview'), { 'a.md': 'A', 'c.txt': 'C' });
});
