// engine.mjs — 실행 화면(#/run)이 부르는 엔진 자리. 실전에서는 이 파일 하나를 업무 코드(최적화·배정·계산)로 바꾼다 — 계약은 run.mjs 머리 주석.
// 기본은 「모의 엔진」: 데이터셋 CSV 를 읽어 파일·행 수를 세고, 5단계로 진행을 알린 뒤 요약과 작은 노드 그래프를 돌려준다. 실제 계산은 하지 않는다(화면 배선 확인용).
// 바꿀 때: 입력 = params(실행 화면 조건 — 값 범위는 여기서 다시 검사한다, 서버는 그대로 넘긴다) · files(적용된 데이터셋 CSV 글자) · report(progress, step). 출력 = { summary, graph?, items?, compare?, worst?, excluded? } — 뒤의 셋을 채우면 실행 화면에 「결과 검토」 카드가 뜬다(모양은 run.mjs 머리 주석).
import { parseCsv } from './datasets.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runEngine({ params, files, report }) {
  const steps = ['입력 읽기', '기준안 만들기', '후보 탐색', '제약 검사', '점수·정리'];
  const tables = Object.entries(files).map(([file, text]) => { const rows = parseCsv(text).rows; return { file, rows: rows.length, blank: rows.filter((r) => Object.values(r).some((v) => String(v ?? '').trim() === '')).length }; });
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
    // 결과 검토 칸(모의 값) — 실제 엔진은 지금 운영안과 같은 지표로 계산해 채운다. 뺀 기록은 실제로 센다(빈 칸이 있는 행).
    excluded: { total, groups: [{ reason: '빈 칸이 있는 행', count: tables.reduce((a, t) => a + t.blank, 0) }] },
    compare: { baseLabel: '현재 운영', nextLabel: '새 결과', note: '모의 값', rows: [
      { label: '평균 소요', before: '52분', after: '41분', delta: '-11분', better: true, kind: 'predicted' },
      { label: '필요 자원', before: '14대', after: '15대', delta: '+1대', better: false, kind: 'predicted' },
    ] },
    worst: { metric: '소요 시간', unit: '분', average: 41, items: [
      { id: 'w1', label: '모의 건 A', value: 118, before: 96, note: '평균의 2.9배' },
      { id: 'w2', label: '모의 건 B', value: 97, before: 101 },
      { id: 'w3', label: '모의 건 C', value: 88, before: 60 },
    ] },
    graph: {
      groups: [{ key: 'in', label: '입력' }],
      nodes: [{ id: 'engine', label: '엔진', kind: 'hub', x: 0.5, y: 0.5 }, ...tables.map((t, i) => ({ id: t.file, label: t.file, sub: `${t.rows}행`, x: 0.15 + (i % 3) * 0.35, y: i < 3 ? 0.15 : 0.85 }))],
      edges: tables.map((t) => ({ from: t.file, to: 'engine', group: 'in' })),
    },
  };
}
