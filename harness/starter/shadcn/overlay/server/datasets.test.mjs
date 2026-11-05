// 실행: node --test starter/shadcn/overlay/server/datasets.test.mjs   (앱 안에서는 node --test server/*.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatasets, parseCsv, validateFiles } from './datasets.mjs';

const schema = { files: { 'stops.csv': { required: ['stop_id', 'name', 'lat', 'lon'], key: 'stop_id', types: { lat: 'number', lon: 'number' } }, 'employees.csv': { required: ['emp_id', 'stop_id'], key: 'emp_id', refs: { stop_id: 'stops.csv:stop_id' }, types: { shift: 'enum:주간|야간' } }, 'holidays.csv': { types: { date: 'date' } } }, optionalFiles: ['holidays.csv'] };
const good = { 'stops.csv': 'stop_id,name,lat,lon\nS1,"지점, 1",37.1,127.1\nS2,지점 2,37.2,127.2\n', 'employees.csv': 'emp_id,stop_id,shift\nE1,S1,주간\nE2,S2,야간\n' };

test('parseCsv — 따옴표 안 쉼표·BOM·끝 빈 줄', () => {
  const t = parseCsv('﻿a,b\n1,"x, y"\n\n');
  assert.deepEqual(t.headers, ['a', 'b']);
  assert.deepEqual(t.rows, [['1', 'x, y']]);
});

test('validateFiles — 정상 묶음은 ok, 선택 파일은 없어도 됨', () => {
  const v = validateFiles(good, schema);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.deepEqual(v.summary.map((s) => [s.file, s.rows]), [['stops.csv', 2], ['employees.csv', 2]]);
});

test('validateFiles — 필수 열 누락 · 없는 ID 참조 · 형식 오류 · 중복 키 · 필수 파일 없음을 파일·행·열·이유로 알린다', () => {
  const bad = { 'stops.csv': 'stop_id,name,lat\nS1,a,37.1\nS1,b,abc\n', 'employees.csv': 'emp_id,stop_id,shift\nE1,S9,주간\nE2,S1,오후\n' };
  const v = validateFiles(bad, schema);
  assert.equal(v.ok, false);
  const reasons = v.errors.map((e) => `${e.file}:${e.line}:${e.column}:${e.reason}`);
  assert.ok(reasons.some((r) => r.startsWith('stops.csv:1:lon:필수 열이 없습니다')), reasons.join('\n'));
  assert.ok(reasons.some((r) => r.startsWith('stops.csv:3:stop_id:중복 키')));
  assert.ok(reasons.some((r) => r.startsWith('stops.csv:3:lat:숫자 형식')));
  assert.ok(reasons.some((r) => r.startsWith('employees.csv:2:stop_id:stops.csv 에 없는 stop_id')));
  assert.ok(reasons.some((r) => r.startsWith('employees.csv:3:shift:허용 값이 아닙니다')));
  const v2 = validateFiles({ 'stops.csv': good['stops.csv'] }, schema);
  assert.ok(v2.errors.some((e) => e.file === 'employees.csv' && e.reason === '필수 파일이 없습니다'));
});

test('validateFiles — schema 가 없으면 머리글·열 수만 본다', () => {
  assert.equal(validateFiles({ 'x.csv': 'a,b\n1,2\n' }, null).ok, true);
  const v = validateFiles({ 'x.csv': 'a,b\n1\n' }, null);
  assert.equal(v.ok, false);
  assert.match(v.errors[0].reason, /열 수가 머리글/);
});

test('createDatasets — 목록 · 검증 · 적용(실패면 409 로 기존 유지) · currentDir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-'));
  const DIR = path.join(root, 'data', 'datasets');
  fs.mkdirSync(path.join(DIR, 'set-a'), { recursive: true });
  fs.mkdirSync(path.join(DIR, 'set-bad'), { recursive: true });
  fs.writeFileSync(path.join(DIR, 'schema.json'), JSON.stringify(schema));
  for (const [f, t] of Object.entries(good)) fs.writeFileSync(path.join(DIR, 'set-a', f), t);
  fs.writeFileSync(path.join(DIR, 'set-bad', 'stops.csv'), 'stop_id\nS1\n');
  const ds = createDatasets({ root, now: () => new Date(2026, 9, 31, 9, 5) });
  const l = ds.list();
  assert.equal(l.status, 200);
  assert.deepEqual(l.json.items.map((i) => i.name), ['set-a', 'set-bad']);
  assert.equal(l.json.current, null);
  assert.equal(ds.validate({ name: 'set-a' }).json.ok, true);
  assert.equal(ds.validate({ name: '../x' }).status, 404);
  assert.equal(ds.validate({ name: 'nope' }).status, 404);
  const a = ds.apply({ name: 'set-a' });
  assert.equal(a.status, 200);
  assert.equal(ds.current().name, 'set-a');
  assert.equal(ds.current().at, '2026-10-31 09:05:00');
  const b = ds.apply({ name: 'set-bad' });
  assert.equal(b.status, 409);
  assert.ok(b.json.errors.length > 0);
  assert.equal(ds.current().name, 'set-a', '실패한 적용은 기존을 바꾸지 않는다');
  assert.equal(ds.currentDir(), path.join(DIR, 'set-a'));
  assert.deepEqual(Object.keys(ds.readFiles(ds.currentDir())), ['employees.csv', 'stops.csv']);
  fs.rmSync(root, { recursive: true, force: true });
});
