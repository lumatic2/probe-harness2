# 권한 상속 RAG — 「원문을 못 여는 사람은 요약으로도 못 읽는다」

> [정보보안](README.md) › 02 · 짝 기법: 없음
> 원 분야 사실에는 근거 등급을 달았고, 반도체로 옮긴 부분(가정 변환·적용 예·지표·6시간 형태)은 별도 표시가 없으면 전부 **추론**이다. 모듈 주의는 [모듈 README](README.md), 표기는 [입구](../../README.md) 「표기」.

## 바로 쓰는 칸
- **쓸 점**: 같은 질문을 권한이 다른 두 사용자가 던지면 답이 다르게 나오도록, 검색 단계에서 원문 권한으로 거른다.
- **필요한 데이터**: 문서 청크마다 allowed_groups 필드(가짜 문서 20~30개 가능). 원문 권한 축(공정·제품·고객·협력사)이 없으면 못 쓴다.
- **6시간 최소 형태**: allowed_groups ∩ user_groups ≠ ∅ 필터를 LLM 호출 전에 건다. 화면: 사용자 두 명 나란히 보기 + 「거른 문서 수 n건」.
- **반문 하나**: 「필드를 응답에서 숨기면 되지 않나」 → Azure 문서도 retrievable=false 는 보호 장치가 아니고 필터를 매 질의에 걸어야 한다고 적는다.
- **하지 말 것**: 생성 뒤에 거르지 않는다. 팹에서 RAG 접근 통제를 운영한 공개 1차 사례는 근거 없음 — 팹 연결은 전부 추론이다.

## 상세

**한 줄**: 「엔터프라이즈 검색에서는 검색 결과가 권한 밖 문서를 드러내는 문제를 여러 부서가 한 색인을 같이 쓰는 상황에서 풀 때 문서마다 원문 ACL 을 색인에 실어 질의자의 그룹으로 매 질의를 거르는 보안 트리밍을 쓴다. 이 기법은 「문서 권한이 원본 저장소에 이미 정리돼 있다」고 가정한다. 이 가정을 팹 문서의 실제 권한 축(공정·제품·고객 프로젝트·협력사 구분)으로 바꾸면 사내 SOP·8D·장비 매뉴얼 질의응답 과제에 적용된다.」

- **과제 문구 신호**(추론): 「사내 문서」「SOP」「지식 검색」「챗봇」「매뉴얼」「노하우 전수」「신입 교육」.
- **가정 변환**

| 원래 가정 | 팹으로 바꾼 것 |
|---|---|
| 권한 = 사용자·그룹 ID | 공정 모듈(포토·식각·CMP…), 제품·고객 프로젝트, 사내/협력사 구분, 등급(대외비 등) |
| 문서 = 파일 하나 | 문서 안에서도 절마다 등급이 다르다(SOP 본문 공개, 레시피 표는 제한) → 청크 단위 라벨 |
| 위협 = 남의 파일 열람 | 요약·비교·통계 답변을 통한 간접 노출(「A 제품과 B 제품 조건 차이는?」) |
| 권한 변경은 드물다 | 프로젝트 배정·퇴사·협력사 계약 종료로 자주 바뀐다 → 색인의 권한 필드 갱신 주기가 위험 |

- **원 분야 사실**
  - OWASP LLM08:2025 — 「Implement fine-grained access controls and permission-aware vector and embedding stores. Ensure strict logical and access partitioning of datasets in the vector database to prevent unauthorized access between different classes of users or different groups.」
  - 임베딩 역산으로 원문을 상당 부분 복원할 수 있다고도 적는다.
  - Microsoft Learn(Azure AI Search 보안 트리밍, 벤더 문서) — 「It isn't a content-obfuscation or field-level security mechanism. In this pattern, document-level authorization is enforced by applying the security filter to every query.」
  - NIST SP 800-207 의 최소 권한 원칙이 바탕이다([03](03-조회-예산과-정책-결정점.md)).
- **하이닉스 적용 예**(추론): 사내 SOP·장비 매뉴얼·8D 보고서·고객 품질 문서 챗봇. 문서마다 열람 범위가 다르다.
- **기준선과 지표**: 따로 정해 둔 지표는 없다. 기준선 = 권한 거르기 없는 검색(가정), 지표 = 화면에 찍히는 「거른 문서 수 n건」과 사용자별 답의 차이.
- **6시간 최소 형태**
  - 화면: 같은 질문을 사용자 두 명(포토 엔지니어 / 협력사 FSE)으로 던져 답이 다르게 나오는 나란히 보기 + 「거른 문서 수 n건」 표시.
  - 데이터: 가짜 문서 20~30개, 청크마다 `allowed_groups` 필드.
  - 계산: 검색 단계에서 `allowed_groups ∩ user_groups ≠ ∅` 필터를 **LLM 호출 전에** 건다(생성 뒤에 거르지 않는다).
- **반론과 답**: 「필드를 응답에서 숨기면 되지 않나」 → Azure 문서도 retrievable=false 가 보호 장치가 아니고 **필터를 매 질의에 걸어야** 한다고 적는다. 「읽기 권한 통제가 출력까지 덮지는 않는다」는 같은 방향의 주장이다(외부 출처 미확인). 출력 쪽은 [04](04-변조-방지-감사-로그.md)의 로그가 맡는다. 「임베딩만 저장하면 안전하다」 → 임베딩 역산으로 원문을 상당 부분 복원할 수 있다고 OWASP 가 적는다.
- **짝 기법**: 없음(순수 시스템 설계)
- **근거** (접근 2026-11-10)
  - OWASP, LLM08:2025 Vector and Embedding Weaknesses — https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/ · **E3**. 판이 바뀌면 문구가 달라질 수 있다.
  - Microsoft Learn, 「Security filters for trimming results in Azure AI Search」 — https://learn.microsoft.com/en-us/azure/search/search-security-trimming-for-azure-search · **E4**(벤더 문서).
  - NIST SP 800-207 — https://doi.org/10.6028/NIST.SP.800-207 · **E3**.
  - 반도체 팹에서 RAG 접근 통제를 운영한 공개 1차 사례: **근거 없음**. 팹 연결은 전부 추론이다.
