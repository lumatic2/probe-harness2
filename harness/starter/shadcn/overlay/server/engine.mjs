// engine.mjs — 실행 화면(#/run)이 부르는 엔진 자리. 실전에서는 이 파일 하나를 업무 코드(최적화·배정·계산)로 바꾼다 — 계약은 run.mjs 머리 주석.
// 기본은 「모의 엔진」: 데이터셋 CSV 를 읽어 파일·행 수를 세고, 5단계로 진행을 알린 뒤 요약과 작은 노드 그래프를 돌려준다. 실제 계산은 하지 않는다(화면 배선 확인용).
// 바꿀 때: 입력 = params(실행 화면 조건 — 값 범위는 여기서 다시 검사한다, 서버는 그대로 넘긴다) · files(적용된 데이터셋 CSV 글자) · report(progress, step). 출력 = { summary, graph?, items? }.
import { parseCsv } from './datasets.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runEngine({ params, files, report }) {
  const steps = ['입력 읽기', '기준안 만들기', '후보 탐색', '제약 검사', '점수·정리'];
  const tables = Object.entries(files).map(([file, text]) => ({ file, rows: parseCsv(text).rows.length }));
  for (let i = 0; i < steps.length; i++) { report((i / steps.length) * 100, steps[i]); await sleep(300); }
  const total = tables.reduce((a, t) => a + t.rows, 0);
  return {
    mock: true, // 화면이 「모의 결과」 배지를 띄운다 — 실제 엔진은 이 키를 넣지 않는다
    summary: [
      { label: '입력 파일', value: tables.length, unit: '개' },
      { label: '입력 행', value: total, unit: '행' },
      ...Object.entries(params).slice(0, 3).map(([k, v]) => ({ label: `조건 ${k}`, value: v })),
    ],
    items: tables,
    graph: {
      groups: [{ key: 'in', label: '입력' }],
      nodes: [{ id: 'engine', label: '엔진', kind: 'hub', x: 0.5, y: 0.5 }, ...tables.map((t, i) => ({ id: t.file, label: t.file, sub: `${t.rows}행`, x: 0.15 + (i % 3) * 0.35, y: i < 3 ? 0.15 : 0.85 }))],
      edges: tables.map((t) => ({ from: t.file, to: 'engine', group: 'in' })),
    },
  };
}
