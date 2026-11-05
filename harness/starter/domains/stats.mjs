// stats.mjs — 통계·눈금 순수 함수 (DOM 없음, Node·브라우저 공용). 관리도(W14)·분포(W15)·추세 차트 눈금이 쓴다.

export const mean = (xs) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null);
// 표본 표준편차(n-1). 값이 1개 이하이면 0
export function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((t, x) => t + (x - m) ** 2, 0) / (xs.length - 1));
}
// 선형 보간 백분위수: 정렬한 값에서 위치 (n-1)·p 를 두 이웃 사이로 계산. p 는 0~1. 값이 없으면 null
export function percentile(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.min(s.length - 1, lo + 1);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// 보기 좋은 간격: 1·2·5 × 10^k 중 raw 이상인 가장 작은 값
export function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
const clean = (x) => Math.round(x * 1e9) / 1e9;

// 세로축 눈금: 간격이 모두 같은 눈금과 그에 맞는 범위. count 는 눈금 수의 목표(대략)
export function niceTicks(lo, hi, count = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1, ticks: [0, 1], step: 1 };
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const step = niceStep((hi - lo) / Math.max(1, count - 1));
  const a = clean(Math.floor(lo / step + 1e-9) * step);
  const b = clean(Math.ceil(hi / step - 1e-9) * step);
  const ticks = [];
  for (let v = a; v <= b + step / 2; v += step) ticks.push(clean(v));
  return { lo: a, hi: b, ticks, step };
}

// 히스토그램 구간: Sturges 개수(5~12) → 보기 좋은 너비로 맞춰 구간 가장자리를 너비의 배수에 둔다. 마지막 구간만 오른쪽 끝 포함
export function makeBins(values, want) {
  const xs = values.filter(Number.isFinite);
  if (!xs.length) return { edges: [], counts: [], step: 0 };
  const n = xs.length;
  const k = want || Math.min(12, Math.max(5, Math.ceil(Math.log2(n) + 1)));
  const min = Math.min(...xs), max = Math.max(...xs);
  const step = niceStep((max - min) / k || 1);
  const start = clean(Math.floor(min / step + 1e-9) * step);
  let end = clean(Math.ceil(max / step - 1e-9) * step);
  if (end <= start) end = clean(start + step);
  const edges = [];
  for (let v = start; v <= end + step / 2; v += step) edges.push(clean(v));
  const counts = binCounts(xs, edges);
  return { edges, counts, step };
}
export function binCounts(xs, edges) {
  const counts = Array(edges.length - 1).fill(0);
  for (const x of xs) {
    let i = counts.length - 1;
    for (let j = 0; j < counts.length; j++) if (x < edges[j + 1]) { i = j; break; }
    if (x >= edges[0]) counts[i]++;
  }
  return counts;
}

// 관리도: 점 값 ys(null 가능), 기준 = fixed({center,ucl,lcl}) 또는 평균±k·σ. floor0 이면 아래 한계는 0 밑으로 내리지 않는다
export function controlLimits(ys, k = 2, fixed = null, floor0 = false) {
  const v = ys.filter(Number.isFinite);
  if (fixed && Number.isFinite(fixed.center)) return { center: fixed.center, ucl: fixed.ucl, lcl: fixed.lcl, sigma: null, mode: 'fixed' };
  const center = mean(v);
  const sigma = stdev(v);
  if (center === null) return { center: null, ucl: null, lcl: null, sigma: null, mode: 'k' };
  const lcl = center - k * sigma;
  return { center, ucl: center + k * sigma, lcl: floor0 ? Math.max(0, lcl) : lcl, sigma, mode: 'k' };
}
