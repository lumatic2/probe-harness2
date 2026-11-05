// gen-sample.mjs — 가상 데이터 생성기 (고정 시드: 다시 돌려도 같은 결과, 의존성 0)
// 실행: node starter/domains/gen-sample.mjs [alarm|education|inspection]  → 각 폴더의 sample.json · decisions.json 을 다시 쓴다(이름을 안 주면 셋 다).
// 실제 회사·사람 정보 없음. 도메인마다 200~400행. 새 도메인은 이 파일이 아니라 CSV 로 만든다(starter/DOMAIN.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const pad = (n, w = 2) => String(n).padStart(w, '0');
const makePick = (rnd) => (weights) => {
  const total = weights.reduce((s, w) => s + w, 0);
  let x = rnd() * total;
  for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return i; }
  return weights.length - 1;
};

// ====================== 알람: 팹 장비 알람 ======================
const PROCS = ['식각', '증착', '포토', '세정', 'CMP'];
const PROC_COUNT = [6, 5, 4, 5, 4];
const CODES = {
  식각: [['E-101', '챔버 압력 이탈'], ['E-102', 'RF 반사 전력 높음'], ['E-103', '가스 유량 편차']],
  증착: [['D-201', '증착 온도 편차'], ['D-202', '전구체 공급 부족'], ['D-203', '두께 규격 이탈 경고']],
  포토: [['P-301', '정렬 오차 초과'], ['P-302', '노광 조도 저하'], ['P-303', '레티클 로딩 지연']],
  세정: [['C-401', '약액 농도 이탈'], ['C-402', '순수 비저항 저하'], ['C-403', '건조 불량']],
  CMP: [['M-501', '패드 마모 한계'], ['M-502', '슬러리 유량 저하'], ['M-503', '헤드 압력 편차']],
};
const OWNERS = ['담당 A조', '담당 B조', '담당 C조', '담당 D조'];
const HOUR_W = [1, 1, 1, 1, 1, 2, 3, 5, 9, 9, 6, 5, 4, 5, 8, 8, 6, 4, 3, 3, 2, 2, 1, 1];

export function generateAlarm() {
  const START = '2026-10-15', TODAY = '2026-10-28';
  const rnd = mulberry32(20261031);
  const pickW = makePick(rnd);
  const equipment = [];
  let n = 0;
  PROCS.forEach((proc, pi) => {
    for (let k = 0; k < PROC_COUNT[pi]; k++) {
      equipment.push({ id: `EQP-${101 + n}`, group: proc, row: Math.floor(n / 6) + 1, col: (n % 6) + 1, state: '가동' });
      n++;
    }
  });
  for (const e of equipment) {
    if (['EQP-104', 'EQP-108', 'EQP-122'].includes(e.id)) e.state = '점검';
    if (['EQP-112', 'EQP-119'].includes(e.id)) e.state = '정지';
  }
  const dates = Array.from({ length: 14 }, (_, i) => addDays(START, i));
  const counts = dates.map((d) => {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const wk = dow === 0 || dow === 6 ? 0.7 : 1;
    const part = d === TODAY ? 0.4 : 1;
    return Math.round(30 * wk * part * (0.8 + 0.4 * rnd()));
  });
  let diff = 400 - counts.reduce((s, c) => s + c, 0);
  for (let i = 0; diff !== 0; i = (i + 5) % 13) { counts[i] += Math.sign(diff); diff -= Math.sign(diff); }

  const equipW = equipment.map((e) => (e.id === 'EQP-104' ? 4 : e.id === 'EQP-112' ? 3 : 1));
  const raw = [];
  dates.forEach((d, di) => {
    const age = dates.length - 1 - di;
    for (let k = 0; k < counts[di]; k++) {
      const eq = equipment[pickW(equipW)];
      let hour = pickW(HOUR_W);
      if (d === TODAY) hour = Math.min(hour, 8);
      const minute = Math.floor(rnd() * 60);
      const code = CODES[eq.group][Math.floor(rnd() * 3)][0];
      const r = rnd();
      const severity = r < 0.12 ? '긴급' : r < 0.5 ? '주의' : '정보';
      const done = Math.min(0.93, 0.45 + 0.04 * age);
      const doing = (1 - done) * 0.55;
      const s = rnd();
      const status = s < done ? '완료' : s < done + doing ? '조치중' : '미조치';
      const owner = status === '미조치' && rnd() < 0.6 ? '미지정' : OWNERS[Math.floor(rnd() * 4)];
      raw.push({ equip: eq.id, proc: eq.group, code, severity, ts: `${d}T${pad(hour)}:${pad(minute)}:00`, status, owner });
    }
  });
  raw.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.equip < b.equip ? -1 : 1));
  const rows = raw.map((a, i) => ({ alarm_id: `ALM-${pad(i + 1, 4)}`, ...a }));

  const base = { 식각: 91.5, 증착: 93.0, 포토: 92.5, 세정: 94.0, CMP: 90.5 };
  const dips = { '2026-10-22|식각': -14, '2026-10-22|증착': -6, '2026-10-26|CMP': -9 };
  const series = [];
  for (const d of dates) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    for (const p of PROCS) {
      const v = base[p] + (rnd() - 0.5) * 3 + (dow === 0 || dow === 6 ? -1 : 0) + (dips[`${d}|${p}`] || 0);
      series.push({ date: d, group: p, value: Math.round(v * 10) / 10 });
    }
  }
  const schedule = [
    ['식각 챔버 정기 점검', 'EQP-103', '2026-10-24', '2026-10-27', '담당 A조'],
    ['증착 전구체 라인 교체', 'EQP-108', '2026-10-27', '2026-10-29', '담당 B조'],
    ['CMP 패드 교체', 'EQP-122', '2026-10-28', '2026-10-28', '담당 C조'],
    ['포토 정렬 보정', 'EQP-114', '2026-10-29', '2026-10-30', '담당 D조'],
    ['세정 약액 교체', 'EQP-117', '2026-10-30', '2026-10-31', '담당 A조'],
    ['식각 RF 매칭 점검', 'EQP-104', '2026-10-29', '2026-11-01', '담당 B조'],
    ['순수 필터 교체', 'EQP-119', '2026-11-01', '2026-11-02', '담당 C조'],
    ['증착 온도 센서 보정', 'EQP-109', '2026-11-02', '2026-11-04', '담당 D조'],
    ['포토 레티클 로더 점검', 'EQP-113', '2026-11-04', '2026-11-05', '담당 A조'],
    ['CMP 슬러리 라인 점검', 'EQP-123', '2026-11-05', '2026-11-06', '담당 B조'],
  ].map(([title, equip, start, end, owner]) => ({ label: `${equip} ${title}`, start, end, owner }));
  const recent = rows.filter((a) => a.status !== '미조치').slice(-12).reverse();
  const verbs = ['조치 완료로 변경', '담당 지정', '조치중으로 변경', '메모 추가'];
  const activity = recent.map((a, i) => ({ ts: a.ts, who: OWNERS[i % 4], what: `${a.alarm_id} ${verbs[i % 4]}`, href: `#/item/${a.alarm_id}` }));

  const sample = { rows, series, units: equipment, schedule, activity };
  const picks = rows.filter((a) => a.severity === '긴급').slice(-3).reverse();
  const decisions = picks.map((a, i) => ({
    id: `D-000${i + 1}`, ref: a.alarm_id, value: [20, 0, 45][i], decision: i === 1 ? '반려' : '승인',
    reason: ['재기동 후 수치 정상 확인', '원인 미확인, 재점검 필요', '부품 교체 후 가동 재개'][i], who: OWNERS[i], ts: a.ts,
  }));
  return { sample, decisions };
}

// ====================== 교육: 사내 교육 이수 ======================
const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'];
const GIVEN = ['민준', '서연', '지후', '하윤', '도윤', '서윤', '예준', '지우', '시우', '수아', '주원', '아린', '현우', '다은', '건우', '채원', '유준', '소율', '태윤', '나은'];
const JOBS = ['공정엔지니어', '설비엔지니어', '품질', '생산기술', '안전환경', '구매'];
const COURSES = [
  ['정보보안 교육', 365], ['개인정보보호 교육', 365], ['안전보건 교육', 365], ['화학물질 취급 교육', 365], ['클린룸 수칙 교육', 365], ['준법·윤리 교육', 365],
];

export function generateEducation() {
  const TODAY = '2026-10-28', START = '2026-10-15';
  const rnd = mulberry32(20261101);
  const pickW = makePick(rnd);
  const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  // 사원 90명. 입사 90일 이내(2026-07-30 이후)는 교육 대상에서 제외한다 — 이 규칙은 데이터 생성에만 있고 화면 코드에는 없다.
  const cutoff = addDays(TODAY, -90);
  const people = Array.from({ length: 90 }, (_, i) => ({
    emp: `E${2000 + i * 7 + rint(0, 5)}`,
    name: `${SURNAMES[Math.floor(rnd() * SURNAMES.length)]}${GIVEN[Math.floor(rnd() * GIVEN.length)]}`,
    job: JOBS[pickW([5, 4, 3, 3, 2, 1])],
    hired: addDays('2016-03-01', rint(0, 3700)),
  }));
  const eligible = people.filter((p) => p.hired < cutoff);
  const dates = Array.from({ length: 14 }, (_, i) => addDays(START, i));
  const used = new Set();
  const rows = [];
  const perDay = dates.map((d) => { const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); return Math.round(23 * (dow === 0 || dow === 6 ? 0.45 : 1) * (0.85 + 0.3 * rnd())); });
  dates.forEach((d, di) => {
    for (let k = 0; k < perDay[di]; k++) {
      let p, c, key, guard = 0;
      do { p = eligible[Math.floor(rnd() * eligible.length)]; c = COURSES[Math.floor(rnd() * COURSES.length)]; key = `${p.emp}|${c[0]}`; guard++; } while (used.has(key) && guard < 50);
      used.add(key);
      const age = dates.length - 1 - di;
      const r = rnd();
      const doneP = Math.min(0.92, 0.5 + 0.035 * age), expiredP = 0.15;
      let status, completed = '', valid;
      if (r < expiredP) { // 갱신 배정: 지난 이수의 유효기간이 이미 지났다
        status = '만료';
        completed = addDays(TODAY, -(366 + rint(5, 150)));
        valid = addDays(completed, c[1]);
      } else if (r < expiredP + (1 - expiredP) * doneP) {
        status = '이수';
        completed = addDays(d, rint(0, Math.max(0, Math.min(age, 6))));
        valid = addDays(completed, c[1]);
      } else {
        status = '미이수';
        valid = addDays(d, rint(6, 16)); // 이수 기한
      }
      rows.push({ emp_id: p.emp, name: p.name, job: p.job, course: c[0], assigned: d, completed, valid_until: valid, status, hired: p.hired });
    }
  });
  rows.sort((a, b) => (a.assigned < b.assigned ? -1 : a.assigned > b.assigned ? 1 : a.emp_id < b.emp_id ? -1 : 1));
  rows.forEach((r, i) => { Object.assign(r, { rec_id: `EDU-${pad(i + 1, 4)}` }); });
  const ordered = rows.map(({ rec_id, ...rest }) => ({ rec_id, ...rest }));
  const miss = ordered.filter((r) => r.status === '미이수').slice(-3).reverse();
  const decisions = miss.map((r, i) => ({
    id: `D-000${i + 1}`, ref: r.rec_id, completed: [TODAY, TODAY, addDays(TODAY, -1)][i], decision: i === 1 ? '반려' : '이수 확인',
    reason: ['수료증 확인', '수강 기록 없음, 재수강 필요', '온라인 과정 수료 확인'][i], who: '교육 담당', ts: `${TODAY}T08:${40 - i * 3}:00`,
  }));
  return { sample: { rows: ordered }, decisions };
}

// ====================== 점검: 설비 점검 일정 ======================
const LINES = ['A라인', 'B라인', 'C라인', 'D라인', 'E라인', 'F라인'];
const TEAMS = ['정비1팀', '정비2팀', '정비3팀', '정비4팀'];
const KINDS = ['정기 점검', '필터 교체', '센서 보정', '진공 누설 점검', '소모품 교체', '정밀 점검'];

export function generateInspection() {
  const TODAY = '2026-10-28', START = '2026-10-15';
  const rnd = mulberry32(20261102);
  const pickW = makePick(rnd);
  const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const equips = Array.from({ length: 24 }, (_, i) => ({ id: `EQP-${201 + i}`, line: LINES[Math.floor(i / 4)] }));
  const dates = Array.from({ length: 14 }, (_, i) => addDays(START, i));
  const raw = [];
  dates.forEach((d) => {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const n = Math.round(22 * (dow === 0 || dow === 6 ? 0.4 : 1) * (0.85 + 0.3 * rnd()));
    for (let k = 0; k < n; k++) {
      const eq = equips[pickW(equips.map((_, i) => (i === 5 ? 3 : i === 13 ? 2 : 1)))];
      const sh = d === TODAY ? rint(8, 9) : rint(7, 17);
      const dur = pickW([5, 4, 3, 2, 1]) * 6 + rint(0, 5); // 시간
      const startMs = Date.parse(`${d}T${pad(sh)}:${pad(rint(0, 5) * 10)}:00Z`);
      const endMs = startMs + dur * 3600000;
      const iso = (ms) => new Date(ms).toISOString().slice(0, 19);
      raw.push({ equip: eq.id, line: eq.line, kind: KINDS[Math.floor(rnd() * KINDS.length)], team: TEAMS[Math.floor(rnd() * TEAMS.length)], start: iso(startMs), end: iso(endMs), startMs, endMs });
    }
  });
  raw.sort((a, b) => a.startMs - b.startMs || (a.equip < b.equip ? -1 : 1));
  // 같은 장비에서 시간이 겹치는 뒤쪽 일정은 충돌
  const lastEnd = {};
  const nowMs = Date.parse(`${TODAY}T09:00:00Z`);
  const rows = raw.map((a, i) => {
    const conflict = lastEnd[a.equip] !== undefined && a.startMs < lastEnd[a.equip];
    lastEnd[a.equip] = Math.max(lastEnd[a.equip] ?? 0, a.endMs);
    let status;
    if (conflict) status = '충돌';
    else if (a.endMs < nowMs) status = rnd() < 0.93 ? '완료' : '진행';
    else if (a.startMs <= nowMs) status = '진행';
    else status = '예정';
    if (status === '충돌' && a.endMs < nowMs && rnd() < 0.5) status = '완료';
    const due = addDays(a.end.slice(0, 10), rint(0, 2));
    return { insp_id: `INS-${pad(i + 1, 4)}`, equip: a.equip, line: a.line, kind: a.kind, start: a.start, end: a.end, team: a.team, status, due };
  });
  // 점검 주간(10-26~11-01): 위 난수 일정은 하루에 몰리므로, 그 주는 고정 목록(난수 없음)으로 다시 깐다 — 하루 7~8건 · 1~6시간 · 충돌 9건
  // [날짜, 시작 시, 길이(시간), 장비, 점검 항목, 팀, 충돌 여부(같은 장비 겹침 e · 같은 라인 4건 동시 l · 같은 팀 4건 동시 t)]
  const WEEK = [
    ['10-26', 6, 4, 201, 0, 1], ['10-26', 7, 3, 205, 1, 2], ['10-26', 9, 5, 210, 2, 3], ['10-26', 10, 2, 214, 3, 4], ['10-26', 13, 6, 218, 5, 1], ['10-26', 14, 4, 207, 1, 3], ['10-26', 15, 3, 222, 4, 2], ['10-26', 16, 2, 218, 2, 4, 'e'],
    ['10-27', 6, 3, 202, 4, 2], ['10-27', 8, 5, 209, 0, 1], ['10-27', 9, 2, 216, 2, 4], ['10-27', 11, 4, 220, 1, 3], ['10-27', 13, 3, 224, 3, 2], ['10-27', 15, 6, 204, 5, 4], ['10-27', 16, 3, 212, 2, 1], ['10-27', 14, 2, 220, 4, 1, 'e'],
    ['10-28', 6, 4, 203, 0, 1], ['10-28', 7, 2, 208, 2, 2], ['10-28', 8, 5, 213, 1, 3], ['10-28', 10, 3, 219, 3, 4], ['10-28', 12, 6, 223, 5, 2], ['10-28', 13, 2, 206, 4, 1], ['10-28', 15, 4, 211, 0, 3], ['10-28', 17, 3, 215, 2, 4],
    ['10-29', 6, 3, 201, 1, 3], ['10-29', 7, 4, 206, 0, 1], ['10-29', 8, 2, 214, 4, 2], ['10-29', 9, 5, 218, 2, 4], ['10-29', 14, 4, 209, 0, 2], ['10-29', 15, 3, 210, 1, 4], ['10-29', 15, 2, 211, 3, 1], ['10-29', 16, 2, 212, 2, 3, 'l'],
    ['10-30', 6, 5, 202, 5, 1], ['10-30', 7, 3, 207, 2, 2], ['10-30', 9, 4, 217, 1, 3], ['10-30', 10, 2, 221, 4, 4], ['10-30', 13, 6, 215, 0, 2], ['10-30', 14, 3, 224, 3, 3], ['10-30', 15, 2, 215, 2, 4, 'e'], ['10-30', 8, 2, 217, 4, 1, 'e'],
    ['10-31', 7, 4, 203, 0, 2], ['10-31', 9, 3, 211, 1, 1], ['10-31', 11, 5, 219, 5, 3], ['10-31', 13, 2, 205, 2, 4], ['10-31', 12, 3, 219, 4, 4, 'e'], ['10-31', 8, 3, 201, 1, 1], ['10-31', 8, 2, 202, 3, 3], ['10-31', 9, 3, 204, 2, 4, 'l'],
    ['11-01', 8, 3, 208, 0, 3], ['11-01', 10, 4, 213, 3, 1], ['11-01', 13, 2, 222, 1, 2], ['11-01', 14, 3, 201, 2, 2], ['11-01', 14, 2, 206, 4, 2], ['11-01', 14, 2, 217, 1, 2, 't'], ['11-01', 11, 2, 213, 2, 4, 'e'],
  ];
  const nowWeek = Date.parse(`${TODAY}T09:00:00Z`);
  const iso = (ms) => new Date(ms).toISOString().slice(0, 19);
  const weekRows = WEEK.map(([md, h, dur, eq, k, t, flag]) => {
    const startMs = Date.parse(`2026-${md}T${pad(h)}:00:00Z`);
    const endMs = startMs + dur * 3600000;
    const idx = eq - 201;
    return { equip: `EQP-${eq}`, line: LINES[Math.floor(idx / 4)], kind: KINDS[k], team: TEAMS[t - 1], start: iso(startMs), end: iso(endMs), startMs, status: flag ? '충돌' : startMs <= nowWeek ? '진행' : '예정', due: addDays(iso(endMs).slice(0, 10), 1 + (idx % 2)) };
  }).sort((a, b) => a.startMs - b.startMs || (a.equip < b.equip ? -1 : 1));
  const kept = rows.filter((r) => r.start < '2026-10-26');
  const rows2 = [...kept, ...weekRows.map((w, i) => ({ insp_id: `INS-${pad(kept.length + i + 1, 4)}`, equip: w.equip, line: w.line, kind: w.kind, start: w.start, end: w.end, team: w.team, status: w.status, due: w.due }))];
  const open = rows2.filter((r) => r.status !== '완료').slice(-3).reverse();
  const decisions = open.map((r, i) => ({
    id: `D-000${i + 1}`, ref: r.insp_id, minutes: [95, 40, 120][i], decision: i === 1 ? '재점검' : '완료 확인',
    reason: ['규격 내 측정 확인', '진공도 기준 미달, 재점검 필요', '소모품 교체 후 정상'][i], who: TEAMS[i], ts: `${TODAY}T08:${42 - i * 4}:00`,
  }));
  // 일정이 아직 안 잡힌 점검(일정 격자의 미배정 목록용) — 난수를 쓰지 않는 고정 목록이라 위 데이터는 그대로다
  const pending = [['EQP-203', 'A라인', '센서 보정', '정비2팀'], ['EQP-210', 'C라인', '필터 교체', '정비1팀'], ['EQP-214', 'D라인', '정기 점검', '정비4팀'], ['EQP-218', 'E라인', '진공 누설 점검', '정비3팀'], ['EQP-222', 'F라인', '소모품 교체', '정비1팀']]
    .map(([equip, line, kind, team], k) => ({ insp_id: `INS-${pad(rows2.length + k + 1, 4)}`, equip, line, kind, start: '', end: '', team, status: '예정', due: '2026-10-31' }));
  return { sample: { rows: [...rows2, ...pending] }, decisions };
}

// ====================== 문서: 특허·기술 문서 분류 ======================
export const DOC_TAGS = ['메모리 소자', '패키징', '공정 제어', '설비 모니터링', '검사·계측', '소재·화학', '회로 설계', 'AI·알고리즘'];
const DOC_APPLICANTS = ['한빛반도체', '에이원테크', '다온소재', '미래장비', '세진시스템'];
const DOC_VOCAB = {
  '메모리 소자': { n: ['셀 트랜지스터', '비트라인 구조', '저항 변화 소자', '커패시터 적층'], e: ['누설 전류를 줄이고', '데이터 유지 시간을 늘리고', '셀 간 간섭을 낮추고'] },
  패키징: { n: ['적층 칩 본딩', '기판 배선', '열 방출 구조', '몰딩 수지 충전'], e: ['휨 현상을 줄이고', '접합 신뢰성을 높이고', '발열을 분산하고'] },
  '공정 제어': { n: ['증착 두께 조절', '식각 종점 검출', '노광 정렬 보정', '세정 조건 선정'], e: ['공정 편차를 줄이고', '조건 탐색 시간을 단축하고', '재작업 비율을 낮추고'] },
  '설비 모니터링': { n: ['진공 펌프 상태', '챔버 압력 이력', '반송 로봇 동작', '가스 공급 설비'], e: ['이상 징후를 조기에 알리고', '정지 시간을 줄이고', '점검 주기를 최적화하고'] },
  '검사·계측': { n: ['패턴 결함 검출', '막 두께 측정', '오버레이 계측', '표면 입자 검사'], e: ['검사 속도를 높이고', '미검출률을 낮추고', '측정 반복성을 높이고'] },
  '소재·화학': { n: ['저유전 박막', '연마 슬러리 조성', '포토레지스트 첨가제', '식각 가스 혼합'], e: ['선택비를 높이고', '표면 결함을 줄이고', '보관 안정성을 높이고'] },
  '회로 설계': { n: ['센스 앰프', '전원 공급 회로', '입출력 버퍼', '오류 정정 회로'], e: ['소비 전력을 줄이고', '동작 속도를 높이고', '면적을 줄이고'] },
  'AI·알고리즘': { n: ['불량 예측 모델', '이상 탐지 기법', '레시피 추천 방법', '이미지 분류 네트워크'], e: ['예측 정확도를 높이고', '학습 데이터 요구량을 줄이고', '판정 근거를 제시하고'] },
};

export function generateDocuments() {
  const TODAY = '2026-10-28', START = '2026-10-15';
  const rnd = mulberry32(20261105);
  const pickW = makePick(rnd);
  const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const dates = Array.from({ length: 14 }, (_, i) => addDays(START, i));
  const rows = [];
  for (let i = 0; i < 300; i++) {
    const received = dates[pickW(dates.map((d) => (new Date(`${d}T00:00:00Z`).getUTCDay() % 6 === 0 ? 1 : 3)))];
    const ntag = pickW([6, 3, 1]) + 1;
    const tags = [];
    while (tags.length < ntag) { const t = DOC_TAGS[Math.floor(rnd() * DOC_TAGS.length)]; if (!tags.includes(t)) tags.push(t); }
    const main = DOC_VOCAB[tags[0]];
    const noun = pick(main.n), eff = pick(main.e);
    const second = tags[1] ? `${pick(DOC_VOCAB[tags[1]].n)}와 연계해 ${pick(DOC_VOCAB[tags[1]].e)} ` : '';
    const title = `${noun}${rnd() < 0.5 ? '을 이용한 ' : '의 '}${pick(['제어 방법', '개선 구조', '제조 방법', '판단 장치', '보정 방법'])}`;
    const abstract = `본 문서는 ${noun}에 관한 것으로, ${eff} ${second}${pick(['수율을 개선하는', '공정 안정성을 확보하는', '품질 편차를 줄이는'])} 방법을 제안한다. 실시예에서는 ${rint(3, 9)}개의 조건으로 ${pick(['시험', '모의 실험', '비교 평가'])}를 수행하였으며, 기존 방식 대비 ${rint(8, 35)}% 개선된 결과를 얻었다. 청구항은 ${noun}의 구성과 ${rint(2, 5)}단계 처리 순서를 포함한다.`;
    const conf = Math.max(30, Math.min(98, 94 - 12 * (ntag - 1) - Math.round(rnd() ** 2 * 45)));
    const recent = received >= addDays(TODAY, -4);
    const st = pickW(recent ? [15, 20, 65] : [60, 15, 25]);
    rows.push({
      doc_id: '', title, abstract, filed: addDays('2024-03-01', rint(0, 940)), applicant: DOC_APPLICANTS[pickW([3, 2, 2, 2, 1])], tags, confidence: conf,
      status: ['확정', '검토 중', '미검토'][st], received, due: addDays(received, rint(3, 7)),
    });
  }
  rows.sort((a, b) => (a.received < b.received ? -1 : a.received > b.received ? 1 : 0));
  rows.forEach((r, i) => { r.doc_id = `DOC-${pad(i + 1, 4)}`; });
  const open = rows.filter((r) => r.status !== '확정').slice(-3).reverse();
  const decisions = open.map((r, i) => ({
    id: `D-000${i + 1}`, ref: r.doc_id, decision: i === 1 ? '재검토' : '분류 확정',
    reason: ['요약과 청구항이 일치해 분류 유지', '두 분야에 걸쳐 있어 담당자 확인 필요', '자체 분류와 같아 확정'][i], who: '지식재산 담당', ts: `${TODAY}T08:${42 - i * 4}:00`,
  }));
  return { sample: { rows }, decisions };
}

// ====================== 인터뷰: 선수·지원자 인터뷰 연습 ======================
const IV_TOPICS = {
  '지원 동기': { q: ['이 직무에 지원한 이유를 말씀해 주세요.', '왜 우리 회사를 선택했나요?', '입사 후 3년 안에 이루고 싶은 목표는 무엇인가요?', '이 직무에서 본인의 강점이 드러나는 경험은 무엇인가요?', '다른 회사 지원 현황과 비교해 우리 회사의 우선순위는 어떤가요?', '이 분야에 관심을 갖게 된 계기는 무엇인가요?'], t: ['연봉', '복지', '안정', '워라밸', '다른 곳', '떨어져서'] },
  '협업·갈등': { q: ['팀 안에서 의견이 충돌했던 경험과 해결 방법을 말씀해 주세요.', '동료와 업무 방식이 달라 힘들었던 적이 있나요?', '상사와 생각이 달랐을 때 어떻게 했나요?', '팀원이 맡은 일을 끝내지 못했을 때 어떻게 대응했나요?', '협업에서 본인의 역할은 주로 무엇인가요?', '피드백을 받아들이기 어려웠던 경험이 있나요?'], t: ['무능', '답답', '탓', '싫어', '혼자 다', '무시'] },
  '성과·실패': { q: ['가장 자랑스러운 성과를 말씀해 주세요.', '크게 실패했던 경험과 배운 점은 무엇인가요?', '목표를 달성하지 못했을 때 어떻게 대응했나요?', '짧은 기한에 일을 끝내야 했던 경험이 있나요?', '성과를 숫자로 보여 줄 수 있는 사례가 있나요?', '같은 실수를 반복하지 않으려고 하는 방법은 무엇인가요?'], t: ['운이', '어쩔 수 없', '내 잘못 아니', '대충', '포기', '핑계'] },
  '윤리·가치관': { q: ['규정과 현실이 충돌할 때 어떻게 판단하나요?', '동료의 잘못을 알게 된다면 어떻게 하겠습니까?', '이익과 원칙 중 하나를 골라야 했던 경험이 있나요?', '정보 보안이 중요한 업무에서 지켜야 할 것은 무엇이라고 생각하나요?', '불공정하다고 느낀 상황에서 어떻게 행동했나요?', '일과 개인 생활의 균형에 대한 생각을 말씀해 주세요.'], t: ['걸리지 않으면', '다들 그렇게', '규정은 무시', '눈감', '비밀로', '몰래'] },
  '직무 이해': { q: ['이 직무가 하는 일을 본인 말로 설명해 주세요.', '반도체 공정에서 가장 중요한 요소는 무엇이라고 생각하나요?', '최근 관심 있게 본 기술 동향이 있나요?', '업무에 필요한 역량 중 부족하다고 느끼는 것은 무엇인가요?', '데이터를 보고 문제를 찾아낸 경험이 있나요?', '입사 후 처음 3개월 동안 무엇을 배우고 싶나요?'], t: ['잘 모르', '검색해', '대충 알', '들어본', '아마', '찍어'] },
};

export function generateInterview() {
  const TODAY = '2026-10-28', START = '2026-10-15';
  const rnd = mulberry32(20261106);
  const pickW = makePick(rnd);
  const dates = Array.from({ length: 14 }, (_, i) => addDays(START, i));
  const rows = [];
  Object.entries(IV_TOPICS).forEach(([topic, v]) => {
    v.q.forEach((q, qi) => {
      for (const level of ['기본', '심화']) {
        const i = rows.length;
        const asked = dates[13 - Math.floor(rnd() ** 1.6 * 14)]; // 최근 날짜에 더 몰리게 — 기간을 줄여도 주제마다 질문이 남는다
        rows.push({
          q_id: '', question: level === '심화' ? `${q} 구체적인 사례와 숫자를 들어 설명해 주세요.` : q, topic, level,
          risk_terms: v.t.slice(qi % 3, (qi % 3) + 4), limit_sec: [60, 90, 120, 180][pickW([2, 4, 3, 1])],
          status: asked < addDays(TODAY, -6) ? ['완료', '연습 중', '미연습'][pickW([6, 2, 2])] : ['완료', '연습 중', '미연습'][pickW([2, 3, 5])], asked, due: addDays(asked, 3 + (i % 5)),
        });
      }
    });
  });
  rows.sort((a, b) => (a.asked < b.asked ? -1 : a.asked > b.asked ? 1 : 0));
  rows.forEach((r, i) => { r.q_id = `Q-${pad(i + 1, 3)}`; });
  const open = rows.filter((r) => r.status !== '완료').slice(-3).reverse();
  const decisions = open.map((r, i) => ({
    id: `D-000${i + 1}`, ref: r.q_id, decision: i === 1 ? '재연습' : '연습 완료',
    reason: ['답변 구조가 분명함', '위험 표현이 있어 다시 연습', '근거 사례가 더 필요함'][i], who: '연습 담당', ts: `${TODAY}T08:${42 - i * 4}:00`,
  }));
  return { sample: { rows }, decisions };
}

export const GENERATORS = { alarm: generateAlarm, education: generateEducation, inspection: generateInspection, documents: generateDocuments, interview: generateInterview };

function pretty(obj) {
  const rows = Object.entries(obj).map(([k, v]) => {
    if (Array.isArray(v)) return `${JSON.stringify(k)}: [\n${v.map((x) => JSON.stringify(x)).join(',\n')}\n]`;
    return `${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  });
  return `{\n${rows.join(',\n')}\n}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const want = process.argv[2] ? [process.argv[2]] : Object.keys(GENERATORS);
  for (const name of want) {
    if (!GENERATORS[name]) { console.error(`알 수 없는 도메인: ${name} (alarm|education|inspection|documents|interview)`); process.exit(2); }
    const { sample, decisions } = GENERATORS[name]();
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    fs.writeFileSync(path.join(dir, name, 'sample.json'), pretty(sample));
    fs.writeFileSync(path.join(dir, name, 'decisions.json'), `[\n${decisions.map((d) => JSON.stringify(d)).join(',\n')}\n]\n`);
    console.log(`${name}: 행 ${sample.rows.length}`);
  }
}
