# 동봉 디자인 자산

| 자산 | 위치 | 용도 |
|---|---|---|
| 공식 SK hynix 영문 CI | `assets/sk-hynix-ci.png` | 선택한 화면 헤더·소개·보고서에만 사용. 투명 PNG 220×116, 가로 110px 안팎 권장 |
| Pretendard Variable | `../fonts/PretendardVariable.woff2` | 한국어 앱 폰트. OFL 라이선스 동봉 |
| SK 색·화면 예시 | `design.css`·`components.html` | 기존 디자인 키트 |

CI는 [SK hynix 공식 CI 페이지](https://www.skhynix.com.cn/prCi.jsp)의 [PNG 원본](https://www.skhynix.com.cn/images/prCi.png)을 변경 없이 내려받았다(접근 2026-10-30). RGBA 알파 최솟값 0·최댓값 255 확인, 흰 배경 제거·재그림 없음. 다운로드 무결성은 `assets/manifest.json`의 SHA-256으로 확인한다. 공식 뉴스룸의 국문/영문 다운로드는 JPEG여서 투명 자산으로 채택하지 않았다.

로고는 상표이며 오픈소스 코드 라이선스가 적용되는 자산으로 표시하지 않는다. 공식 로고 비율·색·심벌과 글자 조합을 유지한다. 사용자 요청(2026-10-30)에 따라 shadcn 공통 사이드바에 로고를, 그 아래에 앱 제목을 표시한다. 제품·건물 사진은 과제와 무관한 장식을 늘려 제외했다.

shadcn 생성 후에는 `public/brand/sk-hynix-ci.png`를 `/brand/sk-hynix-ci.png`로 참조한다. 예: `<img src="/brand/sk-hynix-ci.png" alt="SK hynix" width="110" height="58" />`. 외부 서버 요청 없이 쓴다. 기존 DESIGN.md 원본의 로고 복제 금지는 디자인 수집 시 규칙이며, 이 명시 요청으로 확보한 자산의 선택 사용은 허용한다.
