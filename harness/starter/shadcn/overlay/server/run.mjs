// run.mjs — 「조건을 넣고 실행 → 진행 → 결과」의 서버 쪽. 엔진(최적화·배정·계산)은 server/engine.mjs 하나를 바꾼다 — 이 파일은 작업 상태만 든다.
// POST /api/run         {params} → 409(실행 중)·200 {started:true}. 한 번에 한 작업. params 값 범위(min·max)는 화면만 검사한다 — 엔진이 다시 검사해 틀리면 throw(메시지가 화면에 뜬다).
// GET  /api/run-status  → { state:'idle'|'running'|'done'|'error', progress(0~100), step, startedAt, finishedAt, params, dataset, result?, error? }
// 결과는 data/store/run-result.json 에 쓴다(서버를 다시 켜도 남는다). 화면 그래프·내보내기는 /api/run-result(GET, 일반 JSON 경로)로 읽는다.
// 엔진 계약(engine.mjs): export async function runEngine({ params, datasetDir, files, report }) → result. report(progress, step) 으로 진행을 알린다.
//   result 모양은 자유이되 { summary:[{label,value,unit?}], graph?:{nodes,edges,groups}, items?:[...] } 를 권장한다 — 실행 화면·노드 그래프·내보내기가 그대로 쓴다.
import fs from 'node:fs';
import path from 'node:path';

export const RESULT_FILE = 'run-result.json';

export function createRun({ root, engine, datasets, now = () => new Date() }) {
  const STORE = path.join(root, 'data', 'store');
  const OUT = path.join(STORE, RESULT_FILE);
  let job = { state: 'idle', progress: 0, step: '', startedAt: null, finishedAt: null, params: null, dataset: null, error: null };
  const stamp = () => { const d = now(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  const readResult = () => (fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null);

  const start = (body) => {
    if (job.state === 'running') return { status: 409, json: { error: '이미 실행 중입니다.' } };
    const params = body && typeof body === 'object' && body.params && typeof body.params === 'object' ? body.params : {};
    const cur = datasets?.current?.() ?? null;
    const datasetDir = datasets?.currentDir?.() ?? null;
    job = { state: 'running', progress: 0, step: '준비', startedAt: stamp(), finishedAt: null, params, dataset: cur?.name ?? null, error: null };
    const report = (progress, step) => { if (job.state === 'running') { job.progress = Math.max(0, Math.min(99, Math.round(progress))); if (step) job.step = step; } };
    (async () => {
      try {
        const files = datasetDir ? datasets.readFiles(datasetDir) : {};
        const result = await engine({ params, datasetDir, files, report });
        const rec = { at: stamp(), dataset: job.dataset, params, result };
        fs.mkdirSync(STORE, { recursive: true });
        const tmp = `${OUT}.tmp`; fs.writeFileSync(tmp, JSON.stringify(rec)); fs.renameSync(tmp, OUT);
        job = { ...job, state: 'done', progress: 100, step: '완료', finishedAt: rec.at };
      } catch (e) {
        job = { ...job, state: 'error', step: '실패', finishedAt: stamp(), error: String(e && e.message ? e.message : e) }; // 메시지만 — 스택·경로는 브라우저에 보내지 않는다
      }
    })();
    return { status: 200, json: { started: true } };
  };
  const status = () => {
    const last = job.state === 'running' ? null : readResult();
    return { status: 200, json: { ...job, last: last ? { at: last.at, dataset: last.dataset, params: last.params } : null, result: job.state === 'done' || job.state === 'idle' ? last?.result ?? null : null } };
  };
  return { start, status, readResult };
}
