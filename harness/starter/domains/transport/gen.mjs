// transport/gen.mjs — 웨이퍼 반송 대기시간 가상 데이터 (고정 시드, 의존성 0). 실행: node starter/domains/transport/gen.mjs → sample.json · decisions.json
// 숨은 조건 ① 대기시간 = 요청~시작(시작~완료는 이동 시간이라 대기에 넣지 않는다)  ② 점검 시간대(매일 02:00~03:00) 기록은 제외(status=점검 제외, 대기 40분대로 부풀어 있음).
// 병목 구간: ST-03→ST-07(12~16시에 몰림), ST-05→ST-02(하루 종일 길다).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(20261031);
const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) * Math.SQRT2; };
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const pad = (n, w = 2) => String(n).padStart(w, '0');
const r1 = (v) => Math.round(v * 10) / 10;
const stamp = (d, minutes) => { const m = Math.round(minutes); const day = addDays(d, Math.floor(m / 1440)); const mm = m % 1440; return `${day}T${pad(Math.floor(mm / 60))}:${pad(mm % 60)}:00`; };

const FIRST = '2026-10-15', LAST = '2026-10-28', LAST_MIN = 8 * 60 + 40; // 10-28 은 08:40 까지
const ST = Array.from({ length: 8 }, (_, i) => `ST-${pad(i + 1)}`);
const HOURLY = [0.3, 0.2, 1.4, 0.2, 0.3, 0.5, 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2.5, 2, 1.5, 1, 0.8, 0.6, 0.4]; // 시간대별 요청 비중

const rows = [];
for (let d = FIRST; d <= LAST; d = addDays(d, 1)) {
  const n = 40 + Math.floor(rnd() * 16);
  const items = [];
  for (let i = 0; i < n; i++) {
    // 시각: 시간대 비중에 따라
    const tot = HOURLY.reduce((s, v) => s + v, 0);
    let x = rnd() * tot, h = 0;
    for (; h < 23; h++) { x -= HOURLY[h]; if (x < 0) break; }
    const reqMin = h * 60 + Math.floor(rnd() * 60);
    if (d === LAST && reqMin > LAST_MIN) continue;
    let from = Math.floor(rnd() * 8), to = Math.floor(rnd() * 8);
    if (rnd() < 0.2) { from = 2; to = 6; } // ST-03 → ST-07 이 많이 쓰이는 구간
    else if (rnd() < 0.12) { from = 4; to = 1; } // ST-05 → ST-02
    if (to === from) to = (to + 1 + Math.floor(rnd() * 7)) % 8;
    const maint = reqMin >= 120 && reqMin < 180; // 점검 시간대
    let wait = 3.2 + Math.abs(gauss()) * 2.2; // 평소 대기(분)
    if (from === 2 && to === 6) wait += h >= 12 && h < 16 ? 13 + rnd() * 7 : 2 + rnd() * 3;
    if (from === 4 && to === 1) wait += 8 + rnd() * 6;
    if (maint) wait = 36 + rnd() * 18; // 점검 중에는 반송이 멈춰 대기가 길게 찍힌다
    const run = 6 + Math.abs(to - from) * 1.4 + gauss() * 0.8;
    items.push({ d, reqMin, from, to, wait, run, maint });
  }
  items.sort((a, b) => a.reqMin - b.reqMin);
  rows.push(...items);
}
const out = rows.map((r, i) => {
  const wait = r1(r.wait), run = r1(Math.max(3, r.run));
  const status = r.maint ? '점검 제외' : wait >= 20 ? '병목' : wait >= 10 ? '대기 김' : '정상';
  return { tr_id: `TR-${pad(i + 1, 4)}`, route: `${ST[r.from]}→${ST[r.to]}`, from: ST[r.from], to: ST[r.to], req: stamp(r.d, r.reqMin), start: stamp(r.d, r.reqMin + wait), end: stamp(r.d, r.reqMin + wait + run), wait, run, status };
});

const here = path.dirname(fileURLToPath(import.meta.url));
const dump = (name, arr, wrap) => fs.writeFileSync(path.join(here, name), wrap ? `{\n"rows": [\n${arr.map((r) => JSON.stringify(r)).join(',\n')}\n]\n}\n` : `[\n${arr.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`);
dump('sample.json', out, true);
const bn = out.filter((r) => r.status === '병목').slice(-3).reverse();
dump('decisions.json', bn.map((r, i) => ({ id: `D-${pad(i + 1, 4)}`, ref: r.tr_id, decision: i === 1 ? '관찰' : '경로 조정 검토', reason: i === 1 ? '일시적 정체로 보여 하루 더 관찰' : `${r.route} 대기 ${r.wait}분, 같은 구간 반복`, who: '물류설비팀', ts: `2026-10-28T08:${pad(40 - i * 4)}:00` })), false);
const by = {};
for (const r of out) if (r.status !== '점검 제외') { by[r.route] = by[r.route] || [0, 0]; by[r.route][0] += r.wait; by[r.route][1]++; }
const top = Object.entries(by).filter(([, v]) => v[1] >= 5).map(([k, v]) => [k, r1(v[0] / v[1]), v[1]]).sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log('transport rows', out.length, JSON.stringify(Object.fromEntries(['정상', '대기 김', '병목', '점검 제외'].map((s) => [s, out.filter((r) => r.status === s).length]))), 'top routes', JSON.stringify(top));
