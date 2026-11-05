# 기준값 설정(params) 계약

`domain.json` 에 `params` 가 있을 때만 메뉴에 `기준값 설정 #/settings` 가 켜진다(DOMAIN.md 7번). 실무자가 「기준을 3% 로 바꾸면요?」 할 때 쓰는 화면이다. 규칙 값을 코드 밖(`domain.json`)에 두고, 테스트가 그 실제 파일을 읽는 원칙을 화면까지 잇는다. 계산은 전부 `domains/core.mjs`, 테스트는 `domains/params.test.mjs`.

## 선언
- `params`: `[{key, label, unit, type:'number'|'enum'|'bool', default, min, max, step, options, affects}]`
  - number 는 `min`·`max` 범위 검증(화면은 Input), enum 은 `options`(문자열 또는 `{v, label}`, 화면은 Select), bool 은 켬/끔(화면은 Switch).
  - `affects` 는 이 값이 바꾸는 대상의 짧은 이름(설명 문장이 아니라 「조치 완료율 목표선」 같은 이름).
- 참조: 설정 안 어디든 값 자리에 `"$param:키"` 를 쓰면 현재 기준값의 숫자·불리언으로 채워진다(예 `"target": "$param:done_target"`, `"k": "$param:ctl_k"`, `">=repeat": "$param:repeat_min"`). 글 속 `{param:키}` 는 글자로 채워진다(예 `"반복 지연(90일 내 {param:repeat_min}회 이상)"`). `makeCtx(domain, sample, saved)` 가 하며, `ctx.raw`(원본)·`ctx.settings`(적용한 값)이 남는다.
- `where` 연산: `"<열"`·`">열"` 에 더해 `"<=열"`·`">=열"`.

## 판정 `judge` — 가정 바꿔 보기가 「판정이 바뀌는 행」을 세는 근거
`{col?, where?, skip?, value, rules:[{label, where?, value?, op?, at?, on?}], else?}`
- `value` = `valueOf` 규격(`{col}` · `{diff:[a,b], per}` · `{hour}` · `{age:열, per}` = `app.asOf` 부터 지난 시간). `rules` 는 위에서부터 처음 맞는 것의 `label`, `op` 는 `<` `<=` `>` `>=`(없으면 `where` 만으로 맞음), `on:false` 인 규칙은 건너뜀. 값이 비어 비교 못 하면 판정하지 않는다(행의 원래 값을 그대로 둠).
- `where` 에 안 맞는 행은 `skip` 라벨(없으면 판정 없음). 규칙이 하나도 안 맞으면 `else`.
- 라벨은 행의 `_judge` 에 들어간다(metrics·tabs 의 `where` 에 `"_judge": ["에스컬레이션"]` 처럼 쓸 수 있다).
- `col` 이 있으면 **기준값이 기본값과 달라졌을 때만** 그 열(보통 상태 열)도 새 판정으로 덮는다. 그래서 기본 규칙은 데이터의 그 열을 그대로 재현하도록 쓴다(`params.test.mjs` 가 확인).
- 판정은 행 안의 값으로만 계산한다. 다른 행에서 미리 계산해 둔 열(예 power 의 `run`·`fp`, purchase 의 `repeat`)은 기준값을 바꿔도 다시 계산되지 않는다.

## 가정 바꿔 보기 · 저장
- `whatIf(ctx, overrides, state)`: 저장하지 않은 값을 덮어 「지금 기준 ↔ 바꾼 기준」을 같은 기간(기본 최근 14일)·그룹으로 계산 → `{changed, metrics, flips:{has,count,rows(상위 10),moves}, basis}`. 틀린 값은 지금 값으로 간주. 비교할 지표는 `"whatIf": {"metrics": [키…]}`(없으면 `cards` 앞 4개) + 관리도가 있으면 「한계 밖 점」 한 줄. 목표(`target`)만 바뀌는 지표는 값 대신 목표 달성/미달이 바뀐다.
- 저장: `/api/settings-<도메인>` 에 `{values, history}`. 처음 값은 `domains/<이름>/settings.json`(`{"values":{},"history":[]}`). `makeSettingsRecord` 가 사유(한 줄) 필수·범위 검증·바뀐 항목마다 이력 한 줄(시각·항목·이전→이후·사유)을 만든다.
- 저장된 값이 기본값과 다르면 모든 화면 하단 「이 화면의 한계」 줄에 `기준값 사용자 설정 적용(항목 값 외 n개)` 가 붙는다(`settingsNote`).
