// power/gen.mjs — 전력 사용량 이상 가상 데이터 (고정 시드, 의존성 0). 실행: node starter/domains/power/gen.mjs → sample.json · decisions.json
// 숨은 조건 ① 정기 정전 시간대(B동·C동 일요일 02:00~04:00)는 이상으로 보지 않는다(status=정전 구간)
//          ② 기준 = 같은 요일·같은 시각의 과거 4주 평균(생성기 안에서 4주치를 따로 만들어 평균만 base 열에 싣는다).
// 15분 간격이라 행이 빨리 늘어 계량기 4개 × 5일(10-24~10-28 08:45)만 싣는다(1,680행).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(20261030);
const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) * Math.SQRT2; };
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dowOf = (d) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7; // 월=0
const pad = (n, w = 2) => String(n).padStart(w, '0');
const r1 = (v) => Math.round(v * 10) / 10;

const FIRST = '2026-10-24', LAST = '2026-10-28', LAST_SLOT = 35; // 10-28 은 08:45 까지(09:00 기준)
const METERS = [
  { id: 'MT-A1', bldg: 'A동', peak: 118, night: 0.55 }, // 팹 공조
  { id: 'MT-A2', bldg: 'A동', peak: 74, night: 0.7 }, // 유틸리티
  { id: 'MT-B1', bldg: 'B동', peak: 52, night: 0.35 }, // 사무·시험
  { id: 'MT-C1', bldg: 'C동', peak: 90, night: 0.6 }, // 패키징
];
const outage = (m, dow, slot) => (m.bldg === 'B동' || m.bldg === 'C동') && dow === 6 && slot >= 8 && slot < 16; // 일요일 02:00~04:00
// 부하 곡선: 낮에 높고 밤에 낮다. 주말은 사무동만 크게 줄어든다
function profile(m, dow, slot) {
  const h = slot / 4;
  const day = 0.5 + 0.5 * Math.sin(((h - 6) / 24) * 2 * Math.PI * 1.0 + 0.0);
  const weekend = dow >= 5 ? (m.bldg === 'B동' ? 0.45 : 0.85) : 1;
  return m.peak * (m.night + (1 - m.night) * Math.max(0, day)) * weekend / 4; // kWh / 15분
}
// ② 기준: 같은 요일·시각의 과거 4주 값을 따로 만들어 평균
function baseOf(m, dow, slot) {
  let s = 0;
  for (let w = 0; w < 4; w++) s += profile(m, dow, slot) * (1 + gauss() * 0.04);
  return s / 4;
}

const rows = [];
for (let d = FIRST; d <= LAST; d = addDays(d, 1)) {
  const dow = dowOf(d);
  const lastSlot = d === LAST ? LAST_SLOT : 95;
  for (const m of METERS) {
    for (let slot = 0; slot <= lastSlot; slot++) {
      const base = baseOf(m, dow, slot);
      let k = profile(m, dow, slot) * (1 + gauss() * 0.05);
      const out = outage(m, dow, slot);
      if (out) k = base * 0.02 * rnd(); // 정기 정전 — 사용량이 거의 0
      // 숨은 이상 ① MT-A2: 10-26 13:00~15:00 부하 급증
      if (m.id === 'MT-A2' && d === '2026-10-26' && slot >= 52 && slot < 60) k *= 1.55 + rnd() * 0.15;
      // 숨은 이상 ② MT-C1: 10-27 20:00 부터 야간에도 낮아지지 않는다(누수성 상시 부하)
      if (m.id === 'MT-C1' && ((d === '2026-10-27' && slot >= 80) || d === '2026-10-28')) k = Math.max(k, profile(m, dow, 56) * 0.95 * (1 + gauss() * 0.03));
      // 오탐 후보: 짧은 단일 구간 튐(계측 노이즈)
      if (!out && rnd() < 0.006) k *= 1.5 + rnd() * 0.3;
      const hh = Math.floor(slot / 4), mm = (slot % 4) * 15;
      rows.push({ ts: `${d}T${pad(hh)}:${pad(mm)}:00`, bldg: m.bldg, meter: m.id, kwh: r1(k), base: r1(base), out, d, slot });
    }
  }
}
// 판정: 기준 대비 비율 — 정전 구간은 제외, 1.3배 넘거나 0.6배 미만이면 이상
for (const r of rows) {
  r.ratio = Math.round((r.kwh / r.base) * 100);
  r.status = r.out ? '정전 구간' : r.ratio >= 130 || r.ratio < 60 ? '이상' : '정상';
}
// 이상 구간: 같은 계량기에서 이어지는 이상 15분 칸을 한 구간(run)으로 묶는다. 1~2칸짜리는 오탐 가능성 높음.
let runNo = 0;
for (const m of METERS) {
  const mine = rows.filter((r) => r.meter === m.id);
  for (let i = 0; i < mine.length;) {
    if (mine[i].status !== '이상') { i++; continue; }
    let j = i; while (j + 1 < mine.length && mine[j + 1].status === '이상') j++;
    runNo++;
    for (let k = i; k <= j; k++) { mine[k].run = `R-${pad(runNo)}`; mine[k].run_len = j - i + 1; mine[k].fp = j - i + 1 <= 2 ? '높음' : '낮음'; }
    i = j + 1;
  }
}
const out = rows.map((r, i) => ({ ts: r.ts, bldg: r.bldg, meter: r.meter, kwh: r.kwh, base: r.base, ratio: r.ratio, status: r.status, run: r.run || '', run_len: r.run_len || 0, fp: r.fp || '–', row_id: `${r.meter}-${r.ts.slice(5, 16).replace(/[-:T]/g, '')}` }));
out.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.meter < b.meter ? -1 : 1));

const here = path.dirname(fileURLToPath(import.meta.url));
const dump = (name, arr, wrap) => fs.writeFileSync(path.join(here, name), wrap ? `{\n"rows": [\n${arr.map((r) => JSON.stringify(r)).join(',\n')}\n]\n}\n` : `[\n${arr.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`);
dump('sample.json', out, true);
const longRuns = [...new Set(out.filter((r) => r.fp === '낮음').map((r) => r.run))].slice(-3).reverse();
dump('decisions.json', longRuns.map((run, i) => { const r = out.find((x) => x.run === run); return { id: `D-${pad(i + 1, 4)}`, ref: r.row_id, decision: i === 1 ? '오탐 처리' : '현장 점검', reason: i === 1 ? '계측기 교정 직후 값으로 확인' : `${r.meter} ${run} 구간 기준 대비 ${r.ratio}%, 연속 ${r.run_len}칸`, who: '시설팀', ts: `2026-10-28T08:${pad(40 - i * 4)}:00` }; }), false);
const cnt = {};
for (const r of out) { const k = `${r.meter} ${r.status}`; cnt[k] = (cnt[k] || 0) + 1; }
console.log('power rows', out.length, JSON.stringify(cnt), 'runs', runNo, 'fp높음 runs', new Set(out.filter((r) => r.fp === '높음').map((r) => r.run)).size);
