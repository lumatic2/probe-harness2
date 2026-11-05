// csv-to-sample.mjs — 과제 CSV 를 도메인의 sample.json 으로 바꾼다 (starter/DOMAIN.md 3단계).
// 사용: node starter/domains/csv-to-sample.mjs <도메인> <파일.csv>
// 머리글은 domain.json 의 cols 의 key 또는 label 과 같아야 한다(띄어쓰기·대소문자 차이는 무시). 변환·검증 규칙은 화면의 CSV 올리기(#/import)와 같다(import.mjs):
// 인코딩 자동 판별(UTF-8·CP949) · 숫자 열은 숫자로 · 날짜는 2026-10-28T09:05:00 꼴로 · enum 값 확인 · 중복 ID. 오류 행은 건너뛰고 이유를 보여 준다.
// 이 도구는 rows 만 쓴다(추이·배치도 같은 선택 데이터는 rows 에서 계산되거나 비어 있어도 화면이 뜬다).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoMap, decodeBytes, importCols, readTable, validateRows } from './import.mjs';

const [name, file] = process.argv.slice(2);
if (!name || !file) { console.error('사용: node starter/domains/csv-to-sample.mjs <도메인> <파일.csv>'); process.exit(1); }
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), name);
const domain = JSON.parse(fs.readFileSync(path.join(dir, 'domain.json'), 'utf8'));

const { text, encoding } = decodeBytes(fs.readFileSync(file));
const table = readTable(text);
if (!table.rows.length) { console.error('CSV 에 데이터 행이 없습니다.'); process.exit(1); }
const map = autoMap(domain, table.headers);
const used = new Set(Object.values(map));
const unknown = table.headers.filter((h, i) => !used.has(i));
const missing = importCols(domain).filter((c) => map[c.key] < 0).map((c) => c.key);
if (unknown.length) console.warn(`설정에 없는 CSV 열(무시): ${unknown.join(', ')}`);
if (missing.length) console.warn(`CSV 에 없는 설정 열(빈 칸): ${missing.join(', ')}`);

const r = validateRows(domain, table, map);
if (r.blocked) { console.error(`필수 열을 찾지 못했습니다: ${r.missingRequired.join(', ')} — CSV 머리글을 설정의 key 또는 label 로 맞추세요.`); process.exit(1); }
if (r.errorRowCount) {
  console.warn(`건너뜀 ${r.errorRowCount}행 (오류 ${r.errors.length}건):`);
  for (const e of r.errors.slice(0, 10)) console.warn(`  ${e.line}행 ${e.label} "${e.value}" — ${e.reason}`);
  if (r.errors.length > 10) console.warn(`  … 외 ${r.errors.length - 10}건`);
}
if (!r.okCount) { console.error('쓸 수 있는 행이 없어 sample.json 을 바꾸지 않았습니다.'); process.exit(1); }
fs.writeFileSync(path.join(dir, 'sample.json'), `${JSON.stringify({ rows: r.okRows })}\n`);
console.log(`${name}/sample.json 에 ${r.okCount}행을 썼습니다. (${encoding})`);
