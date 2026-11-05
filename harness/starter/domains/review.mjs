// review.mjs — 문서 검토 페이지(#/review)의 계산: 신뢰도·불확실 판정, 분류 태그 편집, 저장 기록 합치기. 순수 함수 (DOM 없음).
// 설정(domain.json 의 review): listCols 왼쪽 목록 열 · bodyCol 본문 열 · tagsCol 분류(여러 개) 열 · confCol 신뢰도 열 · statusCol 상태 열 · doneValue 확정 상태값
//   uncertainBelow 이 값 미만이면 불확실 · taxonomy 고를 수 있는 분류 목록 · metaCols 본문 위에 보일 열 · reasonLabel 판정 사유 글자
// 저장 기록: {[id]: {tags:[…], reason, status, ts, who}} — 원 데이터(rows)는 건드리지 않고 화면에서 위에 얹는다.
import { idOf } from './core.mjs';

export const isUncertain = (cfg, row) => Number(row[cfg.confCol]) < cfg.uncertainBelow && row[cfg.statusCol] !== cfg.doneValue;
export const tagsOf = (cfg, row) => (Array.isArray(row[cfg.tagsCol]) ? row[cfg.tagsCol] : []);

// 저장 기록을 얹은 행 목록
export function mergedRows(ctx, saved = {}) {
  const cfg = ctx.d.review;
  return ctx.rows.map((r) => {
    const e = saved[String(idOf(ctx, r))];
    return e ? { ...r, [cfg.tagsCol]: e.tags, [cfg.statusCol]: e.status } : r;
  });
}

// filter: all · uncertain(불확실 큐) · done(확정) · todo(확정 아님). minConf: 이 값 이상만(없으면 전부). 신뢰도 낮은 순으로 정렬
export function reviewList(ctx, saved, { filter = 'all', minConf = null, q = '' } = {}) {
  const cfg = ctx.d.review;
  const needle = String(q).trim().toLowerCase();
  const text = (r) => `${idOf(ctx, r)} ${ctx.d.cols.filter((c) => c.type === 'text').map((c) => r[c.key]).join(' ')} ${tagsOf(cfg, r).join(' ')}`.toLowerCase();
  return mergedRows(ctx, saved)
    .filter((r) => (filter === 'uncertain' ? isUncertain(cfg, r) : filter === 'done' ? r[cfg.statusCol] === cfg.doneValue : filter === 'todo' ? r[cfg.statusCol] !== cfg.doneValue : true))
    .filter((r) => (minConf === null ? true : Number(r[cfg.confCol]) >= minConf))
    .filter((r) => !needle || text(r).includes(needle))
    .sort((a, b) => Number(a[cfg.confCol]) - Number(b[cfg.confCol]) || (String(idOf(ctx, a)) < String(idOf(ctx, b)) ? -1 : 1));
}
export const reviewCounts = (ctx, saved) => {
  const cfg = ctx.d.review, rows = mergedRows(ctx, saved);
  return { all: rows.length, uncertain: rows.filter((r) => isUncertain(cfg, r)).length, done: rows.filter((r) => r[cfg.statusCol] === cfg.doneValue).length };
};

export const addTag = (tags, tag) => (tags.includes(tag) ? tags : [...tags, tag]);
export const removeTag = (tags, tag) => tags.filter((t) => t !== tag);
// 고를 수 있는 분류(이미 붙은 것 제외)
export const tagChoices = (cfg, tags) => cfg.taxonomy.filter((t) => !tags.includes(t));

export function validateReview(cfg, tags, reason) {
  const e = {};
  if (!tags.length) e.tags = '분류를 하나 이상 고르세요.';
  if (!String(reason || '').trim()) e.reason = cfg.emptyReason || '판정 사유를 입력하세요.';
  return e;
}
export const makeRecord = (cfg, tags, reason, ts) => ({ tags, reason: String(reason).trim(), status: cfg.doneValue, ts, who: cfg.who || '' });
