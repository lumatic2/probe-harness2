// purchase/gen.mjs — 자재 발주 지연 가상 데이터 (고정 시드, 의존성 0). 실행: node starter/domains/purchase/gen.mjs → sample.json · decisions.json
// 숨은 조건 ① 부분 입고는 첫 입고일을 실입고일로 본다(recv=부분)  ② 지연일수는 주말·공휴일을 뺀 영업일로 센다(cal_delay 와 delay 가 다름).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(20261029);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay(); // 0=일
const pad = (n, w = 2) => String(n).padStart(w, '0');
const HOLIDAYS = new Set(['2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09']); // 추석 연휴·개천절(+대체)·한글날
const isWork = (d) => dow(d) !== 0 && dow(d) !== 6 && !HOLIDAYS.has(d);
const nextWork = (d) => { let x = d; while (!isWork(x)) x = addDays(x, 1); return x; };
// (from, to] 구간의 영업일 수 — 휴일·주말은 센 날에서 뺀다
const workDays = (from, to) => { let n = 0; for (let x = addDays(from, 1); x <= to; x = addDays(x, 1)) if (isWork(x)) n++; return n; };

const TODAY = '2026-10-28', START = '2026-09-07';
// 품목군: [이름, 지연 확률, 지연 평균(영업일), 품목들, 단가 범위(만원)]
const CATS = [
  ['웨이퍼·기판', 0.10, 2, ['300mm 실리콘 웨이퍼', 'SOI 기판', '더미 웨이퍼', '에피 웨이퍼'], [900, 2400]],
  ['포토 소재', 0.34, 4, ['포토레지스트 A', 'ArF 레지스트', 'BARC 코팅액', '현상액 TMAH'], [300, 1200]],
  ['식각 가스', 0.27, 3, ['NF3 가스', 'CF4 가스', 'Cl2 가스', 'HBr 가스'], [150, 700]],
  ['세정 약품', 0.12, 2, ['불산 희석액', 'SC1 약액', '황산 과수', '초순수 필터'], [60, 320]],
  ['소모성 부품', 0.20, 3, ['O-링 세트', '척 패드', '샤워헤드', '정전척 커버'], [40, 500]],
];
const REPEAT_ITEMS = new Set(['포토레지스트 A', 'NF3 가스', 'ArF 레지스트']); // 반복 지연 품목(지연 확률이 더 높다)

const rows = [];
let seq = 0;
for (let d = START; d <= TODAY; d = addDays(d, 1)) {
  if (!isWork(d) && rnd() > 0.1) continue; // 요청은 거의 영업일에만
  const n = 12 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const ci = Math.floor(rnd() * CATS.length);
    const [cat, pLate, mean, items, [lo, hi]] = CATS[ci];
    const item = items[Math.floor(rnd() * items.length)];
    const lead = 7 + Math.floor(rnd() * 8); // 납기약속 7~14일 뒤
    const promised = nextWork(addDays(d, lead));
    const p = REPEAT_ITEMS.has(item) ? Math.min(0.7, pLate * 1.7) : pLate;
    const late = rnd() < p;
    const lateWork = late ? Math.max(1, Math.round(mean + (rnd() - 0.5) * 3)) : 0; // 영업일 기준 지연
    let received = promised;
    if (late) { let k = 0; while (k < lateWork) { received = addDays(received, 1); if (isWork(received)) k++; } }
    else if (rnd() < 0.3) received = addDays(promised, -Math.floor(rnd() * 3));
    const pending = received > TODAY; // 오늘 이후에 들어올 건은 아직 미입고
    const partial = !pending && rnd() < 0.16; // 부분 입고 — 실입고일 = 첫 입고일
    const cal = pending ? 0 : Math.max(0, Math.round((Date.parse(received) - Date.parse(promised)) / 86400000));
    const delay = pending ? (promised < TODAY ? workDays(promised, TODAY) : 0) : Math.max(0, workDays(promised, received));
    const status = pending ? (promised < TODAY ? '납기 초과' : '입고 대기') : delay > 0 ? '지연' : '정시';
    seq++;
    rows.push({ po_id: `PO-${pad(seq, 4)}`, item, cat, req: d, promised, received: pending ? '' : received, recv: pending ? '' : partial ? '부분' : '일괄', amount: Math.round(lo + rnd() * (hi - lo)), cal_delay: cal, delay, status });
  }
}
rows.sort((a, b) => (a.promised < b.promised ? -1 : a.promised > b.promised ? 1 : a.po_id < b.po_id ? -1 : 1));
rows.forEach((r, i) => { r.po_id = `PO-${pad(i + 1, 4)}`; });
// 반복 지연: 같은 품목의 최근 90일(납기약속일 기준, 자기 포함) 지연 건수
for (const r of rows) r.repeat = rows.filter((x) => x.item === r.item && x.promised <= r.promised && x.promised >= addDays(r.promised, -90) && (x.status === '지연' || x.status === '납기 초과')).length;

const here = path.dirname(fileURLToPath(import.meta.url));
const dump = (name, arr, wrap) => fs.writeFileSync(path.join(here, name), wrap ? `{\n"rows": [\n${arr.map((r) => JSON.stringify(r)).join(',\n')}\n]\n}\n` : `[\n${arr.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`);
dump('sample.json', rows, true);
const open = rows.filter((r) => r.status === '납기 초과' || (r.status === '지연' && r.repeat >= 4)).slice(-3).reverse();
dump('decisions.json', open.map((r, i) => ({ id: `D-${pad(i + 1, 4)}`, ref: r.po_id, decision: i === 1 ? '모니터링' : '선제 발주', reason: i === 1 ? '입고 일정 협력사 재확인 중' : `${r.item} 최근 90일 지연 ${r.repeat}회, 안전재고 확대`, who: '구매팀', ts: `2026-10-28T08:${pad(41 - i * 4)}:00` })), false);
const by = {};
for (const r of rows) { by[r.cat] = by[r.cat] || [0, 0]; by[r.cat][1]++; if (r.status === '지연' || r.status === '납기 초과') by[r.cat][0]++; }
console.log('purchase rows', rows.length, JSON.stringify(by), rows.filter((r) => r.recv === '부분').length, 'partial', rows.filter((r) => r.cal_delay !== r.delay).length, 'cal!=work');
