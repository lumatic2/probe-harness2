// 실행: node --test starter/domains/xlsx.test.mjs
// 엑셀 내보내기(xlsx.mjs): 무압축 zip · SpreadsheetML 을 손으로 쓴 기대값과 비교한다. 진짜 엑셀 파일로 열리는지는 prelim2-kit/tests/test_xlsx.py(openpyxl)가 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCtx } from './core.mjs';
import { buildReportWorkbook, buildXlsx, crc32, excelSerial, filterParts, sheetName, xlsxFileName, zipStore } from './xlsx.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dom = JSON.parse(fs.readFileSync(path.join(here, 'alarm', 'domain.json'), 'utf8'));
const ROWS = [
  { alarm_id: 'ALM-1', equip: 'EQP-101', proc: '식각', code: 'E-101', severity: '긴급', ts: '2026-10-28T09:00:00', status: '미조치', owner: '담당 A조' },
  { alarm_id: 'ALM-2', equip: 'EQP-102', proc: '식각', code: 'E-102', severity: '주의', ts: '2026-10-27T10:30:00', status: '완료', owner: '담당 B조 & C조' },
  { alarm_id: 'ALM-3', equip: 'EQP-201', proc: '증착', code: 'D-201', severity: '긴급', ts: '2026-10-26', status: '완료', owner: '담당 C조' },
];
const ctx = makeCtx(dom, { rows: ROWS, series: [] });
const STATE = { period: '3d', group: '전체' };
const vals = (rows) => rows.map((r) => r.map((c) => (c && typeof c === 'object' ? c.v : c)));

// 저장(무압축) zip 읽기 — 테스트용 최소 구현. 이름 → 내용 글자
function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = {}; const order = [];
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const method = dv.getUint16(p + 8, true), crc = dv.getUint32(p + 14, true), size = dv.getUint32(p + 18, true);
    const nl = dv.getUint16(p + 26, true), el = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nl));
    const body = bytes.subarray(p + 30 + nl + el, p + 30 + nl + el + size);
    assert.equal(method, 0, `${name} 은 무압축`);
    assert.equal(crc32(body), crc, `${name} crc`);
    out[name] = new TextDecoder().decode(body); order.push(name);
    p += 30 + nl + el + size;
  }
  assert.equal(dv.getUint32(p, true), 0x02014b50, '중앙 디렉터리가 이어진다');
  return { files: out, order };
}

test('crc32: 표준 시험값 "123456789" = CBF43926', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('날짜 → 엑셀 일련번호: 1900-03-01 = 61, 2026-10-28 = 46323, 09:00 = .375', () => {
  assert.equal(excelSerial('1900-03-01'), 61);
  assert.equal(excelSerial('2026-10-28'), 46323);
  assert.equal(excelSerial('2026-10-28T09:00:00'), 46323.375);
  assert.equal(excelSerial('2026-10-28 18:00'), 46323.75);
  assert.equal(excelSerial(''), null);
  assert.equal(excelSerial('어제'), null);
});

test('시트 이름: 31자 · 금지 문자 [ ] : * ? / \\ 제거 · 비면 「시트」', () => {
  assert.equal(sheetName('요약'), '요약');
  assert.equal(sheetName('a/b:c*d?e[f]g\\h'), 'abcdefgh');
  assert.equal(sheetName('가'.repeat(40)), '가'.repeat(31));
  assert.equal(sheetName('///'), '시트');
});

test('zip: 파일 순서·내용 보존', () => {
  const z = zipStore([{ name: 'a.txt', data: new TextEncoder().encode('한글 abc') }, { name: 'dir/b.txt', data: new Uint8Array([1, 2, 3]) }]);
  const { files, order } = unzip(z);
  assert.deepEqual(order, ['a.txt', 'dir/b.txt']);
  assert.equal(files['a.txt'], '한글 abc');
});

test('buildXlsx: 필수 파트 · 시트 이름 · 굵은 머리글 · 열 너비 · 숫자/날짜/글자 칸', () => {
  const bytes = buildXlsx([
    { name: '요약', widths: [20, 10], rows: [[{ v: '제목', bold: true }, null], ['값', 3.5]] },
    { name: '데이터', widths: [12], freeze: true, filter: true, rows: [[{ v: '날짜', bold: true }], [{ v: 46323.375, kind: 'datetime' }], [{ v: 46323, kind: 'date' }], [{ v: 1234.5, kind: 'num', dec: 1 }], ['A & <B>']] },
  ]);
  const { files, order } = unzip(bytes);
  assert.equal(order[0], '[Content_Types].xml');
  for (const n of ['_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) assert.ok(files[n], n);
  assert.match(files['xl/workbook.xml'], /<sheet name="요약" sheetId="1" r:id="rId1"\/><sheet name="데이터" sheetId="2" r:id="rId2"\/>/);
  const s1 = files['xl/worksheets/sheet1.xml'];
  assert.match(s1, /<col min="1" max="1" width="20" customWidth="1"\/>/);
  assert.match(s1, /<c r="A1" s="1" t="inlineStr"><is><t>제목<\/t><\/is><\/c>/);
  assert.match(s1, /<c r="B2" s="0"><v>3.5<\/v><\/c>/);
  const s2 = files['xl/worksheets/sheet2.xml'];
  assert.match(s2, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(s2, /<autoFilter ref="A1:A5"\/>/);
  assert.match(s2, /<c r="A2" s="3"><v>46323.375<\/v><\/c>/);
  assert.match(s2, /<c r="A3" s="2"><v>46323<\/v><\/c>/);
  assert.match(s2, /<c r="A5" s="0" t="inlineStr"><is><t>A &amp; &lt;B&gt;<\/t><\/is><\/c>/);
  assert.match(files['xl/styles.xml'], /<b\/>/);
  assert.match(files['xl/styles.xml'], /formatCode="yyyy-mm-dd hh:mm"/);
  assert.match(files['xl/styles.xml'], /formatCode="#,##0.0"/);
});

test('파일 이름: <도메인 제목>-<기준일>-<필터>.xlsx, 파일 이름에 못 쓰는 글자는 뺀다', () => {
  assert.equal(xlsxFileName(ctx, ['최근 3일', '전체 공정']), '팹 장비 운영 현황-2026-10-28-최근 3일_전체 공정.xlsx');
  assert.equal(xlsxFileName(ctx, ['검색 a/b:c*d']), '팹 장비 운영 현황-2026-10-28-검색 abcd.xlsx');
  assert.equal(xlsxFileName(ctx, []), '팹 장비 운영 현황-2026-10-28.xlsx');
});

test('필터 조각: 기간 · 그룹 · 검색어 · 열 필터 · 덧붙임 순서', () => {
  assert.deepEqual(filterParts(ctx, STATE), ['최근 3일', '전체 공정']);
  assert.deepEqual(filterParts(ctx, { period: '7d', group: '식각', q: 'EQP', f_severity: '긴급' }, ['미조치 탭']), ['최근 7일', '식각 공정', '검색 EQP', '심각도 긴급', '미조치 탭']);
});

test('리포트 통합 문서: 요약 시트(지표 표) + 데이터 시트(필터된 행), 한글·숫자·날짜 칸', () => {
  const sheets = buildReportWorkbook(ctx, STATE, { rows: ROWS, keys: ['alarm_id', 'equip', 'ts', 'owner'] });
  assert.deepEqual(sheets.map((s) => s.name), ['요약', '데이터']);
  const sum = vals(sheets[0].rows);
  assert.deepEqual(sum[0], ['팹 장비 운영 현황']);
  assert.deepEqual(sum[1], ['데이터 기준', '2026-10-28 09:00']);
  assert.deepEqual(sum[2], ['적용 필터', '최근 3일 · 전체 공정']);
  assert.deepEqual(sum[3], ['내보낸 알람(건)', 3]);
  const head = sum.findIndex((r) => r[0] === '지표');
  assert.deepEqual(sum[head], ['지표', '값']);
  assert.deepEqual(sum.slice(head + 1), [
    ['평균 가동률(%)', null], ['알람 건수(건)', 3], ['긴급 알람(건)', 2], ['미조치(건)', 1], ['조치 완료율(%)', 66.66666666666666], ['일 평균 알람(건)', 1], ['에스컬레이션 대상(건)', 0],
  ]);
  assert.deepEqual(vals(sheets[1].rows), [
    ['알람', '장비', '발생 시각', '담당'],
    ['ALM-1', 'EQP-101', 46323.375, '담당 A조'],
    ['ALM-2', 'EQP-102', 46322.4375, '담당 B조 & C조'],
    ['ALM-3', 'EQP-201', 46321, '담당 C조'],
  ]);
  assert.equal(sheets[1].rows[0][0].bold, true);
  assert.equal(sheets[1].rows[1][2].kind, 'datetime');
  assert.equal(sheets[1].rows[3][2].kind, 'date');
});

test('리포트 통합 문서: 조건 A/B 비교가 있으면 요약 표가 조건 A · 조건 B · 차이', () => {
  const ma = { _n: 3, util: null, count: 3, urgent: 2, open: 1, doneRate: 50, perDay: 1 };
  const mb = { _n: 2, util: null, count: 2, urgent: 1, open: 1, doneRate: 25, perDay: 0.5 };
  const sheets = buildReportWorkbook(ctx, STATE, { rows: ROWS, keys: ['alarm_id'], cmp: [ma, mb] });
  const sum = vals(sheets[0].rows);
  const head = sum.findIndex((r) => r[0] === '지표');
  assert.deepEqual(sum[head], ['지표', '조건 A', '조건 B', '차이']);
  assert.deepEqual(sum[head + 1], ['평균 가동률(%)', null, null, null]);
  assert.deepEqual(sum[head + 3], ['긴급 알람(건)', 2, 1, 1]);
  assert.deepEqual(sum[head + 5], ['조치 완료율(%)', 50, 25, 25]);
});
