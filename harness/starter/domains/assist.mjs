// assist.mjs — AI 기능 페이지(#/assist)의 「판정」: 정해 둔 규칙 코드가 답변을 읽고 고정 라벨을 낸다. 순수 함수 (DOM·네트워크 없음).
// 같은 질문·같은 답변이면 항상 같은 결과다(결정론). AI 는 여기에 관여하지 않는다 — 개선 제안 문장만 서버(/api/assist)가 따로 쓴다.
// 설정(domain.json 의 assist): termsCol 질문마다의 위험 키워드 열 · commonTerms 모든 질문 공통 키워드 · minChars 이보다 짧으면 판정하지 않음
//   labels {risk, safe, short} 고정 라벨 · messages {risk, safe, short} 라벨마다 고정 한국어 문구

export function splitSentences(text) {
  return String(text ?? '').split(/(?<=[.!?。？！])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}
export function termsFor(cfg, row) {
  const own = Array.isArray(row?.[cfg.termsCol]) ? row[cfg.termsCol] : [];
  return [...new Set([...own, ...(cfg.commonTerms || [])].map((t) => String(t).trim()).filter(Boolean))];
}

// → {code:'risk'|'safe'|'short', label, message, terms:[걸린 키워드], sentences:[{text, terms:[…]}], count}
export function judgeAnswer(cfg, row, answer) {
  const text = String(answer ?? '').trim();
  const out = (code, sentences, terms) => ({ code, label: cfg.labels[code], message: cfg.messages[code], terms, sentences, count: sentences.filter((s) => s.terms.length).length });
  if (text.length < (cfg.minChars ?? 0)) return out('short', text ? [{ text, terms: [] }] : [], []);
  const all = termsFor(cfg, row);
  const sentences = splitSentences(text).map((s) => ({ text: s, terms: all.filter((t) => s.includes(t)) }));
  const hit = [...new Set(sentences.flatMap((s) => s.terms))];
  return out(hit.length ? 'risk' : 'safe', sentences, hit);
}

// 문장을 키워드 기준으로 쪼갠다 → [{text, mark}] (화면에서 키워드만 굵게)
export function segments(text, terms) {
  if (!terms.length) return [{ text, mark: false }];
  const pat = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return String(text).split(new RegExp(`(${pat})`)).filter((p) => p !== '').map((p) => ({ text: p, mark: terms.includes(p) }));
}
