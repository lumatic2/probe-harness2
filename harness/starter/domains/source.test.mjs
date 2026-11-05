import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource, validateSource } from './source.mjs';
const domain = { roles: { id: 'id', date: 'date' }, cols: [{ key: 'date', type: 'date' }, { key: 'amount', type: 'number' }], dataSource: { url: '/api/result-demo' } };
const row = { id: 'A', date: '2026-10-30', amount: 0 };
test('static data remains unchanged without a source configuration', async () => {
  const seed = { rows: [row] };
  assert.equal(await loadSource({}, seed, () => { throw new Error('must not fetch'); }), seed);
});
test('real response replaces seed completely, including supplemental chart data', async () => {
  const result = { rows: [row] };
  const actual = await loadSource(domain, { rows: [], series: [{ fake: true }] }, async (url, options) => {
    assert.equal(url, '/api/result-demo'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => result };
  });
  assert.equal(actual, result); assert.equal(actual.series, undefined);
});
test('empty API results stay empty, never show the seed', async () => {
  assert.deepEqual(await loadSource(domain, { rows: [row] }, async () => ({ ok: true, json: async () => ({ rows: [] }) })), { rows: [] });
});
test('404, auth failure and server failure reject rather than falling back', async () => {
  for (const status of [401, 403, 404, 500]) await assert.rejects(loadSource(domain, { rows: [row] }, async () => ({ ok: false, status })), new RegExp(String(status)));
});
test('network or JSON failure is visible to the caller', async () => {
  await assert.rejects(loadSource(domain, {}, async () => { throw new Error('network'); }), /network/);
  await assert.rejects(loadSource(domain, {}, async () => ({ ok: true, json: async () => { throw new Error('json'); } })), /json/);
});
test('external, traversal and query URLs are rejected before fetching', async () => {
  for (const url of ['https://example.com/api/x', '//example.com/api/x', '/api/../x', '/api/x?next=1']) {
    await assert.rejects(loadSource({ ...domain, dataSource: { url } }, {}, () => { throw new Error('must not fetch'); }), /같은 서버/);
  }
});
test('missing rows, malformed rows, required columns and duplicate IDs fail', () => {
  for (const value of [{}, { rows: [null] }, { rows: [[]] }, { rows: [{ id: 'A' }] }, { rows: [row, row] }]) assert.throws(() => validateSource(domain, value));
});
test('numeric strings and invalid dates are not silently coerced', () => {
  for (const patch of [{ amount: '3' }, { amount: Infinity }, { date: 'yesterday' }, { date: '2026-99-99' }]) assert.throws(() => validateSource(domain, { rows: [{ ...row, ...patch }] }));
  assert.equal(validateSource(domain, { rows: [{ ...row, amount: -5 }] }).rows[0].amount, -5);
});
test('timeout aborts a pending fetch and explains recovery', async () => {
  const fetcher = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  await assert.rejects(loadSource(domain, {}, fetcher, 5), /응답 시간이 초과/);
});
