// 실행: node --test starter/domains/domains.test.mjs
// 도메인 공통 계산(core.mjs 의 새 위젯 입력, stats.mjs, schedule.mjs, review.mjs, assist.mjs)을 손으로 쓴 기대값과 비교한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInputs, compareDiff, compareRows, DEFAULT_STATE, filterRows, makeCtx, matchWhere, tableCols, tpl } from './core.mjs';
import { binCounts, controlLimits, makeBins, niceTicks, percentile, stdev } from './stats.mjs';
import { confirmPayload, dayList, fromInput, hourInfo, hourRange, layoutRows, pickScale, scheduleModel, shifted, slotInfo, toInput, validRange } from './schedule.mjs';
import { addTag, isUncertain, makeRecord, mergedRows, removeTag, reviewCounts, reviewList, tagChoices, validateReview } from './review.mjs';
import { judgeAnswer, segments, splitSentences } from './assist.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (n, f) => JSON.parse(fs.readFileSync(path.join(here, n, f), 'utf8'));
const dom = (n) => read(n, 'domain.json');
const withRows = (n, rows, patch = (d) => d) => makeCtx(patch(dom(n)), { rows });

test('통계: 백분위수는 선형 보간, 표준편차는 n-1', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile(xs, 0.5), 5.5);
  assert.ok(Math.abs(percentile(xs, 0.9) - 9.1) < 1e-9);
  assert.equal(percentile([7], 0.9), 7);
  assert.equal(percentile([], 0.5), null);
  assert.ok(Math.abs(stdev([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138089935) < 1e-6);
  assert.equal(stdev([5]), 0);
});

test('눈금: 간격이 모두 같고 맨 위 눈금이 아래 눈금과 붙지 않는다(82%·76% 문제)', () => {
  const t = niceTicks(75.4, 82.3, 5);
  assert.deepEqual(t.ticks, [74, 76, 78, 80, 82, 84]);
  const gaps = t.ticks.slice(1).map((v, i) => v - t.ticks[i]);
  assert.ok(gaps.every((g) => g === 2));
  assert.deepEqual(niceTicks(0, 33, 5).ticks, [0, 10, 20, 30, 40]);
  assert.deepEqual(niceTicks(5, 5, 5).ticks, [4, 4.5, 5, 5.5, 6]);
  assert.deepEqual(niceTicks(0.2, 0.9, 5).ticks, [0.2, 0.4, 0.6, 0.8, 1]);
});

test('구간: 값이 구간 가장자리에 걸치면 오른쪽 구간으로, 마지막 구간만 오른쪽 끝을 포함', () => {
  assert.deepEqual(binCounts([0, 5, 9.9, 10, 20], [0, 10, 20]), [3, 2]);
  const b = makeBins([1, 2, 2, 3, 3, 3, 4, 9], 5);
  assert.deepEqual(b.edges, [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(b.counts, [1, 5, 1, 0, 1]);
  assert.deepEqual(makeBins([]).edges, []);
});

test('관리도 한계: 평균±kσ, 0 아래는 자르기, 고정값이면 그대로', () => {
  const l = controlLimits([10, 10, 10, 10, 30], 2);
  assert.equal(l.center, 14);
  assert.ok(Math.abs(l.ucl - 31.888544) < 1e-5);
  assert.ok(Math.abs(l.lcl - -3.888544) < 1e-5);
  assert.equal(controlLimits([10, 10, 10, 10, 30], 2, null, true).lcl, 0);
  assert.deepEqual(controlLimits([1, 2, 3], 2, { center: 5, ucl: 8, lcl: 2 }), { center: 5, ucl: 8, lcl: 2, sigma: null, mode: 'fixed' });
  assert.equal(controlLimits([null, null]).center, null);
});

// 점검 도메인 틀에 직접 쓴 행을 넣는다 — 오늘 2026-10-28, 하루 3건씩 13일 + 한 날(10-20)만 20건
function inspRows() {
  const rows = [];
  const day = (d, n) => { for (let k = 0; k < n; k++) rows.push({ insp_id: `X-${rows.length}`, equip: 'EQP-201', line: 'A라인', kind: '정기 점검', start: `${d}T0${k % 9}:00:00`, end: `${d}T0${k % 9}:30:00`, team: '정비1팀', status: '예정', due: '2026-10-31' }); };
  for (let i = 0; i < 14; i++) { const d = `2026-10-${String(15 + i).padStart(2, '0')}`; day(d, d === '2026-10-20' ? 20 : 3); }
  return rows;
}

test('W14 관리도 입력: 기준선·한계·한계 밖 점·클릭 주소', () => {
  const ctx = withRows('inspection', inspRows());
  const w = buildInputs(ctx, DEFAULT_STATE).w14;
  assert.equal(w.points.length, 14);
  assert.equal(w.center, 4.2);
  assert.equal(w.ucl, 11); // 평균 4.214 + k(1.5) × 표본 표준편차 4.544 = 11.03
  assert.equal(w.lcl, 0);
  assert.equal(w.mode, "k");
  assert.equal(w.k, 1.5);
  assert.equal(w.outCount, 1);
  const out = w.points.filter((p) => p.out);
  assert.deepEqual(out.map((p) => [p.date, p.y, p.side]), [['2026-10-20', 20, 'high']]);
  assert.equal(out[0].href, '#/list?period=14d&day=2026-10-20');
  assert.equal(w.points.find((p) => p.date === '2026-10-21').href, undefined);
  // 같은 날 목록 필터가 실제로 그날 건만 남긴다
  assert.equal(filterRows(ctx, { ...DEFAULT_STATE, period: '14d', day: '2026-10-20' }).length, 20);
  // 고정 기준값이면 평균·σ 대신 그 값
  const fixed = withRows('inspection', inspRows(), (d) => ({ ...d, control: { ...d.control, fixed: { center: 5, ucl: 8, lcl: 2 } } }));
  const f = buildInputs(fixed, DEFAULT_STATE).w14;
  assert.deepEqual([f.center, f.ucl, f.lcl, f.mode, f.outCount], [5, 8, 2, 'fixed', 1]);
});

test('W15 분포 입력: 구간·중앙값·p90·그룹별 같은 구간', () => {
  const rows = [];
  const conf = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  conf.forEach((c, i) => rows.push({ doc_id: `D-${i}`, title: 't', abstract: '', applicant: i < 5 ? '한빛반도체' : '에이원테크', filed: '2025-01-01', tags: ['패키징'], confidence: c, status: '미검토', received: '2026-10-28', due: '2026-10-31' }));
  const ctx = withRows('documents', rows);
  const w = buildInputs(ctx, DEFAULT_STATE).w15;
  assert.equal(w.n, 10);
  assert.equal(w.median, 55);
  assert.ok(Math.abs(w.p90 - 91) < 1e-9);
  assert.equal(w.counts.reduce((t, x) => t + x, 0), 10);
  assert.deepEqual(w.edges, [0, 20, 40, 60, 80, 100]); // 값 10~100, 너비 20, 마지막 구간만 오른쪽 끝(100) 포함
  assert.deepEqual(w.counts, [1, 2, 2, 2, 3]);
  const g = Object.fromEntries(w.groups.map((x) => [x.name, x]));
  assert.deepEqual(g['한빛반도체'].counts, [1, 2, 2, 0, 0]);
  assert.deepEqual(g['에이원테크'].counts, [0, 0, 0, 2, 3]);
  assert.equal(g['한빛반도체'].median, 30);
  assert.equal(g['다온소재'].n, 0);
});

test('W15 분포 값 만들기: 시각 차(시간·일)와 시각의 시', () => {
  const ctx = withRows('inspection', inspRows(), (d) => ({ ...d, dist: { title: 't', value: { diff: ['start', 'end'], per: 'h' }, unit: '시간' } }));
  const w = buildInputs(ctx, { ...DEFAULT_STATE, period: '14d' }).w15;
  assert.equal(w.median, 0.5);
});

test('W16 행렬 입력: 두 열 × 집계, 칸 주소는 두 값으로 거른 목록', () => {
  const mk = (applicant, status, n) => Array.from({ length: n }, (_, i) => ({ doc_id: `${applicant}-${status}-${i}`, title: 't', abstract: '', applicant, filed: '2025-01-01', tags: [], confidence: 50 + n, status, received: '2026-10-28', due: '2026-10-31' }));
  const ctx = withRows('documents', [...mk('한빛반도체', '미검토', 3), ...mk('한빛반도체', '확정', 1), ...mk('에이원테크', '미검토', 2)]);
  const w = buildInputs(ctx, DEFAULT_STATE).w16;
  assert.deepEqual(w.rowLabels, ['한빛반도체', '에이원테크', '다온소재', '미래장비', '세진시스템']);
  assert.deepEqual(w.colLabels, ['미검토', '검토 중', '확정']);
  assert.deepEqual(w.values[0], [3, 0, 1]);
  assert.deepEqual(w.values[1], [2, 0, 0]);
  assert.equal(w.hrefs[0][0], `#/list?f_applicant=${encodeURIComponent('한빛반도체')}&f_status=${encodeURIComponent('미검토')}`);
  const avg = withRows('documents', [...mk('한빛반도체', '미검토', 3), ...mk('한빛반도체', '확정', 1)], (d) => ({ ...d, matrix: { ...d.matrix, agg: 'avg', col: 'confidence', decimals: 1, unit: '%' } }));
  const a = buildInputs(avg, DEFAULT_STATE).w16;
  assert.equal(a.values[0][0], 53);
  assert.equal(a.values[0][1], null);
  assert.equal(a.values[0][2], 51);
});

// domains/ 아래 domain.json 이 있는 폴더를 모두 돈다(도메인을 늘려도 목록을 고치지 않는다)
const ALL_DOMAINS = fs.readdirSync(here, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(here, e.name, 'domain.json'))).map((e) => e.name);
test('새 위젯 3종은 모든 도메인 설정에 켜져 있고 빈 데이터에도 죽지 않는다', () => {
  assert.ok(ALL_DOMAINS.length >= 9, ALL_DOMAINS.join());
  for (const n of ALL_DOMAINS) {
    const ctx = makeCtx(dom(n), read(n, 'sample.json'));
    const i = buildInputs(ctx, DEFAULT_STATE);
    assert.ok(i.w14 && i.w15 && i.w16, n);
    assert.ok(i.w14.points.some((p) => p.y !== null), n);
    assert.ok(i.w15.n > 0 && i.w15.counts.length > 0, n);
    assert.ok(i.w16.rowLabels.length > 0 && i.w16.values.flat().some((v) => v > 0), n);
    const e = buildInputs(makeCtx(dom(n), { rows: [] }), DEFAULT_STATE);
    assert.equal(e.w15.n, 0);
    assert.equal(e.w14.outCount, 0);
  }
});

test('where 숫자 비교: "<열" "> 열", 표·CSV 에서 hide 열 제외, tpl 은 배열을 쉼표로', () => {
  const ctx = makeCtx(dom('documents'), read('documents', 'sample.json'));
  const low = ctx.rows.filter((r) => matchWhere(ctx, r, { '<confidence': 70 }));
  assert.ok(low.length > 0 && low.every((r) => r.confidence < 70));
  assert.ok(ctx.rows.filter((r) => matchWhere(ctx, r, { '>confidence': 90 })).every((r) => r.confidence > 90));
  assert.ok(!tableCols(ctx, 'shadcn').some((c) => c.key === 'abstract'));
  assert.equal(tpl(ctx, '{tags}', { tags: ['패키징', '공정 제어'] }), '패키징, 공정 제어');
});

// ---------- 일정 격자 ----------
const T = (id, equip, start, end, extra = {}) => ({ insp_id: id, equip, line: 'A라인', kind: '정기 점검', start, end, team: '정비1팀', status: '예정', due: '2026-10-31', ...extra });
const schedCtx = (rows, rules) => withRows('inspection', rows, (d) => ({ ...d, schedule: { ...d.schedule, slot: { unit: 'day', from: '2026-10-26', count: 7 }, ...(rules ? { rules } : {}) } }));

test('일정 충돌: 같은 장비에서 시간이 겹치면 충돌, 맞닿으면 충돌 아님, 편집하면 바로 다시 계산', () => {
  const rows = [T('A', 'EQP-201', '2026-10-27T10:00:00', '2026-10-27T12:00:00'), T('B', 'EQP-201', '2026-10-27T11:00:00', '2026-10-27T13:00:00'), T('C', 'EQP-202', '2026-10-27T11:00:00', '2026-10-27T13:00:00')];
  const ctx = schedCtx(rows, [{ by: 'equip', max: 1, label: '같은 장비 시간 겹침' }]);
  const m = scheduleModel(ctx);
  assert.equal(m.count, 3);
  assert.equal(m.conflicts.length, 1);
  assert.deepEqual(m.conflicts[0].ids, ['A', 'B']);
  assert.equal(m.conflicts[0].label, '같은 장비 시간 겹침');
  assert.deepEqual(m.conflictIds.sort(), ['A', 'B']);
  assert.equal(confirmPayload(m, {}, '2026-10-28T09:00:00'), null);
  // B 를 12:00~14:00 으로 옮기면 A 의 끝과 맞닿을 뿐 겹치지 않는다
  const edits = { B: { start: '2026-10-27T12:00:00', end: '2026-10-27T14:00:00' } };
  const m2 = scheduleModel(ctx, edits);
  assert.equal(m2.conflicts.length, 0);
  assert.deepEqual(confirmPayload(m2, edits, '2026-10-28T09:00:00'), { ts: '2026-10-28T09:00:00', count: 3, edits });
  // 자원을 옮겨도 해소
  assert.equal(scheduleModel(ctx, { B: { resource: 'EQP-203' } }).conflicts.length, 0);
  // 행은 자원별, 겹치는 막대는 줄로 쌓인다
  const row = m.rows.find((r) => r.resource === 'EQP-201');
  assert.equal(row.lanes, 2);
  assert.deepEqual(row.items.map((x) => [x.id, x.lane, x.conflict]), [['A', 0, true], ['B', 1, true]]);
  // 위치는 격자 칸 기준: 10-27 10:00 = (1일 + 10시간) / 7일
  assert.ok(Math.abs(row.items[0].left - (34 / 168)) < 1e-9);
  assert.ok(Math.abs(row.items[0].width - (2 / 168)) < 1e-9);
});

test('일정 충돌: 같은 그룹 동시·팀 용량 초과(max)와 미배정·완료 제외', () => {
  const rows = [
    T('A', 'EQP-201', '2026-10-27T10:00:00', '2026-10-27T12:00:00'), T('B', 'EQP-202', '2026-10-27T10:30:00', '2026-10-27T12:00:00'), T('C', 'EQP-203', '2026-10-27T11:00:00', '2026-10-27T12:00:00'),
    T('D', 'EQP-204', '2026-10-27T11:00:00', '2026-10-27T12:00:00', { status: '완료' }), T('E', 'EQP-205', '', '', {}),
  ];
  const ctx = schedCtx(rows, [{ by: 'team', max: 2, label: '팀 용량 초과' }]);
  const m = scheduleModel(ctx);
  assert.equal(m.count, 3); // 완료(D)는 격자에 올리지 않는다
  assert.equal(m.conflicts.length, 1);
  assert.deepEqual(m.conflicts[0].ids, ['A', 'B', 'C']);
  assert.deepEqual(m.unassigned.map((x) => x.id), ['E']);
  // 라인이 같은 건이 max 3 초과로 동시에 걸릴 때만
  const line = scheduleModel(schedCtx(rows, [{ by: 'line', max: 3, label: '라인' }]));
  assert.equal(line.conflicts.length, 0);
  // 미배정에 시간을 주면 격자로 들어온다
  const placed = scheduleModel(ctx, { E: { start: '2026-10-27T11:00:00', end: '2026-10-27T12:00:00' } });
  assert.equal(placed.unassigned.length, 0);
  assert.equal(placed.count, 4);
  assert.deepEqual(placed.conflicts[0].ids.sort(), ['A', 'B', 'C', 'E']);
});

test('일정 시간 도구: 끌어 옮기기는 맞춤 단위로, 입력칸 형식 변환, 시간 순서 검사', () => {
  assert.deepEqual(shifted({ start: '2026-10-27T10:00:00', end: '2026-10-27T12:00:00' }, 80, 60), { start: '2026-10-27T11:00:00', end: '2026-10-27T13:00:00' });
  assert.deepEqual(shifted({ start: '2026-10-27T10:00:00', end: '2026-10-27T12:00:00' }, 95, 60), { start: '2026-10-27T12:00:00', end: '2026-10-27T14:00:00' });
  assert.deepEqual(shifted({ start: '2026-10-27T10:00:00', end: '2026-10-27T12:00:00' }, -24 * 60, 60), { start: '2026-10-26T10:00:00', end: '2026-10-26T12:00:00' });
  assert.equal(toInput('2026-10-27T10:00:00'), '2026-10-27T10:00');
  assert.equal(fromInput('2026-10-27T10:00'), '2026-10-27T10:00:00');
  assert.equal(validRange('2026-10-27T10:00:00', '2026-10-27T10:00:00'), false);
  assert.equal(validRange('2026-10-27T10:00:00', '2026-10-27T10:30:00'), true);
});

test('점검 견본: 격자에 55건이 한 주에 고르게, 충돌 9건(장비 6·라인 2·팀 1), 일정 미정 5건', () => {
  const ctx = makeCtx(dom('inspection'), read('inspection', 'sample.json'));
  const m = scheduleModel(ctx);
  assert.equal(m.count, 55);
  assert.deepEqual([0, 1, 2].map((r) => m.conflicts.filter((c) => c.rule === r).length), [6, 2, 1]);
  assert.equal(m.unassigned.length, 5);
  const perDay = {};
  for (const x of m.sched) perDay[x.start.slice(0, 10)] = (perDay[x.start.slice(0, 10)] || 0) + 1;
  assert.deepEqual(perDay, { '2026-10-26': 8, '2026-10-27': 8, '2026-10-28': 8, '2026-10-29': 8, '2026-10-30': 8, '2026-10-31': 8, '2026-11-01': 7 });
  for (const x of m.sched) { const h = (x.e - x.s) / 3600000; assert.ok(h >= 1 && h <= 6, `${x.id} 길이 ${h}시간`); }
});

test('일정 보기: 일정이 하루에 몰리면 hour, 여러 날이면 day, 설정이 정하면 그대로', () => {
  const week = slotInfo({ slot: { unit: 'day', from: '2026-10-26', count: 7 } });
  const oneDay = scheduleModel(schedCtx([T('A', 'EQP-201', '2026-10-27T10:00:00', '2026-10-27T12:00:00'), T('B', 'EQP-202', '2026-10-27T11:00:00', '2026-10-27T15:00:00')])).sched;
  const spread = scheduleModel(schedCtx([T('A', 'EQP-201', '2026-10-27T10:00:00', '2026-10-27T12:00:00'), T('B', 'EQP-202', '2026-10-29T11:00:00', '2026-10-29T15:00:00')])).sched;
  assert.equal(pickScale('auto', oneDay, week), 'hour');
  assert.equal(pickScale(undefined, oneDay, week), 'hour');
  assert.equal(pickScale('auto', spread, week), 'day');
  assert.equal(pickScale('day', oneDay, week), 'day');
  assert.equal(pickScale('hour', spread, week), 'hour');
  assert.deepEqual(dayList(week).map((d) => d.label), ['10-26 월', '10-27 화', '10-28 수', '10-29 목', '10-30 금', '10-31 토', '11-01 일']);
});

test('일 보기 범위: 기본 6~22시, 그날 일정이 넘치면 넓히고, 다른 날 일정은 무시', () => {
  const x = (s, e) => ({ s: Date.parse(`${s}Z`), e: Date.parse(`${e}Z`) });
  assert.deepEqual(hourRange([x('2026-10-27T09:00:00', '2026-10-27T11:00:00')], '2026-10-27'), [6, 22]);
  assert.deepEqual(hourRange([x('2026-10-27T05:30:00', '2026-10-27T23:10:00')], '2026-10-27'), [5, 24]);
  assert.deepEqual(hourRange([x('2026-10-26T20:00:00', '2026-10-27T03:00:00')], '2026-10-27'), [0, 22]);
  assert.deepEqual(hourRange([x('2026-10-28T01:00:00', '2026-10-28T02:00:00')], '2026-10-27'), [6, 22]);
  const v = hourInfo('2026-10-27', 6, 22);
  assert.equal(v.count, 16);
  assert.deepEqual([v.slots[0].label, v.slots[15].label], ['06', '21']);
});

test('일정 배치: 하루 보기는 시간 비율 그대로, 주 보기는 최소 너비를 두고 줄을 쌓는다', () => {
  const ctx = schedCtx([T('A', 'EQP-201', '2026-10-27T10:00:00', '2026-10-27T12:00:00'), T('B', 'EQP-201', '2026-10-27T13:00:00', '2026-10-27T14:00:00', { status: '진행' }), T('C', 'EQP-202', '2026-10-30T10:00:00', '2026-10-30T11:00:00')]);
  const m = scheduleModel(ctx);
  // 하루 보기(06~22, 16칸): 10~12시 = 네 칸 지난 자리에서 두 칸 너비
  const day = layoutRows(m.sched, hourInfo('2026-10-27', 6, 22));
  assert.deepEqual(day.map((r) => r.resource), ['EQP-201']);
  assert.ok(Math.abs(day[0].items[0].left - 4 / 16) < 1e-9 && Math.abs(day[0].items[0].width - 2 / 16) < 1e-9);
  assert.deepEqual(day[0].items.map((i) => i.lane), [0, 0]);
  // 주 보기: A(2시간)는 최소 너비 0.9/7 로 늘어나 같은 날 13시 B 와 겹치므로 B 는 둘째 줄
  const wk = layoutRows(m.sched, m.info, 0.9 / 7);
  const r201 = wk.find((r) => r.resource === 'EQP-201');
  assert.ok(Math.abs(r201.items[0].width - 0.9 / 7) < 1e-9);
  assert.deepEqual(r201.items.map((i) => i.lane), [0, 1]);
  assert.equal(r201.lanes, 2);
  // 오른쪽 끝을 넘지 않는다: 11-01 23시 시작은 남은 1시간/168시간 만큼만
  const edge = layoutRows([{ ...m.sched[0], id: 'Z', resource: 'EQP-209', s: Date.parse('2026-11-01T23:00:00Z'), e: Date.parse('2026-11-01T23:30:00Z') }], m.info, 0.9 / 7);
  assert.ok(Math.abs(edge[0].items[0].left + edge[0].items[0].width - 1) < 1e-9);
});

// ---------- 문서 검토 ----------
const docRows = () => [
  { doc_id: 'D1', title: 'a', abstract: 'x', applicant: '한빛반도체', filed: '2025-01-01', tags: ['패키징'], confidence: 90, status: '미검토', received: '2026-10-28', due: '2026-10-31' },
  { doc_id: 'D2', title: 'b', abstract: 'y', applicant: '한빛반도체', filed: '2025-01-01', tags: ['패키징', '공정 제어'], confidence: 55, status: '미검토', received: '2026-10-28', due: '2026-10-31' },
  { doc_id: 'D3', title: 'c', abstract: 'z', applicant: '에이원테크', filed: '2025-01-01', tags: ['회로 설계'], confidence: 60, status: '확정', received: '2026-10-28', due: '2026-10-31' },
];
test('문서 검토: 불확실 큐(신뢰도 70 미만·확정 제외)는 신뢰도 낮은 순, 저장하면 확정 상태로 얹힌다', () => {
  const ctx = withRows('documents', docRows());
  const cfg = ctx.d.review;
  assert.deepEqual(reviewList(ctx, {}, { filter: 'uncertain' }).map((r) => r.doc_id), ['D2']);
  assert.deepEqual(reviewList(ctx, {}).map((r) => r.doc_id), ['D2', 'D3', 'D1']);
  assert.deepEqual(reviewList(ctx, {}, { minConf: 60 }).map((r) => r.doc_id), ['D3', 'D1']);
  assert.deepEqual(reviewList(ctx, {}, { q: '공정' }).map((r) => r.doc_id), ['D2']);
  assert.deepEqual(reviewCounts(ctx, {}), { all: 3, uncertain: 1, done: 1 });
  const rec = makeRecord(cfg, ['패키징'], ' 요약과 청구항이 일치 ', '2026-10-28T09:00:00');
  assert.deepEqual(rec, { tags: ['패키징'], reason: '요약과 청구항이 일치', status: '확정', ts: '2026-10-28T09:00:00', who: '지식재산 담당' });
  const saved = { D2: rec };
  assert.deepEqual(reviewCounts(ctx, saved), { all: 3, uncertain: 0, done: 2 });
  assert.deepEqual(mergedRows(ctx, saved).find((r) => r.doc_id === 'D2').tags, ['패키징']);
  assert.equal(isUncertain(cfg, docRows()[1]), true);
});
test('문서 검토: 분류 칩 추가·삭제·중복 방지, 고를 수 있는 목록에서 이미 붙은 것 제외, 검증 문구', () => {
  const cfg = dom('documents').review;
  assert.deepEqual(addTag(['패키징'], '공정 제어'), ['패키징', '공정 제어']);
  assert.deepEqual(addTag(['패키징'], '패키징'), ['패키징']);
  assert.deepEqual(removeTag(['패키징', '공정 제어'], '패키징'), ['공정 제어']);
  assert.equal(tagChoices(cfg, ['패키징', '공정 제어']).length, cfg.taxonomy.length - 2);
  assert.ok(!tagChoices(cfg, ['패키징']).includes('패키징'));
  assert.deepEqual(validateReview(cfg, [], ' '), { tags: '분류를 하나 이상 고르세요.', reason: '판정 사유를 입력하세요.' });
  assert.deepEqual(validateReview(cfg, ['패키징'], '사유'), {});
});

// ---------- 판정(AI 기능 페이지) ----------
test('판정: 고정 라벨·근거 문장은 규칙이 정하고, 같은 입력이면 같은 결과', () => {
  const ctx = makeCtx(dom('interview'), read('interview', 'sample.json'));
  const cfg = ctx.d.assist;
  const row = { q_id: 'Q-X', question: '질문', risk_terms: ['연봉', '복지'] };
  const ans = '저는 새로운 기술을 배우는 일이 좋아서 지원했습니다. 솔직히 연봉도 중요하다고 생각합니다. 입사 후에는 공정 데이터를 다루고 싶습니다.';
  const a = judgeAnswer(cfg, row, ans);
  assert.equal(a.code, 'risk');
  assert.equal(a.label, '위험 표현 있음');
  assert.equal(a.message, '질문에 정한 위험 표현이 답변에 들어 있습니다.');
  assert.deepEqual(a.terms, ['연봉', '솔직히']);
  assert.deepEqual(a.sentences.map((s) => s.terms), [[], ['연봉', '솔직히'], []]);
  assert.equal(a.sentences[1].text, '솔직히 연봉도 중요하다고 생각합니다.');
  assert.equal(a.count, 1);
  assert.deepEqual(judgeAnswer(cfg, row, ans), a);
  assert.deepEqual(judgeAnswer(cfg, row, `  ${ans}  `), a);
  const safe = judgeAnswer(cfg, row, '저는 새로운 기술을 배우는 일이 좋아서 지원했습니다. 입사 후에는 공정 데이터를 다루고 싶습니다.');
  assert.deepEqual([safe.code, safe.label, safe.terms], ['safe', '위험 표현 없음', []]);
  const short = judgeAnswer(cfg, row, '연봉이요.');
  assert.deepEqual([short.code, short.label, short.terms], ['short', '답변 부족', []]);
  assert.equal(judgeAnswer(cfg, row, '').code, 'short');
  // 공통 키워드는 질문과 상관없이 걸린다
  assert.equal(judgeAnswer(cfg, { risk_terms: [] }, '무조건 열심히 하겠다는 말씀을 드리고 싶습니다. 팀과 함께 성장하겠습니다.').code, 'risk');
});
test('판정 보조: 문장 나누기와 키워드 강조 조각', () => {
  assert.deepEqual(splitSentences('가나다. 라마바!\n사아자?'), ['가나다.', '라마바!', '사아자?']);
  assert.deepEqual(segments('솔직히 연봉도 중요하다', ['솔직히', '연봉']), [{ text: '솔직히', mark: true }, { text: ' ', mark: false }, { text: '연봉', mark: true }, { text: '도 중요하다', mark: false }]);
  assert.deepEqual(segments('abc', []), [{ text: 'abc', mark: false }]);
});

test('샘플: 문서 분류는 분류 체계 안의 값만 쓰고 한 문서가 여러 분류를 가질 수 있다, 인터뷰 질문마다 위험 키워드가 있다', () => {
  const d = read('documents', 'sample.json').rows, tax = dom('documents').review.taxonomy;
  assert.ok(d.every((r) => r.tags.length >= 1 && r.tags.every((t) => tax.includes(t))));
  assert.ok(d.some((r) => r.tags.length >= 2));
  assert.ok(d.filter((r) => r.confidence < 70 && r.status !== '확정').length >= 10);
  assert.ok(d.every((r) => r.abstract.length >= 100));
  const q = read('interview', 'sample.json').rows;
  assert.ok(q.every((r) => r.risk_terms.length >= 3));
  assert.equal(new Set(q.map((r) => r.topic)).size, 5);
});

// ---- 관리도 시간 단위 · 히트맵 where · 리포트 A/B 표 ----
const pw = (ts, status) => ({ row_id: `P-${ts}-${status}`, ts, bldg: 'A동', meter: 'MT-A1', kwh: 10, base: 10, ratio: 100, status, run: '', run_len: 0, fp: '–' });

test('W14 관리도: bucket hour 는 날짜×시 칸마다 한 점, 기본은 하루 한 점', () => {
  const rows = [pw('2026-10-28T01:00:00', '이상'), pw('2026-10-28T01:15:00', '이상'), pw('2026-10-28T01:30:00', '정상'), pw('2026-10-28T03:00:00', '이상'), pw('2026-10-27T05:00:00', '정상')];
  const hourly = buildInputs(withRows('power', rows), DEFAULT_STATE).w14;
  assert.equal(hourly.points.length, 5 * 24);
  const p = (x) => hourly.points.find((q) => q.x === x);
  assert.equal(p('10-28 01시').y, 2);
  assert.equal(p('10-28 03시').y, 1);
  assert.equal(p('10-27 05시').y, 0);
  assert.equal(p('10-28 02시').y, null); // 데이터 없는 시각은 0 이 아니라 빈 점
  const daily = buildInputs(withRows('power', rows, (d) => ({ ...d, control: { ...d.control, bucket: 'day' } })), DEFAULT_STATE).w14;
  assert.equal(daily.points.length, 5);
  assert.equal(daily.points.at(-1).y, 3);
  assert.equal(daily.points.at(-1).x, '10-28');
});

test('W5 히트맵: heat.where 로 행을 거른다', () => {
  // 2026-10-28 은 수요일(index 2). 시간대 08–12 = 2번째 칸이 아니라 index 2
  const rows = [pw('2026-10-28T09:00:00', '이상'), pw('2026-10-28T09:15:00', '정상'), pw('2026-10-28T09:30:00', '정상'), pw('2026-10-28T13:00:00', '이상')];
  const all = buildInputs(withRows('power', rows, (d) => ({ ...d, heat: { ...d.heat, where: undefined } })), DEFAULT_STATE).w5;
  assert.deepEqual(all.values[2], [0, 0, 3, 1, 0, 0]);
  const only = buildInputs(withRows('power', rows), DEFAULT_STATE).w5;
  assert.deepEqual(only.values[2], [0, 0, 1, 1, 0, 0]);
});

test('리포트 A/B 표: 건수 행 중복 없음 · 차이 = A − B', () => {
  const alarm = withRows('alarm', []);
  const labels = compareRows(alarm, { _n: 0 }).map((r) => r[0]);
  assert.equal(labels.filter((l) => l.startsWith('알람 건수')).length, 1);
  const noCount = withRows('alarm', [], (d) => ({ ...d, metrics: d.metrics.filter((m) => m.key !== 'count') }));
  assert.equal(compareRows(noCount, { _n: 7 })[0][0], '알람 건수(건)');
  assert.equal(compareRows(noCount, { _n: 7 })[0][1], 7);
  assert.equal(compareDiff(185, 215), -30);
  assert.equal(compareDiff(215, 185), 30);
  assert.equal(compareDiff(null, 5), null);
});

// 도메인 설정은 any 라 키 오타를 아무도 잡지 않는다 — 최상위 키가 아는 이름인지 여기서 본다(오타면 메뉴가 조용히 사라진다). 새 키를 만들면 이 목록과 DOMAIN.md 에 같이 적는다.
const KNOWN_KEYS = new Set(['name', 'app', 'entity', 'cols', 'roles', 'group', 'metrics', 'cards', 'progress', 'due', 'summary', 'summaryTargets', 'trend', 'rank', 'stack', 'heat', 'funnel', 'queue', 'alerts', 'board', 'timeline', 'activity', 'layout', 'tabs', 'rules', 'related', 'evidence', 'newRow', 'form', 'notice', 'report',
  'import', 'dataSource', 'params', 'judge', 'whatIf', 'control', 'dist', 'matrix', 'schedule', 'review', 'assist', 'chat', 'datasets', 'run', 'graph', 'me', 'help', 'docs']);
test('도메인 설정: 모든 견본의 최상위 키가 아는 이름이고 datasets·run·graph 모양이 맞다', () => {
  const names = fs.readdirSync(here, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(here, e.name, 'domain.json'))).map((e) => e.name);
  assert.ok(names.length >= 9);
  for (const n of names) {
    const d = dom(n);
    const unknown = Object.keys(d).filter((k) => !KNOWN_KEYS.has(k));
    assert.deepEqual(unknown, [], `${n}/domain.json 모르는 키: ${unknown.join(', ')}`);
    if (d.run) for (const p of d.run.params ?? []) { assert.ok(p.key && p.label && ['number', 'enum'].includes(p.type) && p.default !== undefined, `${n} run.params ${p.key}`); if (p.type === 'enum') assert.ok(Array.isArray(p.options) && p.options.length, `${n} run.params ${p.key} options`); }
    if (d.graph) assert.equal(typeof d.graph.title, 'string', `${n} graph.title`);
    if (d.help) assert.ok(Array.isArray(d.help.steps) && d.help.steps.every((x) => typeof x === 'string'), `${n} help.steps`);
    if (d.docs) assert.ok(d.docs.every((x) => x.name && x.href), `${n} docs`);
  }
  const t = dom('transport');
  assert.ok(t.datasets && t.run && t.graph, 'transport 견본은 데이터셋·실행·그래프 페이지를 켜 둔다');
});
