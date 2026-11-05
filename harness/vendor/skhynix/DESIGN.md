---
version: alpha
name: SK hynix
description: Measured production styles from skhynix-ko; role tokens for recreating the observed page family.
colors:
  brand-accent: "#ff6600"
  primary: "#ffffff"
  on-primary: "#212121"
  display-text: "#000000"
  section: "#f5f5f5"
  heading-text: "#ffffff"
  text-muted: "#888888"
  card: "#ffffff"
  body-foreground-skhynix-dram: "#000000"
  focus: "#101010"
  text-observed-on-panel: "#ffffffb3"
  body-surface-observed: "#00000000"
  secondary-label-observed: "#ffffff"
  secondary-fill-observed: "#00000000"
typography:
  display:
    fontFamily: Roboto, NotoSanskr, sans-serif
    fontSize: 52px
    fontWeight: "700"
    lineHeight: 67.6px
    letterSpacing: -1.04px
  heading:
    fontFamily: Roboto, NotoSanskr, sans-serif
    fontSize: 80px
    fontWeight: "700"
    lineHeight: 80px
    letterSpacing: -1.6px
  caption:
    fontFamily: Roboto, NotoSanskr, sans-serif
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 14px
    letterSpacing: -0.28px
rounded:
  button: 0px
  card: 0px
spacing:
  xs: 20px
  sm: 24px
  md: 40px
  lg: 60px
  xl: 160px
  xxl: 320px
components:
  button-primary:
    padding: 0px 60px 0px 40px
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.button}"
  card:
    padding: 40px 0px 0px
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
---

# SK hynix — DESIGN.md

**빠른 시작 — 앱용 파생 규칙**
1. 앱 주색 #ff6600(--skh-accent); YAML primary=#ffffff는 원본 IR 링크 관측이다. 캠페인 #ff8e20은 기본 버튼에서 제외한다.
2. 글꼴: "Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif; 외부 폰트 없음.
3. 반경 0px; 간격 4·8·12·16·24·32px; .skh-button--primary로 주 버튼을 만든다.
4. 표: .skh-table, 44px 행, 숫자 우측·단위 머리·미수집 —·표 안 가로 스크롤.
5. 차트: 기본 #ff6600(결정)과 회색; 필요할 때만 아래 범주형 6색. 라이트 모드만 쓴다.
6. 개선은 중립색, 악화는 위험색; 방향과 개선/악화 글자를 함께 쓴다.
7. 금지: 로고/워드마크·외부 요청/폰트·무지개/3D 차트.
8. 데이터 화면 전체를 <main class="skh-dashboard">로 감싼다. 아래 필수 적용 조건을 지킨다.

## Overview

국문 메인은 전체 폭 영상과 큰 흰 제목, 밝은 Investor Relations 영역을 교차한다. 검정·흰색의 넓고 평평한 면, Roboto/NotoSanskr 산세리프, 작은 주황 링크 강조가 관측된다. 대시보드에서는 밝은 IR 영역의 명료한 대비를 파생 적용한다. 보조 SK그룹 메인(https://www.sk.com/, 접근 2026-10-27)은 주황 #fc6620을 사용한다. 하이닉스 링크의 #ff6600과 같은 계열이지만 동일 토큰으로 합치지 않는다.

- Read reusable tokens in the YAML frontmatter; region-qualified tokens keep their original background context.
- Verify measurements in the observation-reference table and its companion observations.json.
- Apply the system-only stack in Portable typography. No font download is required.

Representative page: https://www.skhynix.com/; sampled at 1440 × 1000. This is a page-family guide, not the company official brand manual.

## Colors

- `brand-accent`: `#ff6600`. identity accent element foreground from skhynix-ko; inline link foreground from skhynix-ko. Original notation: `rgb(255, 102, 0)`.
- `primary`: `#ffffff`. primary control background from skhynix-ko. Original notation: `rgb(255, 255, 255)`.
- `on-primary`: `#212121`. primary control label foreground from skhynix-ko. Original notation: `rgb(33, 33, 33)`.
- `display-text`: `#000000`. display heading foreground from skhynix-ko. Original notation: `rgb(0, 0, 0)`.
- `section`: `#f5f5f5`. content section background from skhynix-ko. Original notation: `rgb(245, 245, 245)`.
- `heading-text`: `#ffffff`. section heading foreground from skhynix-ko. Original notation: `rgb(255, 255, 255)`.
- `text-muted`: `#888888`. caption/navigation foreground from skhynix-ko. Original notation: `rgb(136, 136, 136)`.
- `card`: `#ffffff`. card panel background from skhynix-ko. Original notation: `rgb(255, 255, 255)`.
- `body-foreground-skhynix-dram`: `#000000`. page body foreground from skhynix-dram. Original notation: `rgb(0, 0, 0)`.
- `focus`: `#101010`. keyboard-focused control outline color from skhynix-ko. Original notation: `rgb(16, 16, 16)`.
- `text-observed-on-panel`: `#ffffffb3`. body-text foreground from skhynix-ko. Original notation: `rgba(255, 255, 255, 0.7)`.
- `body-surface-observed`: `#00000000`. page body background from skhynix-ko. Original notation: `rgba(0, 0, 0, 0)`.
- `secondary-label-observed`: `#ffffff`. secondary control foreground from skhynix-ko. Original notation: `rgb(255, 255, 255)`.
- `secondary-fill-observed`: `#00000000`. secondary control background from skhynix-ko. Original notation: `rgba(0, 0, 0, 0)`.

Same value and painted context: `link` → `brand-accent`.

다크 요청에도 동일: `body-foreground-skhynix-dram`, `body-surface-observed`, `brand-accent`, `card`, `display-text`, `focus`, `heading-text`, `on-primary`, `primary`, `secondary-fill-observed`, `secondary-label-observed`, `section`, `text-muted`, `text-observed-on-panel`. Light/dark observation IDs are retained on the shared token.

## Typography

| Role | Family | Size / line height | Weight / tracking |
|---|---|---|---|
| display | Roboto, NotoSanskr, sans-serif | 52px / 67.6px | 700 / -1.04px |
| heading | Roboto, NotoSanskr, sans-serif | 80px / 80px | 700 / -1.6px |
| caption | Roboto, NotoSanskr, sans-serif | 14px / 14px | 400 / -0.28px |

<!-- token-aliases: {"colors":{"link":"brand-accent"},"typography":{}} -->

No paragraph body sample was resolved. Caption, navigation and display samples are not running-copy prescriptions. Choose accessible project typography for new prose; do not label it as measured.

## Layout

- `xs`: `20px`.
- `sm`: `24px`.
- `md`: `40px`.
- `lg`: `60px`.
- `xl`: `160px`.
- `xxl`: `320px`.

Lengths come from sampled padding, gap and margin. They do not establish a universal grid or responsive layout.

## Elevation & Depth

Flat — no box shadow was observed in the sampled elements. Media depth is a visual role, not a measured CSS elevation token.

## Shapes

- `button`: `0px` radius on the sampled button.
- `card`: `0px` radius on the sampled card.

## Components

- `button-primary`: padding `0px 60px 0px 40px`, backgroundColor `{colors.primary}`, textColor `{colors.on-primary}`, rounded `{rounded.button}`.
- `card`: padding `40px 0px 0px`, backgroundColor `{colors.card}`, rounded `{rounded.card}`.

### 필수 적용 조건 · 파생

데이터 화면은 `<main class="skh-dashboard">` 부모 안에서 `.skh-shell`, `.skh-kpi-grid`, `.skh-panel`, `.skh-data-filter`, `.skh-table-scroll`, `.skh-table`을 사용한다. 이 부모가 없으면 데이터 컴포넌트 CSS가 적용되지 않는다. 기본 버튼/입력/배지는 `.skh-button`, `.skh-input`, `.skh-badge`를 그대로 쓴다.

새 배치를 만들 때 여백은 --skh-space-1~6, 바탕은 --skh-data-white/--skh-data-soft, 본문은 --skh-data-ink, 보조 문구는 --skh-data-muted, 경계는 --skh-data-line을 사용한다. #777/#888 같은 임의의 작은 글자색이나 #ddd 같은 제어 경계를 새로 넣지 않는다. 상수 배경·글자색으로 다크 변수를 덮지 않는다. 루트 data-theme=dark에서도 같은 컴포넌트가 동작해야 한다. 캡션도 4.5:1을 지킨다. 28px 카드 내부 여백·42/44px 제어 높이 등 제공 클래스의 고정 치수는 컴포넌트별 파생 예외이며 새 화면의 일반 간격은 4/8/12/16/24/32px다.

### 통합 적용 규칙 · 파생

- 브랜드 주색은 공식 메인 링크에서 관측한 #ff6600이다. YAML primary=#ffffff는 원본 IR 링크의 관측색이며 앱 주 버튼의 색이 아니다. 앱 매핑은 아래 CSS 변수와 빠른 시작을 따른다. 주 버튼은 이 색과 #121212 라벨, #854a11 경계를 쓴다. 캠페인 #ff8e20은 행사 변형이며 기본 주 버튼에 쓰지 않는다.
- 기본 데이터 강조는 #ff6600(사용자 결정 10-29, 대비 보정값 #a84000 대신)이다. 관측 IR 상승 #d10025는 원본 관례다. 통합 앱의 증감은 **개선=중립색 + 방향 + 개선**, **악화=위험색 + 방향 + 악화**, 판단 없는 증감=중립색 + 방향 + 증감 수치로 표시한다. 수율 상승과 불량률 하락은 모두 개선이다. IR 상승=빨강 관례를 앱의 개선색으로 사용하지 않는다.
- 기본 반경은 0px, 42px 폼·버튼과 44px 데이터 표/필터, 4·8·12·16·24·32px 간격은 앱용 파생 규칙이다. 해커톤 카드의 12/8px는 캠페인 관측값으로 남기며 기본 앱에 강제하지 않는다.
- 상태 정상/주의/위험/정보는 글자·기호·색을 함께 표시한다. 차트의 범주 색은 상태 의미를 갖지 않는다. 범례/직접 레이블/모양으로 구분하고 기본은 강조 1색이다.
- 다크는 문서 루트의 data-theme=dark다. .skh-dark 클래스를 새로 만들지 않는다.

- 해커톤의 #ff8e20 / #121212·42px·28px는 캠페인 관측 근거다. 기본 앱 주색은 #ff6600이며 위 통합 규칙과 design.css가 우선한다. 원본 웹폰트 Pretendard/Poppins 중 Pretendard 는 키트 동봉 woff2(`vendor/fonts/`)로 고정한다(사용자 결정 10-29, 이 줄이 위 시스템 스택 지정보다 우선).
- 모든 실제 값·상태·폭·출처는 components.json의 observed 항목과 live-samples.json을 따른다. 원본에 없는 상태는 파생한다. focus-visible 샘플은 focusVisible boolean을 반드시 확인한다.
- 원본의 투명 배경·낮은 대비 테두리·그라데이션·상속 라벨을 그대로 앱에 옮기지 않는다. HTML의 밝은 바탕과 상태색·42px 제어 높이는 접근성을 위한 파생이다.

### 주 버튼 · 파생

공식 주색 #ff6600·짙은 라벨을 작업 실행 버튼에 파생 적용한다. 밝은 바탕에서 경계를 구별하도록 어두운 테두리를 보강한다. 근거: `hackathon-filter-1440-default`.

```html
<button type="button" class="skh-button skh-button--primary" data-state="default">실행</button>
```

### 보조 버튼 · 파생

주 버튼과 높이를 맞추고 단색 바탕과 명확한 경계를 쓴다. 근거: `hackathon-secondary-1440-default`.

```html
<button type="button" class="skh-button" data-state="default">미리 보기</button>
```

### 텍스트 버튼 · 파생

텍스트 버튼은 밑줄로 실행 가능함을 알린다. 근거: `hackathon-tab-1440-default`.

```html
<button type="button" class="skh-button skh-button--text" data-state="default">초기화</button>
```

### 위험 버튼 · 파생

삭제처럼 되돌리기 어려운 작업에만 위험색을 쓰고 동사를 명확히 적는다. 근거: `jobs-badge-1440-default`.

```html
<button type="button" class="skh-button skh-button--danger" data-state="default">분석 삭제</button>
```

### 입력 · 파생

라벨을 항상 남기고 오류는 테두리·문장으로 함께 알린다. 근거: `hackathon-search-1440-default`.

```html
<div class="skh-field"><label for="example-input-input-default">입력</label><input id="example-input-input-default" type="text" class="skh-input" value="공정 A" data-state="default"></div>
```

### 선택 · 파생

검색 입력 높이를 기준으로 네이티브 select를 파생한다. 펼침 목록은 OS 기본 동작을 유지한다. 근거: `hackathon-search-1440-default`.

```html
<div class="skh-field"><label for="example-select-select-default">선택</label><select id="example-select-select-default" class="skh-input" data-state="default"><option>전체 공정</option><option>식각</option></select></div>
```

### 체크 · 파생

뉴스룸 구독 폼의 네이티브 체크는 opacity 0으로 라벨이 외형을 그린다. 앱에서는 20px 경계와 체크 기호를 새로 파생한다. 근거: `subscribe-checkbox-1440-default`, `hackathon-filter-1440-default`, `hackathon-search-1440-default`.

```html
<div class="skh-field"><span>체크</span><span class="skh-choice-wrap" data-state="default"><input id="example-checkbox-checkbox-default" type="checkbox" class="skh-choice" name="example-checkbox-checkbox-default" checked><label for="example-checkbox-checkbox-default">이상치 제외</label></span><span class="skh-choice-wrap" data-state="default"><input id="example-checkbox-checkbox-default-other" type="checkbox" class="skh-choice" name="example-checkbox-checkbox-default"><label for="example-checkbox-checkbox-default-other">원본 유지</label></span></div>
```

### 라디오 · 파생

단일 선택에는 같은 name을 쓰며 선택은 중심점으로 구별한다. 근거: `hackathon-filter-1440-default`, `hackathon-search-1440-default`.

```html
<div class="skh-field"><span>라디오</span><span class="skh-choice-wrap" data-state="default"><input id="example-radio-radio-default" type="radio" class="skh-choice" name="example-radio-radio-default" checked><label for="example-radio-radio-default">일별 집계</label></span><span class="skh-choice-wrap" data-state="default"><input id="example-radio-radio-default-other" type="radio" class="skh-choice" name="example-radio-radio-default"><label for="example-radio-radio-default-other">주별 집계</label></span></div>
```

### 검색 · 파생

해커톤의 42px 입력과 둥근 검색 형태를 기준으로 한다. Enter 또는 검색 버튼으로 실행한다. 근거: `hackathon-search-1440-default`.

```html
<div class="skh-field"><label for="example-search-search-default">검색</label><input id="example-search-search-default" type="search" class="skh-input skh-search" value="배치 검색" data-state="default"></div>
```

### 필터 · 파생

활성 필터는 주황 배경·짙은 라벨·aria-pressed로 표시한다. 근거: `hackathon-filter-1440-default`, `hackathon-secondary-1440-default`.

```html
<button type="button" class="skh-button skh-filter" data-state="default" aria-pressed="true">전체 공정</button>
```

### 태그 · 파생

분류 태그는 상태색과 구분하며 짧은 명사를 쓴다. 근거: `news-category-1440-default`.

```html
<span class="skh-badge">제조 데이터</span>
```

### 정상 배지 · 파생

정상은 중립색과 체크 표시로 표현한다. 초록색이 관측된 것으로 쓰지 않는다. 근거: `b-normal-color`.

```html
<span class="skh-badge skh-badge--normal">✓ 정상</span>
```

### 주의 배지 · 파생

주의는 주황 계열의 대비 보정값과 느낌표를 함께 쓴다. 근거: `b-warning`.

```html
<span class="skh-badge skh-badge--warning">! 주의</span>
```

### 위험 배지 · 파생

위험은 마감 배지의 붉은 계열을 파생하고 구체적인 상태명을 쓴다. 근거: `b-danger`.

```html
<span class="skh-badge skh-badge--danger">× 위험</span>
```

### 정보 배지 · 파생

정보는 관측된 청회색을 어둡게 파생하며 아이콘과 문장을 함께 쓴다. 근거: `b-info-color`.

```html
<span class="skh-badge skh-badge--info">i 정보</span>
```

### 카드 · 파생

카드의 28px 여백과 12px/8px 반경은 캠페인 관측 근거다. 통합 앱의 반경은 0px다. 원본 유리 배경은 불투명 단색으로 파생한다. 근거: `hackathon-card-1440-default`.

```html
<article class="skh-card"><span class="skh-eyebrow">DATA QUALITY</span><h3>데이터 품질 점검</h3><p>누락된 값과 이상치를 먼저 확인합니다.</p><button type="button" class="skh-button">상세 확인</button></article>
```

### 탭 · 파생

활성 탭에는 밑줄·굵기·aria-selected를 함께 쓴다. 방향키·Home·End로 탭을 이동한다. 근거: `hackathon-tab-1440-default`.

```html
<div class="skh-tabs" data-state="default" role="tablist" aria-label="분석 보기"><button type="button" role="tab" id="example-tabs-tab-a" aria-controls="example-tabs-panel-a" aria-selected="true" tabindex="0">요약</button><button type="button" role="tab" id="example-tabs-tab-b" aria-controls="example-tabs-panel-b" aria-selected="false" tabindex="-1">상세</button></div><div id="example-tabs-panel-a" role="tabpanel" aria-labelledby="example-tabs-tab-a">공정별 품질 요약</div><div id="example-tabs-panel-b" role="tabpanel" aria-labelledby="example-tabs-tab-b" hidden>세부 분석 내용</div>
```

### 목록 행 · 파생

목록은 짧은 제목과 보조 정보로 구성하고 선택 상태를 aria-current로 표시한다. 근거: `jobs-row-1440-default`.

```html
<ul class="skh-list" data-state="default"><li><a href="#components" aria-current="true">공정별 분석 <span>선택됨</span></a></li><li><a href="#components">설비별 분석 <span>대기</span></a></li></ul>
```

### 페이지네이션 · 파생

관측한 원본 탐색 링크는 데스크톱 32px·모바일 26px 너비다. 앱에서는 42px 목표 크기로 파생하고 현재 페이지를 aria-current로 알린다. 근거: `news-pagination-1440-default`.

```html
<nav class="skh-pagination" data-state="default" aria-label="결과 페이지"><button type="button" disabled aria-label="이전 페이지">‹</button><button type="button" aria-current="page">1</button><button type="button">2</button><button type="button" aria-label="다음 페이지">›</button></nav><small>예시 페이지 이동은 데이터 연결 시 구현합니다.</small>
```

### 단계 표시 · 파생

관측된 전형 카드에서 순서형 목록을 파생한다. 현재 단계는 aria-current=step으로 표시하며 완료·대기를 글자로 남긴다. 근거: `process-step-1440-default`, `hackathon-filter-1440-default`.

```html
<ol class="skh-steps"><li>업로드 완료</li><li aria-current="step">분석 진행</li><li>결과 대기</li></ol>
```

### 알림 · 파생

지속적인 안내에는 role=status를 쓴다. 긴급 오류만 role=alert로 바꾼다. 근거: `b-info-color`, `hackathon-card-1440-default`.

```html
<div class="skh-alert" role="status"><strong>i 데이터 확인</strong><p>분석 전에 열 이름과 단위를 확인해 주세요.</p></div>
```

### 토스트 · 파생

자동 사라짐을 기본으로 하지 않으며 닫기 버튼과 polite live region을 제공한다. 근거: `b-normal-color`, `hackathon-card-1440-default`.

```html
<div class="skh-alert" role="status"><strong>✓ 저장했습니다</strong><button type="button" class="skh-button skh-button--text" data-dismiss>닫기</button></div>
```

### 모달 · 파생

네이티브 dialog로 초점 이동·가둠·Escape·호출자 복귀를 구현한다. 실사이트 모달을 관측했다고 주장하지 않는다. 근거: `hackathon-card-1440-default`, `hackathon-search-1440-default`.

```html
<section class="skh-modal" aria-label="모달 외형 예시"><h3>분석을 삭제할까요?</h3><p>삭제한 분석은 복구할 수 없습니다.</p><button type="button" class="skh-button" data-open="example-modal-dialog">모달 열기</button></section><dialog class="skh-modal" id="example-modal-dialog" aria-labelledby="example-modal-dialog-title"><h3 id="example-modal-dialog-title">분석을 삭제할까요?</h3><p>삭제한 분석은 복구할 수 없습니다.</p><form method="dialog"><button class="skh-button" autofocus>취소</button> <button class="skh-button skh-button--danger" value="delete">삭제</button></form></dialog>
```

### 빈 상태 · 파생

빈 상태에는 이유와 다음 행동을 한 문장씩 제공한다. 근거: `hackathon-card-1440-default`, `hackathon-secondary-1440-default`.

```html
<div class="skh-empty"><strong>조건에 맞는 결과가 없습니다</strong><p>기간이나 공정을 바꿔 다시 검색해 주세요.</p><button type="button" class="skh-button">필터 초기화</button></div>
```

### 로딩 · 파생

움직임 없이 상태 문장과 progress를 제공한다. 진행률이 없으면 value 속성을 생략한다. 근거: `hackathon-search-1440-default`, `hackathon-filter-1440-default`.

```html
<div class="skh-loading" role="status" aria-live="polite"><progress aria-label="분석 진행"></progress><span>분석 중입니다. 잠시 기다려 주세요.</span></div>
```

### 상태 규칙 · 파생

기본·hover·focus-visible·disabled·오류를 분리한다. hover는 안쪽 선, focus-visible은 2px 외곽선과 3px 간격으로 구별한다. disabled는 실제 disabled 속성을 쓰고 opacity를 낮추지 않는다. 폼 오류에는 aria-invalid·aria-describedby와 오류 문장을 함께 쓴다. 실행 버튼 오류는 앞선 실행의 실패 안내이며 aria-invalid를 쓰지 않는다.

정적 상태 견본의 data-state는 캡처용 고정 상태다. 복사할 때 제거하면 실제 :hover·:focus-visible·:disabled가 동작한다. 체크·라디오는 네이티브 input 의미를 유지하고 사용자 정의 페인트로 경계를 보장한다.

### 접근성·동작

배지·비클릭 카드·단계·알림·빈 상태·로딩은 비대화형이므로 hover·focus·disabled·폼 오류 상태가 적용되지 않는다. 기본 표시·의미별 상태를 보여준다. 탭·목록·페이지의 오류는 데이터 조회 실패 안내다.

모달은 HTML의 data-open 처리와 네이티브 dialog·method=dialog를 함께 복사한다. 탭은 HTML의 클릭·방향키·Home·End 처리까지 함께 옮긴다. 페이지 이동·검색·초기화는 예시 UI이므로 연결할 데이터 핸들러는 적용 프로젝트가 구현한다. 알림·로딩에는 role=status를 사용하고 자동 타임아웃은 두지 않는다.

### 원본의 본문 폭

뉴스룸 기사 .post-contents와 실제 p 박스는 서로 다르다. 각 1440/393px의 실측 폭은 article-body-*-default·article-paragraph-*-default의 measured-width를 사용한다. 문단 한 개의 박스 폭을 전 사이트 max-width로 오해하지 않는다.

### 데이터 표

원본 IR 표는 53px 머리·55px 행·가운데 숫자 정렬이다. 데모는 **파생** 44px 머리/행, 10px 16px 여백, 14px 본문으로 밀도를 높인다. 숫자는 우측 정렬과 tabular-nums를 사용한다. 기본 줄무늬는 없고, 선택 행만 회색 바탕·빨강 왼쪽 선·선택됨 문구로 구분한다. 색만으로 선택을 알리지 않는다.

표 제목에 기간과 단위를 명시하고 scope가 있는 th를 쓴다. 정렬 버튼은 실제 순서를 바꾸고 th의 aria-sort를 갱신한다. 미수집은 —, 실제 0은 0이다. 빈 결과에는 사유와 초기화 버튼을 둔다. 모바일은 표 안에서만 가로 스크롤한다.

```html
<div class="skh-table-scroll" role="region" aria-label="라인별 생산 데이터, 가로 스크롤 가능" tabindex="0"><table class="skh-table"><caption>2026.10.27 · 08:00–18:00 · 가상 데이터 · 선택 행은 상세 분석 대상</caption><thead><tr><th scope="col">분석 대상</th><th scope="col">라인</th><th scope="col" class="skh-num">투입(장)</th><th scope="col" class="skh-num">양품(장)</th><th scope="col" class="skh-num" aria-sort="descending"><button class="skh-sort" id="skh-sort">수율(%) ▼</button></th><th scope="col">데이터 상태</th></tr></thead><tbody id="skh-rows"></tbody></table></div>
<!-- tbody는 데모 스크립트 또는 제품의 데이터 렌더러로 채운다. -->
```

### 차트

**강조 1색 원칙**: 기본은 #ff6600(결정) 한 색과 #666666·#898989 회색이다. 인포그래픽에서 확인한 이전 기간 회색/현재 기간 강조의 위계를 옮겼다. 여러 범주를 반드시 구분해야 할 때만 data-display.json의 범주형 6색을 쓴다. 팔레트 전체는 **파생**이며 관측 빨강·보라를 출발점으로 한다. 관측 청록 #00bd9f는 흰 바탕 대비가 낮아 #007969로 어둡게 했다.

| 종류 | 순서 | 용도 |
|---|---|---|
| 범주형 | #ff6600 → #5c51d6 → #007969 → #b88800 → #734c78 → #333333 | 서로 순서 없는 범주 6개 이하 |
| 순차형 | #b58088 → #a85261 → #96243b → #710016 → #3b0009 | 낮음→높음; L* 단조 감소 |
| 발산형 | #003f55 → #368198 → #898989 → #c35868 → #83001b | 음수→중립 0→양수; 중심은 회색 |

검사 기준은 흰 배경 대비 3:1, ΔE76 10 이상이다. 범주형은 모든 쌍, 순차형·발산형은 인접 단계를 정상/적색/녹색/청황 색각 모형에서 확인한다. ΔE는 접근성 표준이 아닌 이 키트의 구분 검사다. 누적/도넛의 인접 면은 흰 2px 선으로 나눈다. 각 수치는 레이블과 접근 가능한 SVG 설명을 제공한다. 제품에서 원자료 표가 필요하면 같은 수치를 추가한다. 범주형의 색이 모두 텍스트용 4.5:1을 통과하는 것은 아니므로 글자는 #212121 또는 #666666을 쓴다.

축은 #808080, 축 글자는 #666666 14px이다. 격자 #eeeeee는 장식용이다. 막대는 0에서 시작한다. 수율 선의 기본 범위는 0~100%이며 축을 줄일 때 명시한다. 툴팁은 #212121 바탕/#ffffff 글자로, hover와 키보드 focus 모두에 노출한다.

#### 막대 · 파생 예시

```html
<svg class="skh-chart" viewBox="0 0 540 205" role="img" aria-labelledby="skh-bar-title skh-bar-desc"><title id="skh-bar-title">공정별 불량 건수</title><desc id="skh-bar-desc">가상 데이터. 증착 12, 식각 28, 세정 9, 검사 6건. 식각을 빨강으로 강조. 가로축 0~30건.</desc><path class="skh-axis" d="M70 10V164H510" fill="none"/><text x="4" y="35">증착</text><rect x="70" y="18" width="168" height="24" fill="#666666"/><text class="skh-value" x="248" y="35">12</text><text x="4" y="75">식각</text><rect x="70" y="58" width="392" height="24" fill="#d10025"/><text class="skh-value" x="472" y="75">28</text><text x="4" y="115">세정</text><rect x="70" y="98" width="126" height="24" fill="#666666"/><text class="skh-value" x="206" y="115">9</text><text x="4" y="155">검사</text><rect x="70" y="138" width="84" height="24" fill="#666666"/><text class="skh-value" x="164" y="155">6</text><text x="66" y="190">0</text><text x="200" y="190">10</text><text x="340" y="190">20</text><text x="480" y="190">30건</text></svg>
```

#### 선 · 파생 예시

```html
<svg class="skh-chart" viewBox="0 0 540 205" role="img" aria-labelledby="skh-line-title skh-line-desc"><title id="skh-line-title">시간별 제조 수율</title><desc id="skh-line-desc">가상 데이터. 08시 92.1, 10시 93.4, 12시 94.8, 14시 94.2, 16시 96.0, 18시 96.8%. 세로축 0에서 100%.</desc><g class="skh-grid"><path d="M44 32H520M44 98H520"/></g><path class="skh-axis" d="M44 16V164H520" fill="none"/><text x="0" y="36">100%</text><text x="10" y="102">50%</text><text x="22" y="168">0</text><path d="M60 42.4L148 40.7L236 38.9L324 39.7L412 37.3L500 36.2" fill="none" stroke="#d10025" stroke-width="3"/><circle cx="60" cy="42.4" r="4" fill="#d10025"/><circle cx="148" cy="40.7" r="4" fill="#d10025"/><circle cx="236" cy="38.9" r="4" fill="#d10025"/><circle cx="324" cy="39.7" r="4" fill="#d10025"/><circle cx="412" cy="37.3" r="4" fill="#d10025"/><circle cx="500" cy="36.2" r="4" fill="#d10025"/><text class="skh-value" x="442" y="24">96.8%</text><text x="50" y="190">08시</text><text x="138" y="190">10시</text><text x="226" y="190">12시</text><text x="314" y="190">14시</text><text x="402" y="190">16시</text><text x="490" y="190">18시</text></svg>
```

#### 누적 막대 · 파생 예시

```html
<svg class="skh-chart" viewBox="0 0 540 205" role="img" aria-labelledby="skh-stack-title skh-stack-desc"><title id="skh-stack-title">라인별 장비 상태 비중</title><desc id="skh-stack-desc">가상 데이터. A라인 가동 80 대기 15 점검 5%, B라인 72 18 10%, C라인 88 8 4%. 좌측부터 가동, 대기, 점검.</desc><text x="8" y="48">A라인</text><rect x="70" y="28" width="344" height="28" fill="#666666" stroke="#ffffff" stroke-width="2"/><rect x="414" y="28" width="64.5" height="28" fill="#898989" stroke="#ffffff" stroke-width="2"/><rect x="478.5" y="28" width="21.5" height="28" fill="#d10025" stroke="#ffffff" stroke-width="2"/><text class="skh-value" x="510" y="48">5</text><text x="8" y="96">B라인</text><rect x="70" y="76" width="309.59999999999997" height="28" fill="#666666" stroke="#ffffff" stroke-width="2"/><rect x="379.59999999999997" y="76" width="77.39999999999999" height="28" fill="#898989" stroke="#ffffff" stroke-width="2"/><rect x="457" y="76" width="43" height="28" fill="#d10025" stroke="#ffffff" stroke-width="2"/><text class="skh-value" x="510" y="96">10</text><text x="8" y="144">C라인</text><rect x="70" y="124" width="378.4" height="28" fill="#666666" stroke="#ffffff" stroke-width="2"/><rect x="448.4" y="124" width="34.4" height="28" fill="#898989" stroke="#ffffff" stroke-width="2"/><rect x="482.79999999999995" y="124" width="17.2" height="28" fill="#d10025" stroke="#ffffff" stroke-width="2"/><text class="skh-value" x="510" y="144">4</text><text x="67" y="190">0</text><text x="267" y="190">50</text><text x="462" y="190">100%</text></svg>
```

#### 도넛 · 파생 예시

```html
<svg class="skh-chart" viewBox="0 0 540 205" role="img" aria-labelledby="skh-donut-title skh-donut-desc"><title id="skh-donut-title">불량 유형 구성</title><desc id="skh-donut-desc">가상 데이터. 파티클 55%, 치수 30%, 기타 15%. 총 55건. 빨강은 파티클.</desc><g transform="translate(110 100) rotate(-90)" fill="none" stroke-width="28"><circle r="62" stroke="#898989"/><circle r="62" stroke="#666666" stroke-dasharray="116.87 272.69" stroke-dashoffset="-214.26"/><circle r="62" stroke="#d10025" stroke-dasharray="214.26 175.3"/><path d="M48 0H77" stroke="#ffffff" stroke-width="2" transform="rotate(0)"/><path d="M48 0H77" stroke="#ffffff" stroke-width="2" transform="rotate(198)"/><path d="M48 0H77" stroke="#ffffff" stroke-width="2" transform="rotate(306)"/></g><text class="skh-value" x="85" y="98">55건</text><text x="82" y="119">불량 합계</text><rect x="235" y="45" width="12" height="12" fill="#d10025"/><text x="260" y="57">파티클</text><text class="skh-value" x="440" y="57">55%</text><rect x="235" y="90" width="12" height="12" fill="#666666"/><text x="260" y="102">치수</text><text class="skh-value" x="440" y="102">30%</text><rect x="235" y="135" width="12" height="12" fill="#898989"/><text x="260" y="147">기타</text><text class="skh-value" x="440" y="147">15%</text></svg>
```

금지: 3D 차트, 범주 7색 이상, 이중 축 남용, 파이 조각 6개 초과, 무지개 그라디언트. 필터가 표에만 적용되면 그 범위를 필터 이름·상태 문구에 분명히 적는다.

### KPI

큰 숫자·작은 단위·하단 증감의 위계를 쓴다. **파생** 숫자 36px/700, 단위 16px, 라벨과 증감 14px. 관측 IR의 상승 빨강은 원본 관례로만 남긴다. 개선은 중립색, 악화는 위험색이며 방향과 개선/악화 글자를 함께 쓴다. ↑/↓와 비교 기간·단위(% 또는 %p)를 함께 적고, 개선/악화는 의미를 판단해 별도 문구로 표시한다.

```html
<div class="skh-kpi-grid"><article class="skh-kpi"><p class="skh-kpi-label">전체 수율</p><p class="skh-kpi-value">96.8<span class="skh-unit">%</span></p><p class="skh-delta skh-delta--improved">↑ 0.8%p <span class="skh-muted">전일 대비 · 개선</span></p></article><article class="skh-kpi"><p class="skh-kpi-label">처리 웨이퍼</p><p class="skh-kpi-value">12,480<span class="skh-unit">장</span></p><p class="skh-delta skh-delta--improved">↑ 4.2% <span class="skh-muted">전일 대비</span></p></article><article class="skh-kpi"><p class="skh-kpi-label">이상 감지</p><p class="skh-kpi-value">3<span class="skh-unit">건</span></p><p class="skh-delta skh-delta--improved">↓ 2건 <span class="skh-muted">전일 대비 · 개선</span></p></article><article class="skh-kpi"><p class="skh-kpi-label">평균 공정 시간</p><p class="skh-kpi-value">42.6<span class="skh-unit">분</span></p><p class="skh-delta skh-delta--improved">↓ 1.4분 <span class="skh-muted">전일 대비 · 개선</span></p></article></div>
```

### 대시보드 배치

**파생** 간격·패널 여백은 IR 셀의 16px에서 가져온다. 최소 패널 폭 280px, 패널 제목 18px, 필터 입력 높이 44px이다. 1440·1024px에서는 KPI 4열/차트 2열, 393px에서는 각각 1열이다. 표 최소 폭은 640px로 내부 스크롤한다. 767px 이하에서 1열로 전환한다. OS 글꼴을 사용하며 웹폰트 파일은 없다.

```html
<form class="skh-data-filter"><label>라인<select><option>전체 라인</option></select></label><button type="submit">표 필터 적용</button></form>
<div class="skh-dashboard-grid"><section class="skh-panel"><header class="skh-panel-head"><h2>시간별 수율</h2><span>단위: %</span></header><!-- 인라인 SVG --></section></div>
```

Grafana의 지속 도구막대·패널 머리, Observable의 데이터 설명, PostHog의 제목/본문 위계를 **구조만** 참조했다. 해당 가이드에는 이 데모의 280px·44px·반응형 열 수가 관측값으로 정의되어 있지 않다. 색과 글꼴은 가져오지 않았다.

### 근거와 통합

관측/파생 정본: data-display.json의 roles. 원래 RGB 표기·실측 박스는 changesets/499-m156-skhynix-data-display/observed.json. CSS는 data-display.html의 인라인 style에 있으며 변수에 skh-data- 접두를 붙였다. A 갈래 통합 시 YAML은 임시 린트용으로 빼고 Components의 하위 절을 합친다. 최종 브랜드 토큰으로 대응시킨 뒤 대비·팔레트·오프라인 검사를 다시 실행한다.

- [공식 IR](https://www.skhynix.com/ir/UI-FR-IR01/) · 접근 2026-10-27
- [공식 재무제표](https://www.skhynix.com/ir/UI-FR-IR07/) · [임베드 Euroland](https://asia.tools.euroland.com/tools/ia/?companycode=kr-000660&v=redesign&lang=ko-kr) · 접근 2026-10-27
- [지속가능경영 보고 페이지](https://www.skhynix.com/sustainability/UI-FR-SA1601/) · 접근 2026-10-27
- [뉴스룸 실적표·인포그래픽](https://news.skhynix.co.kr/q2-2026-business-results/) · 접근 2026-10-27; 이미지에서 구성 위계만 확인, 이미지 파일은 배포/커밋하지 않음
- [색각 모형 저자 논문 부록 A](https://www.inf.ufrgs.br/~oliveira/students_dissertations/Masters/Gustavo_Machado_Masters_thesis_UFRGS_2010.pdf) · 접근 2026-10-27
- [W3C 비텍스트 대비](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) · 접근 2026-10-27

### 다크 차트 팔레트 · 파생

- categorical: #ff9a55 → #b7aaff → #54cfb8 → #b88800 → #d7a5df → #ffffff.
- sequential: #ffd9ba → #ffc28d → #f4a96b → #d98b45 → #b36a20.
- diverging: #53a7c2 → #a0d8e8 → #eeeeee → #efb0bc → #c76d83.

라이트는 흰 바탕, 다크는 #26262c 바탕에서 각각 3:1 및 네 색각 모형 구분 검사를 적용했다. 상태색과 범주형 색을 같은 의미로 대응하지 않는다.


## Do's and Don'ts

- Do: 넓은 흰 면과 짙은 정보 글자, 평평한 섹션 구분을 유지한다.
- Do: 작은 주황 강조는 선택 상태·핵심 수치 주변에 제한하며 흰 배경의 작은 본문색으로 쓰지 않는다.
- Do: 시스템 글꼴만 사용하고, 대시보드용 간격·그래프는 파생으로 표시한다.
- Don't: 로고·행복날개·워드마크·제품 사진·외부 글꼴/CDN을 넣거나 영상 위 흰 글자를 흰 데이터 화면에 옮기지 않는다.

- Do: 상태는 글자·기호·색으로 함께 표시하고 일반 텍스트 4.5:1, UI 경계·큰 글자 3:1을 확인한다.
- Do: 정상은 중립색으로 표시한다. 초록·파랑은 관측된 상태색인 것처럼 추가하지 않는다.
- Do: 양쪽 폭과 실제 키보드·네이티브 disabled·오류 연결을 확인한다.
- Don't: 로고·행복날개·워드마크·제품 사진·외부 폰트·CDN을 포함하지 않는다.
- Don't: 대회 신청 버튼의 흐린 표현이나 투명 테두리를 앱 disabled/focus 규칙으로 그대로 쓰지 않는다.
- Don't: 파생 모달·토스트·빈 상태·로딩을 실제 사이트 관측 컴포넌트로 소개하지 않는다.
- Don't: 원본의 붉은 마감 배지를 모든 정상 상태에 쓰거나 상태를 색만으로 전달하지 않는다.
- Don't: 폼 전송·삭제·자동 사라짐을 전시용 예시에 연결하지 않는다.

## Portable typography

원본 웹폰트: Roboto, NotoSanskr (Noto Sans KR의 CSS 별칭), sans-serif. 계산된 스택은 YAML에 관측값으로 보존한다. 배포 파일의 재배포 권한을 확인한 것으로 해석하지 않는다.

- Roboto: [Apache 2.0 (upstream legacy static family; deployed file license not independently verified)](https://github.com/googlefonts/roboto/blob/main/LICENSE) (접근 2026-10-27).
- NotoSanskr (CSS alias of Noto Sans KR): [SIL OFL 1.1 (upstream; deployed file license not independently verified)](https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE) (접근 2026-10-27).

휴대용 시스템 대체 스택: `"Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif`. 모든 역할에 이 스택을 적용한다. 이 스택은 파생 제안이며 측정된 웹폰트와 메트릭이 같다는 뜻이 아니다. 외부 폰트 파일·CDN·@import를 로드하지 않는다.

## Observed shape and rhythm

| Role | Width / max-width | Padding / radius |
|---|---|---|
| body · `computed-d054739f40c4353c` | 1440px / none | 0px / 0px |
| display · `computed-3137f18e89393793` | 1216px / none | 0px / 0px |
| heading · `computed-48cbb2f2a611a1b9` | 598px / none | 0px / 0px |
| body-text · `computed-3b8f2810c794682d` | 598px / none | 30px 10px 0px / 0px |
| caption · `computed-dd36c96cb03a3677` | 299.375px / none | 0px 10px 0px 0px / 0px |
| primary · `computed-9d2788e9889e6b40` | 508px / none | 0px 60px 0px 40px / 0px |
| primary-label · `computed-249fa105ab5f23d7` | 408px / none | 0px 0px 0px 76px / 0px |
| secondary · `computed-023605417fc32575` | 300px / none | 24px 20px / 0px |
| link · `computed-c274950b47b2dbde` | 100.8125px / none | 0px / 0px |
| card · `computed-0bb61e0b7bfa7c4a` | 696px / none | 40px 0px 0px / 0px |
| border · `computed-c8740330c4f57a6c` | 508px / none | 0px 60px 0px 40px / 0px |
| section · `computed-af7160431f1d491f` | 1440px / none | 320px 0px 160px / 0px |

## Responsive observations

| Width | Role | Font size / line-height | Source observation |
|---|---|---|---|
| 393px | display | 32px / 41.6px | `computed-936143ec9a3fa94c` |
| 393px | heading | 44px / 44px | `computed-8389d233ce35c92a` |
| 393px | caption | 11px / 11px | `computed-5811ea036f0e4abf` |
| 393px | primary | 16px / 16px | `computed-478edbf2ffc395d6` |

1440·393px 및 light·dark 요청을 각각 보존했다. 원본이 같은 색을 유지하면 다크 테마 지원으로 해석하지 않는다. 미해소 역할은 observations.json의 pages[].missing에 남긴다.

## Applying this guide

- Keep the new project name, copy and product content. Do not copy source logos, wordmarks, proprietary media or unlicensed font files.
- Desktop measurements are evidence, not a responsive recipe. Wrap on small screens and record authored layout/mobile decisions separately.
- A -dark suffix records a dark color-scheme request; it does not prove that the preserved page implements a different dark theme.
- The recorded keyboard outline is 1px auto using colors.focus, offset 1px. Keep it in that control/panel context, not as a universal ring on unrelated surfaces.
- Use primary/on-primary as a pair only in the recorded painted context.
- A region-qualified foreground belongs only with its named panel/background; observed low-contrast or media-dependent values are evidence, not a reusable accessible pair.
- Measured zero outer padding does not require text against the edge. Use a nested wrapper and measured spacing for its actual context.
- 보조 비교: SK그룹 https://www.sk.com/ (접근 2026-10-27)의 .main_section_h는 #fc6620, 하이닉스의 #footer .privacy는 #ff6600이다. 주황 강조와 흑백 대비는 겹치지만 값은 동일하지 않다. 그룹 색을 하이닉스 토큰으로 대체하지 않는다.
- 측정 대표는 국문 메인이다. 큰 흰 영상 타이포를 밝은 데이터 표에 그대로 옮기지 않는다. 메인의 Investor Relations 제목과 흰 영역·평평한 구조를 앱의 출발점으로 삼는다.
- 본문·secondary는 영상 위 반투명 흰색이다. 원본 media 배경의 대비는 확정할 수 없으므로 범용 본문/버튼 색으로 사용하지 않는다.
- 제조 대시보드는 파생 적용이다. 흰 바탕·짙은 숫자·가는 규칙선·측정 주황을 작은 강조에 쓴다. 관측하지 않은 상태색/차트 팔레트/밀도는 관측값이라 부르지 않는다.
- 키트의 글꼴 스택은 "Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif만 쓴다. 외부 파일·CDN·@import를 추가하지 않는다. 로고·행복날개·워드마크·제품 사진 금지.
- 컴포넌트 및 데이터 표시 parts 통합은 2단계에서 수행한다.

## Observation references

Every scalar references observations.json → computed → id → styles → property. A derived backdrop explicitly records its source-over layers and algorithm. Raw page/style observations, local reproduction URLs and response hashes remain in the companion.

| Token | Observation id / property |
|---|---|
| `colors.brand-accent` | `computed-21e01ff06f74139c` / `color`; `computed-72d47f5fc4d93c13` / `color`; `computed-c274950b47b2dbde` / `color`; `computed-f688dff232e4a2f5` / `color` |
| `colors.primary` | `computed-9d2788e9889e6b40` / `background-color`; `computed-c27334ef8d216fc8` / `background-color` |
| `colors.on-primary` | `computed-249fa105ab5f23d7` / `color`; `computed-e26b54e3e1fe8f57` / `color` |
| `colors.display-text` | `computed-3137f18e89393793` / `color`; `computed-e96987453c597e7b` / `color` |
| `colors.section` | `computed-af7160431f1d491f` / `background-color`; `computed-c93b8d1127f22366` / `background-color` |
| `colors.heading-text` | `computed-48cbb2f2a611a1b9` / `color`; `computed-c4b83995fd14a541` / `color` |
| `colors.text-muted` | `computed-dd36c96cb03a3677` / `color`; `computed-5fe446e4653f09b3` / `color` |
| `colors.card` | `computed-0bb61e0b7bfa7c4a` / `background-color`; `computed-dbd7283844ab3e0b` / `background-color` |
| `colors.body-foreground-skhynix-dram` | `computed-8312c39e6e543abe` / `color`; `computed-7cde5b416e32e228` / `color`; `computed-c7167b083fb9e6cf` / `color`; `computed-d5b4b370cd02c42a` / `color` |
| `colors.focus` | `computed-ad238857763eef3c` / `outline-color`; `computed-b0f7c468dd02a06a` / `outline-color` |
| `typography.display.fontFamily` | `computed-3137f18e89393793` / `font-family` |
| `typography.display.fontSize` | `computed-3137f18e89393793` / `font-size` |
| `typography.display.fontWeight` | `computed-3137f18e89393793` / `font-weight` |
| `typography.display.lineHeight` | `computed-3137f18e89393793` / `line-height` |
| `typography.display.letterSpacing` | `computed-3137f18e89393793` / `letter-spacing` |
| `typography.heading.fontFamily` | `computed-48cbb2f2a611a1b9` / `font-family` |
| `typography.heading.fontSize` | `computed-48cbb2f2a611a1b9` / `font-size` |
| `typography.heading.fontWeight` | `computed-48cbb2f2a611a1b9` / `font-weight` |
| `typography.heading.lineHeight` | `computed-48cbb2f2a611a1b9` / `line-height` |
| `typography.heading.letterSpacing` | `computed-48cbb2f2a611a1b9` / `letter-spacing` |
| `typography.caption.fontFamily` | `computed-dd36c96cb03a3677` / `font-family` |
| `typography.caption.fontSize` | `computed-dd36c96cb03a3677` / `font-size` |
| `typography.caption.fontWeight` | `computed-dd36c96cb03a3677` / `font-weight` |
| `typography.caption.lineHeight` | `computed-dd36c96cb03a3677` / `line-height` |
| `typography.caption.letterSpacing` | `computed-dd36c96cb03a3677` / `letter-spacing` |
| `rounded.button` | `computed-9d2788e9889e6b40` / `border-radius` |
| `rounded.card` | `computed-0bb61e0b7bfa7c4a` / `border-radius` |
| `spacing.xs` | `computed-023605417fc32575` / `padding-right` |
| `spacing.sm` | `computed-023605417fc32575` / `padding-top` |
| `spacing.md` | `computed-9d2788e9889e6b40` / `padding-left` |
| `spacing.lg` | `computed-9d2788e9889e6b40` / `padding-right` |
| `spacing.xl` | `computed-af7160431f1d491f` / `padding-bottom` |
| `spacing.xxl` | `computed-af7160431f1d491f` / `padding-top` |
| `colors.text-observed-on-panel` | `computed-3b8f2810c794682d` / `color`; `computed-49a6b8851d7003e1` / `color` |
| `colors.body-surface-observed` | `computed-d054739f40c4353c` / `background-color`; `computed-3aa0bfc2ca8c8e02` / `background-color` |
| `colors.secondary-label-observed` | `computed-023605417fc32575` / `color`; `computed-e1939c8fc39dd5a5` / `color` |
| `colors.secondary-fill-observed` | `computed-023605417fc32575` / `background-color`; `computed-e1939c8fc39dd5a5` / `background-color` |
| `components.button-primary.padding` | `computed-9d2788e9889e6b40` / `padding` |
| `components.button-primary.backgroundColor` | `computed-9d2788e9889e6b40` / `background-color`; `computed-c27334ef8d216fc8` / `background-color` |
| `components.button-primary.textColor` | `computed-249fa105ab5f23d7` / `color`; `computed-e26b54e3e1fe8f57` / `color` |
| `components.button-primary.rounded` | `computed-9d2788e9889e6b40` / `border-radius` |
| `components.card.padding` | `computed-0bb61e0b7bfa7c4a` / `padding` |
| `components.card.backgroundColor` | `computed-0bb61e0b7bfa7c4a` / `background-color`; `computed-dbd7283844ab3e0b` / `background-color` |
| `components.card.rounded` | `computed-0bb61e0b7bfa7c4a` / `border-radius` |

## Sample sources

| Role | Page | Query | Light / dark request |
|---|---|---|---|
| body | skhynix-ko | `body` | light; dark |
| display | skhynix-ko | `.ir_wrap h2` | light; dark |
| heading | skhynix-ko | `.dbl_con h2` | light; dark |
| subheading | skhynix-ko | `#content h3` | not observed; omitted |
| body-text | skhynix-ko | `.dbl_con p.con` | light; dark |
| caption | skhynix-ko | `#footer .info span.menu` | light; dark |
| primary | skhynix-ko | `.ir_wrap a.menu` | light; dark |
| primary-label | skhynix-ko | `.ir_wrap a.menu .txt` | light; dark |
| secondary | skhynix-ko | `.dbl_con a.link_more` | light; dark |
| link | skhynix-ko | `#footer .privacy` | light; dark |
| card | skhynix-ko | `.ir_wrap .graph_con` | light; dark |
| border | skhynix-ko | `.ir_wrap a.menu` | light; dark |
| section | skhynix-ko | `.ir_wrap` | light; dark |
| brand-accent | skhynix-ko | `#footer .privacy` | light; dark |
| document-h1 | skhynix-ko | `#content h1` | not observed; omitted |
| paragraph | skhynix-ko | `not observed` | not observed; omitted |
| focus | skhynix-ko | `.ir_wrap a.menu` | light; dark |

## Kit CSS token reference

- `--skh-brand`: `#ff6600` · 파생 앱 매핑.
- `--skh-campaign`: `#ff8e20` · 파생 앱 매핑.
- `--skh-accent`: `#ff6600` · 파생 앱 매핑.
- `--skh-font`: `"Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif` · 파생 앱 매핑.
- `--skh-radius`: `0px` · 파생 앱 매핑.
- `--skh-status-normal`: `#333333` · 파생 앱 매핑.
- `--skh-status-warning`: `#854a11` · 파생 앱 매핑.
- `--skh-status-danger`: `#b50022` · 파생 앱 매핑.
- `--skh-status-info`: `#43444b` · 파생 앱 매핑.
- `--skh-data-accent`: `#ff6600` · 파생 앱 매핑.
- `--skh-data-ink`: `#212121` · 파생 앱 매핑.
- `--skh-data-muted`: `#666666` · 파생 앱 매핑.
- `--skh-data-line`: `#808080` · 파생 앱 매핑.
- `--skh-data-soft`: `#f5f5f5` · 파생 앱 매핑.
- `--skh-data-white`: `#ffffff` · 파생 앱 매핑.
- `--skh-data-context`: `#898989` · 파생 앱 매핑.
- `--skh-data-on-accent`: `#ffffff` · 파생 앱 매핑.
- `--skh-space-1`: `4px` · 파생 앱 매핑.
- `--skh-space-2`: `8px` · 파생 앱 매핑.
- `--skh-space-3`: `12px` · 파생 앱 매핑.
- `--skh-space-4`: `16px` · 파생 앱 매핑.
- `--skh-space-5`: `24px` · 파생 앱 매핑.
- `--skh-space-6`: `32px` · 파생 앱 매핑.
- `--skh-chart-categorical-1`: `#ff6600` · 파생 앱 매핑.
- `--skh-chart-categorical-2`: `#5c51d6` · 파생 앱 매핑.
- `--skh-chart-categorical-3`: `#007969` · 파생 앱 매핑.
- `--skh-chart-categorical-4`: `#b88800` · 파생 앱 매핑.
- `--skh-chart-categorical-5`: `#734c78` · 파생 앱 매핑.
- `--skh-chart-categorical-6`: `#333333` · 파생 앱 매핑.
- `--skh-chart-sequential-1`: `#b58088` · 파생 앱 매핑.
- `--skh-chart-sequential-2`: `#a85261` · 파생 앱 매핑.
- `--skh-chart-sequential-3`: `#96243b` · 파생 앱 매핑.
- `--skh-chart-sequential-4`: `#710016` · 파생 앱 매핑.
- `--skh-chart-sequential-5`: `#3b0009` · 파생 앱 매핑.
- `--skh-chart-diverging-1`: `#003f55` · 파생 앱 매핑.
- `--skh-chart-diverging-2`: `#368198` · 파생 앱 매핑.
- `--skh-chart-diverging-3`: `#898989` · 파생 앱 매핑.
- `--skh-chart-diverging-4`: `#c35868` · 파생 앱 매핑.
- `--skh-chart-diverging-5`: `#83001b` · 파생 앱 매핑.

### 다크 매핑 · 파생

- `--skh-status-normal`: `#ffffff`.
- `--skh-status-warning`: `#ffb66c`.
- `--skh-status-danger`: `#ff8fa3`.
- `--skh-status-info`: `#d2d5e4`.
- `--skh-data-accent`: `#ff9a55`.
- `--skh-data-ink`: `#ffffff`.
- `--skh-data-muted`: `#c5c5cf`.
- `--skh-data-line`: `#b5b8cc`.
- `--skh-data-soft`: `#33333b`.
- `--skh-data-white`: `#26262c`.
- `--skh-data-context`: `#b5b5c0`.
- `--skh-data-on-accent`: `#121212`.
- `--skh-chart-categorical-1`: `#ff9a55`.
- `--skh-chart-categorical-2`: `#b7aaff`.
- `--skh-chart-categorical-3`: `#54cfb8`.
- `--skh-chart-categorical-4`: `#b88800`.
- `--skh-chart-categorical-5`: `#d7a5df`.
- `--skh-chart-categorical-6`: `#ffffff`.
- `--skh-chart-sequential-1`: `#ffd9ba`.
- `--skh-chart-sequential-2`: `#ffc28d`.
- `--skh-chart-sequential-3`: `#f4a96b`.
- `--skh-chart-sequential-4`: `#d98b45`.
- `--skh-chart-sequential-5`: `#b36a20`.
- `--skh-chart-diverging-1`: `#53a7c2`.
- `--skh-chart-diverging-2`: `#a0d8e8`.
- `--skh-chart-diverging-3`: `#eeeeee`.
- `--skh-chart-diverging-4`: `#efb0bc`.
- `--skh-chart-diverging-5`: `#c76d83`.

## 실행 예시

```html
<html lang="ko" data-theme="light"><head><link rel="stylesheet" href="design.css"></head><body><main class="skh-dashboard"><button type="button" class="skh-button skh-button--primary">분석 실행</button></main></body></html>
```

`components.html`에 탭·모달·토스트·필터·정렬·행 선택의 인라인 JS가 있다. parts의 증거 ID는 출처 식별자이며 런타임 입력이 아니다. 원본 전체 관측/파생 근거는 공개 DESIGN.md가 연결하는 관측 자료에서 확인한다. 실제 CSV 분석/모델 호출은 적용 프로젝트가 구현하고 정적 데모를 실측 AI로 표시하지 않는다.
