// 실행: node --test starter/shadcn/overlay/server/run.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRun, RESULT_FILE } from './run.mjs';
import { runEngine } from './engine.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout'); await wait(20); } };

test('실행 → 진행 → 완료: 상태가 바뀌고 결과가 파일로 남고, 실행 중 재실행은 409', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-'));
  const engine = async ({ params, files, report }) => { report(10, '읽기'); await wait(50); report(60, '계산'); await wait(50); return { summary: [{ label: '행', value: Object.keys(files).length }], echo: params }; };
  const datasets = { current: () => ({ name: 'set-a' }), currentDir: () => '/x', readFiles: () => ({ 'a.csv': 'h\n1\n' }) };
  const run = createRun({ root, engine, datasets });
  assert.equal(run.status().json.state, 'idle');
  assert.equal(run.start({ params: { capacity: 45 } }).status, 200);
  assert.equal(run.start({}).status, 409);
  await until(() => run.status().json.step === '계산');
  assert.equal(run.status().json.state, 'running');
  assert.equal(run.status().json.progress, 60);
  await until(() => run.status().json.state === 'done');
  const s = run.status().json;
  assert.equal(s.progress, 100);
  assert.equal(s.dataset, 'set-a');
  assert.deepEqual(s.result.echo, { capacity: 45 });
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'data', 'store', RESULT_FILE), 'utf8'));
  assert.equal(saved.dataset, 'set-a');
  assert.equal(saved.result.summary[0].value, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('엔진이 던지면 error 상태 + 메시지, 결과 파일은 이전 것 그대로', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-'));
  const run = createRun({ root, engine: async () => { throw new Error('정원이 0 입니다'); } });
  run.start({ params: {} });
  await until(() => run.status().json.state === 'error');
  assert.equal(run.status().json.error, '정원이 0 입니다');
  assert.equal(run.readResult(), null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('모의 엔진 — 파일 수·행 수 요약과 그래프를 돌려주고 mock:true', async () => {
  const steps = [];
  const r = await runEngine({ params: { days: 5 }, datasetDir: null, files: { 'a.csv': 'h\n1\n2\n', 'b.csv': 'h\n1\n' }, report: (p, s) => steps.push(s) });
  assert.equal(r.mock, true);
  assert.equal(steps.length, 5);
  assert.deepEqual(r.summary.slice(0, 2).map((x) => x.value), [2, 3]);
  assert.equal(r.graph.nodes.length, 3);
  assert.equal(r.graph.edges.length, 2);
});
