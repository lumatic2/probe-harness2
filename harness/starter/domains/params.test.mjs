// 실행: node --test starter/domains/params.test.mjs
// 기준값(params) — domain.json 의 params 선언 · "$param:키" 참조 · 판정(judge) · 가정 바꿔 보기 whatIf · 설정 저장 기록을 손으로 쓴 기대값과 비교한다.
// 기대값은 샘플 데이터를 직접 세어(파이썬으로 따로 계산) 글자로 적었다. 코드와 같은 식으로 다시 계산하지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInputs, customParams, DEFAULT_STATE, diffParams, makeCtx, makeSettingsRecord, matchWhere, paramDefs, paramError, paramValues, resolveParams, settingsNote, validateParams, whatIf } from './core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (n, f) => JSON.parse(fs.readFileSync(path.join(here, n, f), 'utf8'));
const load = (n, saved) => makeCtx(read(n, 'domain.json'), read(n, 'sample.json'), saved);
const count = (ctx, key, v) => ctx.rows.filter((r) => r[key] === v).length;

test('4개 도메인에 params 2~4개, 모든 참조가 선언된 키를 가리키고 선언한 키는 모두 쓰인다', () => {
  for (const n of ['alarm', 'yield', 'power', 'purchase']) {
    const text = fs.readFileSync(path.join(here, n, 'domain.json'), 'utf8');
    const d = JSON.parse(text);
    const defs = paramDefs(d);
    assert.ok(defs.length >= 2 && defs.length <= 4, `${n} params ${defs.length}개`);
    const keys = defs.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length);
    const refs = [...text.matchAll(/\$param:([A-Za-z0-9_]+)|\{param:([A-Za-z0-9_]+)\}/g)].map((m) => m[1] || m[2]);
    for (const r of refs) assert.ok(keys.includes(r), `${n}: 선언 없는 참조 ${r}`);
    for (const k of keys) assert.ok(refs.includes(k), `${n}: 안 쓰는 키 ${k}`);
    for (const p of defs) {
      assert.ok(['number', 'enum', 'bool'].includes(p.type));
      assert.ok(p.label && p.affects, `${n}.${p.key} label·affects`);
      assert.equal(paramError(p, p.default), '', `${n}.${p.key} 기본값이 자기 범위 안`);
    }
  }
});

test('resolveParams: 통째 참조는 값 그대로(숫자·불리언), 글 속 {param:키} 는 글자로, 없는 키는 그대로', () => {
  const out = resolveParams({ a: '$param:x', b: [1, '$param:y'], c: { t: '90일 내 {param:x}회', u: '$param:none' } }, { x: 4, y: true });
  assert.deepEqual(out, { a: 4, b: [1, true], c: { t: '90일 내 4회', u: '$param:none' } });
});

test('paramError · validateParams: 숫자 범위, 목록 값, 켬/끔', () => {
  const num = { key: 'k', label: 'k', type: 'number', unit: '시간', min: 1, max: 336, default: 48 };
  assert.equal(paramError(num, 48), '');
  assert.equal(paramError(num, 1), '');
  assert.equal(paramError(num, 0), '1~336시간 사이로 입력하세요.');
  assert.equal(paramError(num, 337), '1~336시간 사이로 입력하세요.');
  assert.equal(paramError(num, NaN), '숫자를 입력하세요.');
  assert.equal(paramError(num, '12'), '숫자를 입력하세요.');
  const en = { key: 'e', type: 'enum', options: [{ v: 'delay', label: '영업일' }, 'cal'], default: 'delay' };
  assert.equal(paramError(en, 'cal'), '');
  assert.equal(paramError(en, 'delay'), '');
  assert.equal(paramError(en, 'x'), '목록에 있는 값을 고르세요.');
  assert.equal(paramError({ key: 'b', type: 'bool', default: true }, false), '');
  assert.equal(paramError({ key: 'b', type: 'bool', default: true }, 'false'), '켬 또는 끔 중에서 고르세요.');
  const d = read('alarm', 'domain.json');
  assert.deepEqual(validateParams(d, { esc_h: 0 }), { esc_h: '1~336시간 사이로 입력하세요.' });
  assert.deepEqual(validateParams(d, {}), {});
});

test('paramValues: 기본값 위에 저장값을 덮고, 틀린 저장값은 기본값으로', () => {
  const d = read('alarm', 'domain.json');
  assert.deepEqual(paramValues(d, {}), { esc_h: 48, util_target: 92, done_target: 85, ctl_k: 1.5 });
  assert.deepEqual(paramValues(d, { esc_h: 24, ctl_k: 99, util_target: 'x' }), { esc_h: 24, util_target: 92, done_target: 85, ctl_k: 1.5 });
  assert.deepEqual(paramValues({ name: 'x' }, { a: 1 }), {});
});

test('기본 기준값이면 판정이 데이터의 원래 상태 열과 같다(양산 수율·전력·구매)', () => {
  const y = load('yield');
  assert.deepEqual(['정상', '주의', '이상', '제외'].map((s) => count(y, 'status', s)), [472, 47, 21, 53]);
  assert.equal(y.rows.filter((r) => r._judge !== r.status).length, 0); // 판정 규칙(_judge)이 데이터의 상태 열을 그대로 재현
  const p = load('power');
  assert.deepEqual(['정상', '이상', '정전 구간'].map((s) => count(p, 'status', s)), [1616, 48, 16]);
  assert.equal(p.rows.filter((r) => r._judge !== r.status).length, 0);
  const u = load('purchase');
  assert.deepEqual(['정시', '입고 대기', '지연', '납기 초과'].map((s) => count(u, 'status', s)), [298, 112, 68, 7]);
  assert.equal(u.rows.filter((r) => r._judge !== r.status).length, 0);
});

test('저장된 기준값이 계산에 들어간다: 목표·판정·건수', () => {
  assert.equal(load('alarm').d.metrics.find((m) => m.key === 'doneRate').target, 85);
  const a = load('alarm', { done_target: 90, util_target: 95 });
  assert.equal(a.d.metrics.find((m) => m.key === 'doneRate').target, 90);
  assert.equal(a.d.metrics.find((m) => m.key === 'util').target, 95);
  assert.equal(a.d.control.k, 1.5);
  assert.equal(load('alarm', { ctl_k: 2.5 }).d.control.k, 2.5);
  assert.equal(count(load('alarm'), '_judge', '에스컬레이션'), 77);
  assert.equal(count(load('alarm', { esc_h: 24 }), '_judge', '에스컬레이션'), 93);
  const y = load('yield', { yield_bad: -3.5 });
  assert.deepEqual(['이상', '주의'].map((s) => count(y, 'status', s)), [9, 59]);
  assert.equal(count(load('power', { skip_outage: false }), 'status', '이상'), 64);
  assert.equal(count(load('power', { hi_pct: 120 }), 'status', '이상'), 53);
  const u = load('purchase', { late_grace: 2, basis: 'cal_delay' });
  assert.equal(count(u, 'status', '지연'), 54);
  assert.equal(count(load('purchase', { late_grace: 2 }), 'status', '지연'), 50);
  const rep = load('purchase', { repeat_min: 3 });
  assert.equal(rep.rows.filter((r) => matchWhere(rep, r, rep.d.metrics.find((m) => m.key === 'repeatLate').where)).length, 49);
  assert.equal(rep.d.metrics.find((m) => m.key === 'repeatLate').label, '반복 지연(90일 내 3회 이상)');
  assert.equal(load('purchase').d.metrics.find((m) => m.key === 'repeatLate').label, '반복 지연(90일 내 4회 이상)');
});

test('기본값일 때 대시보드 입력이 그대로(기준 4배열)', () => {
  const w = buildInputs(load('yield'), DEFAULT_STATE);
  assert.equal(w.w6.rows.find((r) => r.label.startsWith('이상 비율')).target, 3);
  assert.equal(buildInputs(load('yield', { ab_target: 5 }), DEFAULT_STATE).w6.rows.find((r) => r.label.startsWith('이상 비율')).target, 5);
});

test('diffParams · customParams · settingsNote', () => {
  const d = read('alarm', 'domain.json');
  const base = paramValues(d, {});
  assert.deepEqual(diffParams(d, base, paramValues(d, { esc_h: 24, done_target: 90 })), [
    { key: 'esc_h', label: '에스컬레이션 기준', unit: '시간', from: '48시간', to: '24시간' },
    { key: 'done_target', label: '조치 완료율 목표', unit: '%', from: '85%', to: '90%' },
  ]);
  assert.deepEqual(customParams(load('alarm')), []);
  assert.equal(customParams(load('alarm', { esc_h: 24 })).length, 1);
  assert.equal(settingsNote(load('alarm')), '');
  assert.equal(settingsNote(load('alarm', { esc_h: 24 })), '기준값 사용자 설정 적용(에스컬레이션 기준 24시간)');
  assert.equal(settingsNote(load('alarm', { esc_h: 24, done_target: 90, ctl_k: 2 })), '기준값 사용자 설정 적용(에스컬레이션 기준 24시간 외 2개)');
  const pw = read('power', 'domain.json');
  assert.deepEqual(diffParams(pw, paramValues(pw, {}), paramValues(pw, { skip_outage: false }))[0].to, '끔');
  const pu = read('purchase', 'domain.json');
  assert.equal(diffParams(pu, paramValues(pu, {}), paramValues(pu, { basis: 'cal_delay' }))[0].to, '달력일');
});

test('whatIf 알람: 에스컬레이션 기준 48 → 24시간', () => {
  const r = whatIf(load('alarm'), { esc_h: 24 });
  assert.deepEqual(r.changed.map((c) => [c.key, c.from, c.to]), [['esc_h', '48시간', '24시간']]);
  const esc = r.metrics.find((m) => m.key === 'esc');
  assert.deepEqual([esc.label, esc.before, esc.after, esc.diff], ['에스컬레이션 대상', 77, 93, 16]);
  assert.equal(r.flips.count, 16);
  assert.equal(r.flips.has, true);
  assert.deepEqual(r.flips.moves, [{ from: '기한 내', to: '에스컬레이션', n: 16 }]);
  assert.equal(r.flips.rows.length, 10);
  assert.deepEqual(Object.keys(r.flips.rows[0]).sort(), ['after', 'before', 'id', 'title']);
  assert.equal(r.flips.rows[0].before, '기한 내');
  assert.equal(r.flips.rows[0].after, '에스컬레이션');
  assert.equal(r.metrics.length, 5); // 지표 4 + 관리도 한계 밖 점
  assert.equal(r.metrics.at(-1).key, '_control');
});

test('whatIf: 바꾼 게 없으면 차이 0 · 틀린 값은 지금 값으로 · 목표만 바꾸면 값은 그대로 목표가 바뀜', () => {
  const ctx = load('alarm');
  const same = whatIf(ctx, {});
  assert.equal(same.changed.length, 0);
  assert.equal(same.flips.count, 0);
  assert.ok(same.metrics.every((m) => m.diff === 0 || m.diff === null));
  const bad = whatIf(ctx, { esc_h: 0 });
  assert.equal(bad.changed.length, 0);
  assert.equal(bad.flips.count, 0);
  const t = whatIf(ctx, { done_target: 90 });
  const dr = t.metrics.find((m) => m.key === 'doneRate');
  assert.equal(dr.diff, 0);
  assert.deepEqual([dr.targetBefore, dr.targetAfter], [85, 90]);
  assert.equal(t.flips.count, 0);
  // 지금 기준이 이미 저장값이면 그것이 "지금"
  const saved = whatIf(load('alarm', { esc_h: 24 }), { esc_h: 48 });
  assert.deepEqual(saved.changed.map((c) => [c.from, c.to]), [['24시간', '48시간']]);
  assert.equal(saved.metrics.find((m) => m.key === 'esc').diff, -16);
});

test('whatIf 수율: 이상 기준 -2.5 → -3.5 는 이상 9건이 주의로(기간 14일 안)', () => {
  const r = whatIf(load('yield'), { yield_bad: -3.5 });
  assert.deepEqual(r.flips.moves, [{ from: '이상', to: '주의', n: 9 }]);
  assert.equal(r.flips.count, 9);
  const ab = r.metrics.find((m) => m.key === 'abnormal');
  assert.equal(ab.diff, ab.after - ab.before);
  assert.ok(ab.after < ab.before);
});

test('whatIf 전력: 정전 구간을 이상으로 보면 16칸이 이상으로', () => {
  const r = whatIf(load('power'), { skip_outage: false });
  assert.deepEqual(r.flips.moves, [{ from: '정전 구간', to: '이상', n: 16 }]);
  assert.deepEqual(r.metrics.filter((m) => m.key === 'abnormal').map((m) => [m.before, m.after, m.diff]), [[48, 64, 16]]);
});

test('whatIf 구매: 지연으로 보는 초과 영업일과 영업일/달력일 기준', () => {
  const r = whatIf(load('purchase'), { late_grace: 2, basis: 'cal_delay' });
  assert.deepEqual(r.changed.map((c) => c.key).sort(), ['basis', 'late_grace']);
  assert.deepEqual(r.flips.moves, [{ from: '지연', to: '정시', n: 4 }]); // 입고된 발주만 기준 열을 따르고 납기 초과는 항상 영업일
  assert.equal(r.flips.count, 4);
});

test('판정 없는 도메인은 flips.has=false (기준값만 비교)', () => {
  const d = read('alarm', 'domain.json');
  delete d.judge;
  const r = whatIf(makeCtx(d, read('alarm', 'sample.json')), { done_target: 90 });
  assert.equal(r.flips.has, false);
  assert.equal(r.flips.count, 0);
});

test('makeSettingsRecord: 사유 필수 · 바뀐 항목마다 한 줄 · 이전→이후', () => {
  const d = read('alarm', 'domain.json');
  const none = makeSettingsRecord(d, { values: {}, history: [] }, { esc_h: 24 }, '  ', '2026-10-29 09:00');
  assert.deepEqual(none.errors, { _reason: '사유를 한 줄 적으세요.' });
  const same = makeSettingsRecord(d, { values: {}, history: [] }, { esc_h: 48 }, '그대로', '2026-10-29 09:00');
  assert.deepEqual(same.errors, { _: '바꾼 값이 없습니다.' });
  const bad = makeSettingsRecord(d, { values: {}, history: [] }, { esc_h: 0 }, '사유', '2026-10-29 09:00');
  assert.deepEqual(bad.errors, { esc_h: '1~336시간 사이로 입력하세요.' });
  const ok = makeSettingsRecord(d, { values: {}, history: [{ ts: '2026-10-28 10:00', key: 'ctl_k', label: '관리도 폭(σ)', unit: 'σ', from: '1.5σ', to: '2σ', reason: '이전' }] }, { esc_h: 24, done_target: 90 }, ' 야간 인수인계 기준 변경 ', '2026-10-29 09:00');
  assert.equal(ok.errors, undefined);
  assert.deepEqual(ok.saved.values, { esc_h: 24, util_target: 92, done_target: 90, ctl_k: 1.5 });
  assert.equal(ok.saved.history.length, 3);
  assert.deepEqual(ok.saved.history.at(-1), { ts: '2026-10-29 09:00', key: 'done_target', label: '조치 완료율 목표', unit: '%', from: '85%', to: '90%', reason: '야간 인수인계 기준 변경' });
});

test('domain.json 에 params 가 없으면 아무 일도 없다', () => {
  const ctx = load('education');
  assert.deepEqual(paramDefs(ctx.d), []);
  assert.deepEqual(ctx.settings, {});
  assert.equal(settingsNote(ctx), '');
  assert.equal(whatIf(ctx, { a: 1 }).metrics.length > 0, true);
});
