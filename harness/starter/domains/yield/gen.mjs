// yield/gen.mjs — 수율 이상 로트 가상 데이터 (고정 시드, 의존성 0). 실행: node starter/domains/yield/gen.mjs → sample.json · decisions.json 을 다시 쓴다.
// 숨은 조건 ① 시험 생산 로트(kind=시험)는 비교·기준선에서 뺀다(status=제외)  ② 기준선 = 직전 4주(28일) 같은 공정 양산 로트 평균.
// 실제 회사·장비 정보 없음.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(20261028);
const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) * Math.SQRT2; }; // 평균 0, 표준편차 ≈ 1
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const pad = (n, w = 2) => String(n).padStart(w, '0');
const r1 = (v) => Math.round(v * 10) / 10;

const TODAY = '2026-10-28', START = '2026-09-02'; // 57일치. 앞 28일은 기준선 쌓는 기간
const PROCS = [['식각', 95.2, 'E'], ['증착', 96.0, 'D'], ['포토', 93.8, 'P'], ['세정', 97.1, 'C'], ['CMP', 94.6, 'M']];
const VENDORS = ['가나 시스템', '다라 테크', '마바 장비'];
// 장비 마스터(열로 합침): 공정마다 4대
const EQUIPS = [];
PROCS.forEach(([proc, , code], pi) => { for (let k = 1; k <= 4; k++) EQUIPS.push({ equip: `EQP-${code}${pad(k)}`, proc, vendor: VENDORS[(pi + k) % 3], age: 2 + ((pi * 3 + k * 2) % 9) }); });
const HIDDEN_BAD = 'EQP-E03'; // 식각 3호기: 10-14 이후 수율이 3.4%p 떨어진다(장비 쏠림)
const HIDDEN_SPIKE_DAY = '2026-10-21'; // 이날 세정 전체가 약액 이슈로 하루 내려앉는다(관리도 한계 밖)

const days = []; for (let d = START; d <= TODAY; d = addDays(d, 1)) days.push(d);
const raw = [];
for (const d of days) {
  const wd = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
  const n = wd >= 5 ? 6 : 11 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const eq = rnd() < 0.14 ? EQUIPS.find((e) => e.equip === HIDDEN_BAD) : EQUIPS[Math.floor(rnd() * EQUIPS.length)]; // 식각 3호기는 투입이 조금 몰린다
    const pr = PROCS.find((p) => p[0] === eq.proc);
    const test = rnd() < 0.09; // 시험 생산 로트
    let y = pr[1] + gauss() * 0.95 - (eq.vendor === '마바 장비' ? 0.25 : 0) - eq.age * 0.03;
    if (eq.equip === HIDDEN_BAD && d >= '2026-10-14') y -= 3.4 + rnd() * 0.8;
    if (eq.proc === '세정' && d === HIDDEN_SPIKE_DAY) y -= 2.8;
    if (test) y -= 5 + rnd() * 9; // 시험 로트는 조건을 바꿔 돌려서 수율이 크게 낮다 — 빼지 않으면 전부 이상으로 잡힌다
    raw.push({ d, hh: 6 + Math.floor(rnd() * 16), mm: Math.floor(rnd() * 12) * 5, eq, test, y: Math.max(40, Math.min(99.5, r1(y))) });
  }
}
raw.sort((a, b) => (a.d + pad(a.hh) + pad(a.mm) < b.d + pad(b.hh) + pad(b.mm) ? -1 : 1));

const rows = [];
raw.forEach((x, i) => {
  // 기준선: 측정일 직전 28일, 같은 공정, 시험 로트 제외한 양산 로트 평균 (이전 자료가 5건 미만이면 공정 공칭값)
  const lo = addDays(x.d, -28);
  const pool = raw.filter((p) => !p.test && p.eq.proc === x.eq.proc && p.d >= lo && p.d < x.d).map((p) => p.y);
  const nominal = PROCS.find((p) => p[0] === x.eq.proc)[1];
  const base = pool.length >= 5 ? r1(pool.reduce((s, v) => s + v, 0) / pool.length) : nominal;
  const gap = r1(x.y - base);
  const status = x.test ? '제외' : gap <= -2.5 ? '이상' : gap <= -1.5 ? '주의' : '정상';
  rows.push({ lot_id: `LOT-${pad(i + 1, 4)}`, proc: x.eq.proc, equip: x.eq.equip, vendor: x.eq.vendor, age: x.eq.age, kind: x.test ? '시험' : '양산', yield: x.y, base, gap, measured: `${x.d}T${pad(x.hh)}:${pad(x.mm)}:00`, status });
});

const here = path.dirname(fileURLToPath(import.meta.url));
const dump = (name, arr, wrap) => fs.writeFileSync(path.join(here, name), wrap ? `{\n"rows": [\n${arr.map((r) => JSON.stringify(r)).join(',\n')}\n]\n}\n` : `[\n${arr.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`);
dump('sample.json', rows, true);
const open = rows.filter((r) => r.status === '이상').slice(-3).reverse();
const whos = ['수율팀', '공정기술1팀', '공정기술2팀'];
dump('decisions.json', open.map((r, i) => ({ id: `D-${pad(i + 1, 4)}`, ref: r.lot_id, decision: i === 1 ? '보류' : '조사 지정', reason: i === 1 ? '시험 조건 변경 이력 확인 후 재판단' : `${r.equip} 수율 편차 ${r.gap}%p, 같은 장비 연속 확인`, who: whos[i], ts: `2026-10-28T08:${pad(42 - i * 4)}:00` })), false);
console.log('yield rows', rows.length, Object.fromEntries(['정상', '주의', '이상', '제외'].map((s) => [s, rows.filter((r) => r.status === s).length])));
