// Optional shadcn result adapter. No remote URLs, silent sample fallback, or row coercion.
export function validateSource(domain, value) {
  if (!value || !Array.isArray(value.rows)) throw new Error('결과에 rows 배열이 없습니다.');
  const required = [...new Set([domain.roles?.id, domain.roles?.date,
    ...(domain.cols || []).filter(c => c.required).map(c => c.key)].filter(Boolean))];
  const ids = new Set();
  for (const [index, row] of value.rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${index + 1}행이 객체가 아닙니다.`);
    for (const key of required) {
      if (row[key] === undefined || row[key] === null || row[key] === '') throw new Error(`${index + 1}행의 필수 열 ${key}가 비었습니다.`);
    }
    const id = domain.roles?.id && String(row[domain.roles.id]);
    if (id && ids.has(id)) throw new Error(`${index + 1}행의 ID가 중복됩니다.`);
    if (id) ids.add(id);
    for (const col of domain.cols || []) {
      const v = row[col.key];
      if (v === undefined || v === null || v === '' || col.virtual) continue;
      if (col.type === 'number' && (typeof v !== 'number' || !Number.isFinite(v))) throw new Error(`${index + 1}행의 ${col.key}는 유한한 숫자여야 합니다.`);
      if (col.type === 'date' && (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(v) || !Number.isFinite(Date.parse(v)))) throw new Error(`${index + 1}행의 ${col.key}는 ISO 날짜여야 합니다.`);
    }
  }
  // Do not merge seed series/units/activity into real results.
  return value;
}

export async function loadSource(domain, seed, fetcher = globalThis.fetch, timeoutMs = 10000) {
  if (!domain.dataSource) return seed;
  const url = domain.dataSource.url;
  if (typeof url !== 'string' || !/^\/api\/[a-z0-9-]+$/.test(url)) throw new Error('데이터 주소는 같은 서버의 /api/이름이어야 합니다.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal, cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error(`데이터를 불러오지 못했습니다(HTTP ${response.status}).`);
    return validateSource(domain, await response.json());
  } catch (error) {
    if (controller.signal.aborted) throw new Error('데이터 응답 시간이 초과됐습니다. 서버 상태를 확인한 뒤 다시 시도하세요.');
    throw error;
  } finally { clearTimeout(timer); }
}
