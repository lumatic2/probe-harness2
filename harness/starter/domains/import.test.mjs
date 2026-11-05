// 실행: node --test starter/domains/import.test.mjs
// CSV 올리기(#/import)의 공용 순수 함수(import.mjs · csv.mjs)를 손으로 쓴 기대값과 비교한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './csv.mjs';
import { scanCsv } from './csv.mjs';
import { applyImported, autoMap, canRevert, decodeBytes, fitsStore, mergeRows, readTable, requiredKeys, revertRecord, validateRows } from './import.mjs';
import { makeCtx } from './core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dom = (n) => JSON.parse(fs.readFileSync(path.join(here, n, 'domain.json'), 'utf8'));
const alarm = dom('alarm');
const enc = (s) => new TextEncoder().encode(s);

test('CSV 파서: 줄 번호는 따옴표 안 줄바꿈을 센 파일 줄 기준, 빈 줄은 건너뛴다', () => {
  const recs = scanCsv('a,b\n1,"x\ny"\n\n2,z\n');
  assert.deepEqual(recs.map((r) => r.line), [1, 2, 5]);
  assert.deepEqual(recs[1].cells, ['1', 'x\ny']);
  assert.deepEqual(parseCsv('a,b\n1,2'), [{ a: '1', b: '2' }]);
});

test('인코딩: UTF-8 · BOM · CP949 · UTF-16 를 구분해 읽는다', () => {
  assert.deepEqual(decodeBytes(enc('가,나')), { text: '가,나', encoding: 'UTF-8' });
  assert.deepEqual(decodeBytes(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61])), { text: 'a', encoding: 'UTF-8 (BOM)' });
  // CP949: "가나" = B0 A1 B3 AA
  assert.deepEqual(decodeBytes(Uint8Array.from([0xb0, 0xa1, 0xb3, 0xaa])), { text: '가나', encoding: 'CP949' });
  assert.deepEqual(decodeBytes(Uint8Array.from([0xff, 0xfe, 0x61, 0x00, 0x09, 0x00, 0x62, 0x00])), { text: 'a\tb', encoding: 'UTF-16' });
});

test('구분자: 쉼표 · 탭 · 세미콜론을 첫 줄에서 고른다', () => {
  assert.deepEqual(readTable('a\tb\n1\t2').headers, ['a', 'b']);
  assert.deepEqual(readTable('a;b;c\n1;2;3').rows[0].cells, ['1', '2', '3']);
  assert.equal(readTable('').headers.length, 0);
});

test('열 맞추기: key 또는 label 이 같으면 자동 대응, 못 맞춘 열은 -1, 한 머리글은 한 열에만', () => {
  const m = autoMap(alarm, ['알람', 'equip', '심각도', '발생 시각', '공정', '무관', '상태']);
  assert.equal(m.alarm_id, 0);
  assert.equal(m.equip, 1);
  assert.equal(m.severity, 2);
  assert.equal(m.ts, 3);
  assert.equal(m.proc, 4);
  assert.equal(m.status, 6);
  assert.equal(m.code, -1);
  assert.equal(m.owner, -1);
  assert.ok(!('goal' in m), '가상 열(virtual)은 올리지 않는다');
  // 띄어쓰기·대소문자 차이는 두 번째 단계에서 맞춘다
  assert.equal(autoMap(alarm, ['ALARM_ID', 'Equip']).alarm_id, 0);
  assert.equal(autoMap(alarm, ['발생시각']).ts, 0);
});

test('필수 열: 번호 열과 날짜 열', () => {
  assert.deepEqual(requiredKeys(alarm), ['alarm_id', 'ts']);
  assert.deepEqual(requiredKeys({ ...alarm, import: { required: ['code'] } }), ['code']);
});

const OK_HEAD = '알람,장비,공정,코드,심각도,발생 시각,상태,담당';
const check = (csv, opts) => {
  const t = readTable(csv);
  const map = autoMap(alarm, t.headers);
  return validateRows(alarm, t, map, opts);
};

test('검증: 정상 행은 형 변환·날짜 정규화되어 레코드가 된다', () => {
  const r = check(`${OK_HEAD}\nALM-9001,EQP-101,식각,E-101,긴급,2026/10/28 9:05,미조치,담당 A조\nALM-9002,EQP-102,증착,D-201,주의,2026-10-28T10:00:00,완료,`);
  assert.equal(r.errors.length, 0);
  assert.equal(r.okCount, 2);
  assert.deepEqual(r.okRows[0], { alarm_id: 'ALM-9001', equip: 'EQP-101', proc: '식각', code: 'E-101', severity: '긴급', ts: '2026-10-28T09:05:00', status: '미조치', owner: '담당 A조' });
  assert.equal(r.okRows[1].ts, '2026-10-28T10:00:00');
  assert.equal(r.okRows[1].owner, undefined);
});

test('검증: 빈 필수칸 · 잘못된 enum · 날짜 오류 · 중복 ID 를 행 번호·열·값·이유로 낸다', () => {
  const r = check([
    OK_HEAD,
    'ALM-9001,EQP-101,식각,E-101,긴급,2026-10-28 09:00,미조치,담당 A조', // 줄 2 정상
    ',EQP-101,식각,E-101,긴급,2026-10-28 09:00,미조치,', // 줄 3 번호 빈칸
    'ALM-9003,EQP-101,식각,E-101,매우긴급,2026-10-28 09:00,미조치,', // 줄 4 enum
    'ALM-9004,EQP-101,식각,E-101,주의,2026-02-30,미조치,', // 줄 5 날짜 없는 날
    'ALM-9005,EQP-101,식각,E-101,주의,어제,미조치,', // 줄 6 날짜 아님
    'ALM-9001,EQP-101,식각,E-101,주의,2026-10-28 09:00,미조치,', // 줄 7 중복
  ].join('\n'));
  assert.equal(r.total, 6);
  assert.equal(r.okCount, 1);
  assert.equal(r.errorRowCount, 5);
  assert.deepEqual(r.errors.map((e) => [e.line, e.key, e.value]), [
    [3, 'alarm_id', ''], [4, 'severity', '매우긴급'], [5, 'ts', '2026-02-30'], [6, 'ts', '어제'], [7, 'alarm_id', 'ALM-9001'],
  ]);
  assert.equal(r.errors[0].reason, '필수 칸이 비어 있음');
  assert.equal(r.errors[1].reason, '허용 값이 아님 (긴급 · 주의 · 정보)');
  assert.equal(r.errors[2].reason, '없는 날짜');
  assert.equal(r.errors[3].reason, '날짜 형식이 아님 (예: 2026-10-28 또는 2026-10-28 09:00)');
  assert.equal(r.errors[4].reason, '같은 ID 가 2행에 이미 있음');
  assert.equal(r.errors[0].label, '알람');
});

test('검증: 덧붙이기에서는 기존 데이터의 ID 와 겹치면 오류', () => {
  const csv = `${OK_HEAD}\nALM-0001,EQP-101,식각,E-101,긴급,2026-10-28 09:00,미조치,`;
  assert.equal(check(csv).okCount, 1);
  const r = check(csv, { existingIds: new Set(['ALM-0001']) });
  assert.equal(r.okCount, 0);
  assert.equal(r.errors[0].reason, '기존 데이터에 같은 ID 가 있음');
});

test('검증: 필수 열을 못 맞추면 행 검증 없이 막는다', () => {
  const r = check('장비,공정\nEQP-101,식각');
  assert.deepEqual(r.missingRequired, ['alarm_id', 'ts']);
  assert.equal(r.blocked, true);
  assert.equal(r.okCount, 0);
});

test('숫자·태그 형: 천 단위 쉼표 제거, 숫자 아님은 오류, 태그는 ; 로 나눈다', () => {
  const d = dom('purchase');
  const t = readTable('po_id,item,req,promised,amount\nPO-1,A,2026-09-01,2026-09-05,"1,077"\nPO-2,B,2026-09-01,2026-09-05,열');
  const r = validateRows(d, t, autoMap(d, t.headers));
  assert.equal(r.okRows[0].amount, 1077);
  assert.deepEqual(r.errors.map((e) => [e.line, e.key, e.reason]), [[3, 'amount', '숫자가 아님']]);
  const docs = dom('documents');
  const t2 = readTable('doc_id,received,tags\nD-1,2026-10-01,회로 설계;소자');
  assert.deepEqual(validateRows(docs, t2, autoMap(docs, t2.headers)).okRows[0].tags, ['회로 설계', '소자']);
});

test('반영: 바꾸기 · 덧붙이기, 저장 크기 상한, 되돌리기 한 벌', () => {
  assert.deepEqual(mergeRows([{ a: 1 }], [{ a: 2 }], 'replace'), [{ a: 2 }]);
  assert.deepEqual(mergeRows([{ a: 1 }], [{ a: 2 }], 'append'), [{ a: 1 }, { a: 2 }]);
  assert.equal(fitsStore({ rows: [{ a: 'x' }] }), true);
  assert.equal(fitsStore({ rows: [{ a: 'x'.repeat(1_050_000) }] }), false);
  assert.equal(canRevert({}), false);
  assert.equal(canRevert({ original: true }), true);
  assert.equal(canRevert({ rows: [] }), true);
  assert.deepEqual(revertRecord({ original: true }), {});
  assert.deepEqual(revertRecord({ rows: [{ a: 1 }], meta: { m: 1 } }), { rows: [{ a: 1 }], meta: { m: 1 } });
});

test('반영된 데이터가 샘플보다 우선한다 — rows 만 바꾸고 나머지 샘플 칸은 그대로', () => {
  const sample = { rows: [{ alarm_id: 'A' }], series: [1, 2] };
  assert.deepEqual(applyImported(sample, {}), sample);
  assert.deepEqual(applyImported(sample, null), sample);
  assert.deepEqual(applyImported(sample, { rows: [{ alarm_id: 'B' }, { alarm_id: 'C' }] }), { rows: [{ alarm_id: 'B' }, { alarm_id: 'C' }], series: [1, 2] });
  const ctx = makeCtx(alarm, applyImported({ rows: [] }, { rows: [{ alarm_id: 'B', severity: '긴급' }] }));
  assert.equal(ctx.rows[0].goal, 30, '가상 열은 반영된 행에도 다시 계산된다');
});

test('시험용 CSV 3종(alarm/import-samples): 정상 UTF-8 24행 · CP949 한글 24행 · 오류 섞임 18행 중 5행 오류', () => {
  const run = (f) => {
    const { text, encoding } = decodeBytes(fs.readFileSync(path.join(here, 'alarm', 'import-samples', f)));
    const t = readTable(text);
    return { encoding, headers: t.headers, r: validateRows(alarm, t, autoMap(alarm, t.headers)) };
  };
  const ok = run('ok-utf8.csv');
  assert.deepEqual([ok.encoding, ok.r.total, ok.r.okCount, ok.r.errors.length], ['UTF-8', 24, 24, 0]);
  const cp = run('korean-cp949.csv');
  assert.deepEqual([cp.encoding, cp.r.okCount, cp.headers[5], cp.r.okRows[0].proc.length > 0], ['CP949', 24, '발생 시각', true]);
  assert.match(cp.r.okRows[0].ts, /^2026-10-2\dT0\d:\d\d:00$/, '2026/10/28 9:05 꼴 날짜가 정규화된다');
  const bad = run('errors-utf8.csv');
  assert.deepEqual([bad.r.total, bad.r.okCount, bad.r.errorRowCount], [18, 13, 5]);
  assert.deepEqual(bad.r.errors.map((e) => [e.line, e.key]), [[5, 'alarm_id'], [7, 'severity'], [10, 'ts'], [13, 'ts'], [16, 'alarm_id']]);
  assert.equal(autoMap(alarm, bad.headers).status, -1, '처리상태 머리글은 자동으로 못 맞춘다(화면에서 직접 지정)');
});

test('명령줄 변환기와 같은 규칙: csv-to-sample 이 오류 행은 빼고 같은 변환으로 sample.json 을 쓴다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c2s-'));
  try {
    // 복사본 폴더에서 돌린다(원본 sample.json 을 건드리지 않는다)
    for (const f of ['csv-to-sample.mjs', 'csv.mjs', 'import.mjs']) fs.copyFileSync(path.join(here, f), path.join(tmp, f));
    fs.mkdirSync(path.join(tmp, 'alarm'));
    fs.copyFileSync(path.join(here, 'alarm', 'domain.json'), path.join(tmp, 'alarm', 'domain.json'));
    const csv = path.join(tmp, 'a.csv');
    fs.writeFileSync(csv, `${OK_HEAD}
ALM-9001,EQP-101,식각,E-101,긴급,2026/10/28 9:05,미조치,담당 A조
ALM-9002,EQP-101,식각,E-101,매우긴급,2026-10-28 09:00,미조치,
`, 'utf8');
    const r = spawnSync(process.execPath, [path.join(tmp, 'csv-to-sample.mjs'), 'alarm', csv], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(fs.readFileSync(path.join(tmp, 'alarm', 'sample.json'), 'utf8'));
    assert.equal(out.rows.length, 1);
    assert.equal(out.rows[0].ts, '2026-10-28T09:05:00');
    assert.match(r.stderr, /건너뜀 1행/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
