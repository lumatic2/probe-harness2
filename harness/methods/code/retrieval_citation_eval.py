"""근거를 붙여 답하기 — 조치 기록 검색의 평가: Top-k 적중 · MRR · 인용 정확도 · 근거 없는 답 비율 · 답 없음 처리.
실행: python retrieval_citation_eval.py   (numpy 만, API 키·네트워크 없음)
입력: 조치 기록 표 notes(note_id, symptom, cause, action — 한국어 자유 텍스트) + 평가 세트 questions(질문, 정답 근거 id 집합, 답 가능 여부).
검색기: 문자 2-gram+3-gram TF-IDF 코사인(형태소 분석기 없이 조사·띄어쓰기 변이를 견디려는 선택 — 추론).
LLM 이 인용한 id 를 평가하려면 citation_metrics(answers, ...) 의 answers 에 {질문 번호: [인용 id,...]} (빈 리스트 = 답 없음) 를 넣으면 된다.
데이터는 전부 합성이다. 이 숫자는 이 합성 세트의 값이며 현장 성능이 아니다.
"""
import math
import re
import sys
import numpy as np

# ---------------------------------------------------------------- 합성 조치 기록 40건 (장면 12개 x 3 표현 + 일반 4)
# (장면, 증상, 원인, 조치) — 같은 장면이라도 표현·약어·영문 혼용·띄어쓰기를 일부러 다르게 썼다.
RAW = [
    ("A", "식각 챔버 압력 헌팅, 설정 대비 ±3mTorr 흔들림", "스로틀 밸브 위치 피드백 지연, 밸브 구동부 마모", "스로틀 밸브 어셈블리 교체, 압력 안정 확인 후 재가동"),
    ("A", "챔버 압력이 설정값 못 따라가고 출렁임. 압력 제어 불안정 알람", "스로틀 벨브 액추에이터 마모로 응답 느림", "밸브 액추에이터 교환 후 압력 루프 튜닝"),
    ("A", "PRESSURE HUNTING 알람 반복, 가스 유량은 정상", "압력 제어용 밸브 슬로우 응답 (구동 모터 열화)", "구동 모터 교체, 리크 체크 정상"),
    ("B", "RF 반사전력 증가, 플라즈마 점화 실패 간헐 발생", "매칭 박스 가변 커패시터 접점 불량", "매칭 박스 커패시터 교체 및 RF 캘리브레이션"),
    ("B", "Reflected power 알람, 식각률 편차 확대", "매처 내부 진공 커패시터 열화", "매처 유닛 교환 후 반사전력 0.5% 이하 확인"),
    ("B", "플라즈마가 켜졌다 꺼짐, RF 파워 미스매치 경고", "RF 매칭 네트워크 커넥터 체결 느슨 및 탄 자국", "커넥터 재체결 및 손상 부품 교체"),
    ("C", "정전척 He 유량 상승, 웨이퍼 온도 균일도 악화", "백사이드 헬륨 라인 피팅 리크", "헬륨 라인 피팅 재체결 후 리크 테스트 통과"),
    ("C", "He backside flow 높음 알람, 웨이퍼 에지 CD 편차", "ESC 가장자리 씰 링 마모로 헬륨 새어나감", "씰 링 교체, He 리크 레이트 재측정"),
    ("C", "후면 냉각 가스 압력 유지 불가, 척킹 후 온도 드리프트", "헬륨 공급 라인 용접부 미세 리크", "라인 교체, 헬륨 리크 디텍터 확인"),
    ("D", "CMP 연마량(제거율) 저하, 목표 두께 미달 연속 발생", "슬러리 공급 펌프 다이어프램 노화로 유량 부족", "슬러리 펌프 다이어프램 교체 후 유량 재교정"),
    ("D", "연마 후 잔막 두께가 두껍게 나옴, 슬러리 유량 알람", "공급 펌프 맥동으로 슬러리 유량 편차", "펌프 교체, 슬러리 라인 플러싱"),
    ("D", "removal rate 하락 추세, 패드는 교체한지 얼마 안됨", "슬러리 필터 막힘으로 공급량 감소", "슬러리 라인 필터 교체, 유량 확인"),
    ("E", "CMP 후 웨이퍼 스크래치 증가, 검사에서 미세 선형 결함", "컨디셔너 다이아몬드 디스크 수명 초과로 입자 탈락", "컨디셔너 디스크 교체 및 패드 브레이크인"),
    ("E", "연마 웨이퍼 표면 긁힘 결함 급증", "패드 컨디셔닝 디스크 다이아 입자 이탈", "디스크 신품 교체, 더미 웨이퍼로 확인"),
    ("E", "스크래치성 불량 LOT 다수, 패드 사용 시간 한계 근접", "노후 패드 표면 글레이징과 컨디셔너 마모", "패드와 컨디셔너 동시 교체"),
    ("F", "웨이퍼 척킹 에러, 디척 시 웨이퍼 튐", "정전척 표면 부산물 막 증착으로 정전력 저하", "챔버 웻 클리닝, 척 표면 세정"),
    ("F", "ESC 클램프 전압 이상, 웨이퍼 고정 불량", "척 표면에 폴리머 잔류물 누적", "척 세정 및 시즈닝 후 클램핑 시험 통과"),
    ("F", "chucking fail 알람 반복, 후면 He 유량 이상 동반", "척 유전층 오염 (식각 부산물)", "정전척 세정, 시즈닝 웨이퍼 3매"),
    ("G", "가스 유량 실측과 설정 차이 커짐 (O2 MFC), 증착 두께 편차", "MFC 센서 영점 드리프트", "MFC 영점 보정 후 유량 검증"),
    ("G", "공정 가스 flow 편차 알람, 박막 두께 점점 얇아짐", "질량유량계 오프셋 누적", "MFC 교체, 가스 라인 퍼지"),
    ("G", "유량 센서 값 흔들림, 레시피 가스량과 다름", "MFC 밸브 오리피스 부분 막힘", "MFC 클리닝 후 재교정"),
    ("H", "드라이 펌프에서 소음과 진동 증가, 배기 압력 서서히 상승", "펌프 베어링 마모", "펌프 교체 (예비기 투입)"),
    ("H", "진공 펌프 온도 알람, 모터 전류 상승", "로터 부산물 고착, 베어링 부하 증가", "펌프 오버홀 업체 의뢰, 대체 펌프 장착"),
    ("H", "챔버 배기 속도 느려짐, 러핑 시간 길어짐", "드라이펌프 성능 저하(분말 누적)", "펌프 세정 및 교체 판단"),
    ("I", "냉각수 온도 알람, 챔버 벽 온도 상승", "칠러 순환 유량 저하, 스트레이너 이물 막힘", "스트레이너 청소, 유량 정상 확인"),
    ("I", "chiller 온도 편차 커짐, 히터 계속 가동", "냉각수 필터 포화 및 밸브 개도 부족", "필터 교체, 밸브 개도 재설정"),
    ("I", "챔버 온도 상승 경고, 냉각수 유량 낮음", "칠러 펌프 임펠러 마모", "칠러 순환 펌프 교체"),
    ("J", "이송 중 웨이퍼 위치 오프셋 알람, 로드락에서 센터링 실패", "이송 로봇 티칭 포인트 틀어짐 (충돌 이력 후)", "로봇 오토 티칭 재실시"),
    ("J", "웨이퍼 핸들러 슬립, 웨이퍼 가장자리 긁힘 발견", "로봇 블레이드 패드 마모와 티칭 편차", "블레이드 패드 교체 및 티칭"),
    ("J", "FOUP 로딩 후 매핑 에러, 웨이퍼 틀어짐", "로봇 티칭 좌표 드리프트", "포트 티칭 재조정"),
    ("K", "PR 코팅 두께 불균일, 웨이퍼 한쪽 얇음", "포토레지스트 노즐 끝 건조 고착", "노즐 세정 및 더미 디스펜스 주기 단축"),
    ("K", "코터 도포 두께 산포 증가", "레지스트 토출 노즐 부분 막힘", "노즐 교체 및 토출량 교정"),
    ("K", "코팅 후 줄무늬 결함", "노즐 팁 레지스트 건조물", "팁 세정, 서크 밸브 점검"),
    ("L", "노광 도즈 편차, 에너지 센서 값 점진 하락", "조명계 렌즈 오염", "렌즈 클리닝 및 도즈 재캘리브레이션"),
    ("L", "CD 균일도 악화, 노광 에너지 부족 알람", "레이저 모듈 출력 저하", "레이저 튜브 교체"),
    ("L", "exposure dose drift 알람", "광학계 미러 오염으로 투과율 저하", "미러 클리닝, 도즈 캘"),
    ("M1", "정기 PM 수행, 특이사항 없음", "해당 없음", "소모품 점검 및 챔버 클리닝"),
    ("M2", "작업자 실수로 레시피 선택 오류", "레시피 버전 혼동", "레시피 재선택 후 재투입"),
    ("M3", "장비 소프트웨어 통신 끊김 (EAP)", "네트워크 스위치 포트 불량", "스위치 포트 변경"),
    ("M4", "화면 멈춤, 장비 컨트롤러 재부팅", "컨트롤러 메모리 누수", "소프트웨어 패치 적용"),
]


def make_notes(seed=11):
    """note_id 를 난수 순열로 붙여 같은 장면이 연속 번호가 되지 않게 한다. 반환: [(note_id, 장면, 텍스트)]"""
    order = np.random.default_rng(seed).permutation(len(RAW))
    return [(f"N{pos + 1:03d}", RAW[i][0], " ".join(RAW[i][1:])) for pos, i in enumerate(order)]


# 평가 세트: (질문, 정답 근거 장면 키 집합, 답 가능 여부).  정답 id 는 장면 키로 라벨링한다(검색기와 무관).
# 장면 키가 3개짜리 장면이면 그 3건이 모두 정답 근거, 단일 지정(예 "I3")이면 그 한 건만 정답.
QUESTIONS = [
    ("압력이 설정값 주변에서 계속 흔들리는데 어떤 조치를 했었나?", {"A"}, True),
    ("플라즈마 점화가 간헐적으로 실패하고 반사 전력이 올라간다", {"B"}, True),
    ("웨이퍼 후면 헬륨 유량이 올라갈 때 원인은", {"C"}, True),
    ("CMP 제거율이 떨어질 때 슬러리 쪽 점검 이력", {"D"}, True),
    ("연마 후 웨이퍼에 스크래치가 늘었다", {"E"}, True),
    ("척킹 에러가 반복되는 장비의 조치 기록", {"F"}, True),
    ("O2 가스 유량이 설정과 안 맞음", {"G"}, True),
    ("드라이 펌프 진동과 소음이 커졌을 때", {"H"}, True),
    ("냉각수 온도 알람 났는데 유량이 낮았던 사례", {"I"}, True),
    ("웨이퍼가 이송 중에 틀어지는 로봇 문제", {"J"}, True),
    ("포토레지스트 코팅 두께가 한쪽만 얇을 때", {"K"}, True),
    ("노광 에너지 도즈가 흔들리는 사례", {"L"}, True),
    ("챔버 안 압력 제어가 불안정했던 건 밸브를 바꿔서 해결됐나", {"A"}, True),
    ("정전척에 부산물이 쌓여서 웨이퍼가 안 붙는 경우", {"F"}, True),
    ("He 리크 났던 적 있나, 라인 어디가 샜지", {"C"}, True),
    ("EAP 통신이 끊겼을 때 조치", {"M3"}, True),
    ("레시피를 잘못 골라서 투입한 건", {"M2"}, True),
    ("정기 PM 때 이상 없던 기록", {"M1"}, True),
    ("조명계 렌즈 오염으로 도즈 재캘리브레이션 한 건", {"L#0"}, True),   # 단일 정답: 장면 L 의 첫 번째 표현
    ("MFC 영점 드리프트 보정 사례", {"G#0"}, True),
    ("칠러 순환 펌프 임펠러 마모로 교체한 사례", {"I#2"}, True),
    ("패드와 컨디셔너를 같이 교체한 LOT", {"E#2"}, True),
    # 어휘가 기록과 거의 안 겹치게 쓴 질문(동의어·우회 표현) — 문자 n-gram 검색의 약점을 보려고 일부러 넣었다
    ("웨이퍼 표면이 긁혀서 나오는 불량이 늘었다", {"E"}, True),
    ("가스가 어디선가 새는 것 같다 냉각용 불활성 가스", {"C"}, True),
    ("센서 기준점이 틀어져서 측정값이 어긋났을 때", {"G"}, True),
    ("장비가 멈춰서 껐다 켜서 복구한 사례", {"M4"}, True),
    ("이온 주입기 빔 전류가 불안정할 때 조치", set(), False),
    ("웨이퍼 본딩 보이드 불량 원인", set(), False),
    ("TSV 구리 전해도금 첨가제 농도 조정 이력", set(), False),
    ("작년 4분기 전체 다운타임 합계는?", set(), False),       # 계산 질문 — 검색이 아니라 표 계산으로 보낼 것
    ("HBM 적층 접합 온도 프로파일 설정값", set(), False),
    ("야간조 교대 인원 편성표", set(), False),
]


def gold_ids(notes, keys):
    """정답 장면 키 -> note_id 집합.  'A' = 장면 A 전체, 'A#1' = 장면 A 의 두 번째 기록(RAW 에 쓴 순서)."""
    out = set()
    for k in keys:
        scene, _, idx = k.partition("#")
        ids = [nid for nid, sc, _ in notes if sc == scene]
        # RAW 의 장면 내 순서를 복원: 텍스트로 RAW 와 대조
        raw_order = [" ".join(r[1:]) for r in RAW if r[0] == scene]
        if idx == "":
            out |= set(ids)
        else:
            text = raw_order[int(idx)]
            out |= {nid for nid, sc, t in notes if sc == scene and t == text}
    return out


# ---------------------------------------------------------------- 검색기: 문자 n-gram TF-IDF
def ngrams(text, ns=(2, 3)):
    s = re.sub(r"[^0-9A-Za-z가-힣]", "", text).lower()
    out = []
    for n in ns:
        out += [s[i:i + n] for i in range(len(s) - n + 1)]
    return out


class Retriever:
    def __init__(self, texts, ns=(2, 3)):
        self.ns = ns
        grams = [ngrams(t, ns) for t in texts]
        vocab = sorted({g for gs in grams for g in gs})
        self.index = {g: i for i, g in enumerate(vocab)}
        N = len(texts)
        df = np.zeros(len(vocab))
        for gs in grams:
            for g in set(gs):
                df[self.index[g]] += 1
        self.idf = np.log((1 + N) / (1 + df)) + 1.0          # 평활 idf: ln((1+N)/(1+df)) + 1
        self.M = np.vstack([self._vec(gs) for gs in grams])

    def _vec(self, gs):
        v = np.zeros(len(self.index))
        for g in gs:
            if g in self.index:
                v[self.index[g]] += 1.0
        v *= self.idf
        n = np.linalg.norm(v)
        return v / n if n > 0 else v

    def scores(self, query):
        return self.M @ self._vec(ngrams(query, self.ns))

    def rank(self, query, ids):
        """점수 내림차순 (동점은 입력 순서). 반환 [(id, score)]"""
        sc = self.scores(query)
        order = sorted(range(len(ids)), key=lambda i: (-sc[i], i))
        return [(ids[i], float(sc[i])) for i in order]


# ---------------------------------------------------------------- 지표
def first_gold_rank(ranked_ids, gold):
    for r, nid in enumerate(ranked_ids, 1):
        if nid in gold:
            return r
    return None


def hit_at_k(ranks, k):
    return sum(1 for r in ranks if r is not None and r <= k) / len(ranks)


def mrr(ranks):
    return sum(1.0 / r for r in ranks if r is not None) / len(ranks)


def citation_metrics(answers, golds, answerable):
    """answers[i] = 질문 i 의 인용 id 리스트(빈 리스트 = 답 없음). golds[i] = 정답 근거 id 집합. answerable[i] = 답이 있어야 하는 질문인가.
    반환 dict:
      coverage       답 가능 질문 중 답을 낸 비율
      citation_prec  답한 답 가능 질문들의 인용 id 중 정답 근거 비율 (micro)
      unsupported    답을 낸 질문 중 '근거 없는 답' 비율 = (답 없음이어야 하는데 답함 + 정답 근거를 하나도 인용 못 하고 답함) / 답한 수
      refusal_acc    답 없음이어야 하는 질문을 실제로 거절한 비율
    """
    ans_idx = [i for i, a in enumerate(answers) if a]
    pos = [i for i in range(len(answers)) if answerable[i]]
    neg = [i for i in range(len(answers)) if not answerable[i]]
    cited = sum(len(answers[i]) for i in ans_idx if answerable[i])
    good = sum(len(set(answers[i]) & golds[i]) for i in ans_idx if answerable[i])
    bad_ans = sum(1 for i in ans_idx if (not answerable[i]) or not (set(answers[i]) & golds[i]))
    return {
        "coverage": sum(1 for i in pos if answers[i]) / len(pos) if pos else float("nan"),
        "citation_prec": good / cited if cited else float("nan"),
        "unsupported": bad_ans / len(ans_idx) if ans_idx else 0.0,
        "refusal_acc": sum(1 for i in neg if not answers[i]) / len(neg) if neg else float("nan"),
    }


def wilson(k, n, z=1.959964):
    """이항 비율 k/n 의 95% Wilson 구간.  20개 질의 중 19개 통과 같은 작은 표본의 불확실성을 보이는 용도."""
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return c - h, c + h


# ---------------------------------------------------------------- 답 만들기(검색만) — LLM 이 있으면 그 인용 id 로 교체해 같은 지표를 쓴다
def answer_from_retrieval(ranked, thr, cite_n=3):
    """1위 점수가 thr 미만이면 답 없음(빈 리스트). 아니면 상위 cite_n 중 점수가 thr 이상인 id 를 인용."""
    if not ranked or ranked[0][1] < thr:
        return []
    return [nid for nid, s in ranked[:cite_n] if s >= thr]


def pick_threshold(top1, answerable):
    """개발 세트에서 임계값 선택: (답 가능 질문 답함 비율) - (답 불가 질문 답함 비율) 최대, 동률이면 낮은 쪽. 후보 = 인접 1위 점수의 중간값."""
    s = sorted(set(top1))
    cands = [(a + b) / 2 for a, b in zip(s, s[1:])]
    best, best_j = cands[0], -9.0
    for t in cands:
        pos = [x >= t for x, a in zip(top1, answerable) if a]
        neg = [x >= t for x, a in zip(top1, answerable) if not a]
        j = (sum(pos) / len(pos) if pos else 0) - (sum(neg) / len(neg) if neg else 0)
        if j > best_j + 1e-12:
            best, best_j = t, j
    return best, best_j


def evaluate(notes, ret, ids, split, thr, ks=(1, 3, 5)):
    """split = 평가할 질문 번호 리스트. 반환 (지표 dict, 질문별 순위 리스트)"""
    ranks, answers, golds, ansb = [], [], [], []
    for qi in split:
        q, keys, can = QUESTIONS[qi]
        g = gold_ids(notes, keys)
        ranked = ret.rank(q, ids)
        ansb.append(can)
        golds.append(g)
        answers.append(answer_from_retrieval(ranked, thr))
        if can:
            ranks.append(first_gold_rank([n for n, _ in ranked], g))
    m = {f"hit@{k}": hit_at_k(ranks, k) for k in ks}
    m["mrr"] = mrr(ranks)
    m.update(citation_metrics(answers, golds, ansb))
    m["n_answerable"], m["n_unanswerable"] = len(ranks), len(split) - len(ranks)
    return m, ranks


def fmt(m):
    return (f"Hit@1 {m['hit@1']:.3f} · Hit@3 {m['hit@3']:.3f} · Hit@5 {m['hit@5']:.3f} · MRR {m['mrr']:.3f} | 답함 {m['coverage']:.3f} · 인용 정확도 {m['citation_prec']:.3f} · "
            f"근거 없는 답 {m['unsupported']:.3f} · 거절 정확도 {m['refusal_acc']:.3f} (답 가능 {m['n_answerable']} / 답 불가 {m['n_unanswerable']})")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    notes = make_notes()
    ids, texts = [n[0] for n in notes], [n[2] for n in notes]
    ret = Retriever(texts)
    print(f"[합성 조치 기록] {len(notes)}건, 평가 질문 {len(QUESTIONS)}개 (답 가능 {sum(q[2] for q in QUESTIONS)} · 답 불가 {sum(not q[2] for q in QUESTIONS)}), 어휘 {len(ret.index)}개 n-gram")

    dev = [i for i in range(len(QUESTIONS)) if i % 2 == 0]      # 임계값을 고르는 세트
    test = [i for i in range(len(QUESTIONS)) if i % 2 == 1]     # 임계값을 모르는 채 보고하는 세트
    top1 = lambda split: [ret.rank(QUESTIONS[i][0], ids)[0][1] for i in split]
    thr, j = pick_threshold(top1(dev), [QUESTIONS[i][2] for i in dev])
    print(f"[임계값] 개발 세트(짝수 번호 {len(dev)}개)에서 선택: 1위 점수 {thr:.3f} 미만이면 답 없음 (선택 기준 값 {j:.2f})")
    print("  1위 점수 — 답 가능: " + " ".join(f"{s:.2f}" for s in sorted(top1([i for i in range(len(QUESTIONS)) if QUESTIONS[i][2]]))))
    print("  1위 점수 — 답 불가: " + " ".join(f"{s:.2f}" for s in sorted(top1([i for i in range(len(QUESTIONS)) if not QUESTIONS[i][2]]))))

    m_all, ranks_all = evaluate(notes, ret, ids, list(range(len(QUESTIONS))), thr)
    m_dev, _ = evaluate(notes, ret, ids, dev, thr)
    m_test, _ = evaluate(notes, ret, ids, test, thr)
    print("전체  :", fmt(m_all))
    print("개발  :", fmt(m_dev), "  <- 임계값을 고른 세트라 낙관적")
    print("시험  :", fmt(m_test), "  <- 보고는 이 줄")
    k3 = round(m_all["hit@3"] * m_all["n_answerable"])
    lo, hi = wilson(k3, m_all["n_answerable"])
    print(f"Hit@3 {k3}/{m_all['n_answerable']} 의 95% Wilson 구간: {lo:.3f} ~ {hi:.3f}  (질문 수가 적으면 구간이 넓다)")
    miss = [(QUESTIONS[i][0], r) for i, r in zip([i for i in range(len(QUESTIONS)) if QUESTIONS[i][2]], ranks_all) if r is None or r > 3]
    print("Top-3 밖 질문:", miss if miss else "없음")

    # ================= 독립 하드체크 =================
    # (1) 완전 일치 질문은 반드시 1위: 기록 본문 전체를 질문으로 넣으면 자기 자신이 1위, 점수 1.0
    for nid, _, t in notes:
        r = ret.rank(t, ids)
        assert r[0][0] == nid and abs(r[0][1] - 1.0) < 1e-9, (nid, r[:2])
    # (2) 손계산 소형 사례: 문서 3개, 2-gram. df(가나)=1, df(나다)=2, df(다라)=1 -> idf = ln(4/2)+1=1.693147, ln(4/3)+1=1.287682
    #     질문 '가나다' = 문서0 과 같은 벡터. cos(질문,문서1) = idf2^2/(idf1^2+idf2^2) = 1.658/4.525 = 0.36645, 문서2 와는 공통 n-gram 없음 = 0
    tiny = Retriever(["가나다", "나다라", "라마바"], ns=(2,))
    sc = tiny.scores("가나다")
    i1, i2 = math.log(4 / 2) + 1, math.log(4 / 3) + 1
    assert abs(i1 - 1.693147) < 1e-6 and abs(i2 - 1.287682) < 1e-6
    assert abs(sc[0] - 1.0) < 1e-12 and abs(sc[1] - 0.36645) < 1e-5 and sc[2] == 0.0, sc
    assert [x for x, _ in tiny.rank("가나다", ["d0", "d1", "d2"])] == ["d0", "d1", "d2"]
    # (3) 지표 손계산: 첫 정답 순위 [1,3,None] -> Hit@1=1/3, Hit@3=2/3, MRR=(1+1/3+0)/3=4/9
    assert abs(hit_at_k([1, 3, None], 1) - 1 / 3) < 1e-12 and abs(hit_at_k([1, 3, None], 3) - 2 / 3) < 1e-12
    assert abs(mrr([1, 3, None]) - 4 / 9) < 1e-12
    #     인용 지표 손계산: 질문4개 [답가능-맞춤, 답가능-엉뚱, 답가능-거절, 답불가-답함]
    cm = citation_metrics([["a", "b"], ["x"], [], ["z"]], [{"a"}, {"y"}, {"c"}, set()], [True, True, True, False])
    assert abs(cm["coverage"] - 2 / 3) < 1e-12            # 답가능 3개 중 2개 답함
    assert abs(cm["citation_prec"] - 1 / 3) < 1e-12       # 인용 3개(a,b,x) 중 정답 1개(a)
    assert abs(cm["unsupported"] - 2 / 3) < 1e-12         # 답한 3개 중 근거 없는 답 2개(x 질문, z 질문)
    assert cm["refusal_acc"] == 0.0                       # 답불가 1개를 거절하지 못함
    # (4) Wilson 손계산: 19/20 -> 중심 (0.95+0.0960)/1.1921=0.8775, 반폭 0.1136 -> [0.7639, 0.9911]
    lo19, hi19 = wilson(19, 20)
    assert abs(lo19 - 0.7639) < 1e-3 and abs(hi19 - 0.9911) < 1e-3, (lo19, hi19)
    # (5) 일관성: Hit@1 <= Hit@3 <= Hit@5, Hit@1 <= MRR <= 1
    assert m_all["hit@1"] <= m_all["hit@3"] <= m_all["hit@5"] and m_all["hit@1"] <= m_all["mrr"] <= 1.0
    # (6) 기록 순서를 바꿔도 1위 점수가 같다 (순서 불변)
    perm = np.random.default_rng(5).permutation(len(ids))
    ret2 = Retriever([texts[i] for i in perm])
    ids2 = [ids[i] for i in perm]
    for q, _, _ in QUESTIONS:
        assert abs(ret.rank(q, ids)[0][1] - ret2.rank(q, ids2)[0][1]) < 1e-9
    # (7) 음성 대조: 정답 id 를 무작위로 바꿔 끼우면 Hit@3 이 크게 떨어져야 한다 (평가가 아무 답에나 통과하지 않는다는 증거)
    rng = np.random.default_rng(9)
    pos_idx = [i for i in range(len(QUESTIONS)) if QUESTIONS[i][2]]
    fake = [first_gold_rank([n for n, _ in ret.rank(QUESTIONS[i][0], ids)],
                            set(rng.choice(ids, size=len(gold_ids(notes, QUESTIONS[i][1])), replace=False))) for i in pos_idx]
    assert hit_at_k(fake, 3) < m_all["hit@3"] - 0.3, (hit_at_k(fake, 3), m_all["hit@3"])
    # (8) 정답 라벨 점검: 장면 키 'A' 는 3건, 'I#2' 는 정확히 1건이고 그 텍스트가 RAW 의 해당 행
    assert len(gold_ids(notes, {"A"})) == 3 and len(gold_ids(notes, {"I#2"})) == 1
    only = next(iter(gold_ids(notes, {"I#2"})))
    assert "임펠러" in dict((n, t) for n, _, t in notes)[only]
    # (9) 임계값 극단: thr=0 이면 모든 질문에 답함(거절 정확도 0), thr>1 이면 아무것도 답하지 않음(답함 0, 근거 없는 답 0)
    m0, _ = evaluate(notes, ret, ids, list(range(len(QUESTIONS))), 0.0)
    m2, _ = evaluate(notes, ret, ids, list(range(len(QUESTIONS))), 1.01)
    assert m0["refusal_acc"] == 0.0 and m2["coverage"] == 0.0 and m2["unsupported"] == 0.0 and m2["refusal_acc"] == 1.0
    # (10) 약한 하한: 무작위 3건 인용의 기대 Hit@3 보다 충분히 높다 (40건 중 정답 3건이면 약 0.2)
    assert m_all["hit@3"] > 0.5
    print("하드체크 통과")
