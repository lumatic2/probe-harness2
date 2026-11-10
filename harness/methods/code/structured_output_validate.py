"""출력을 타입으로 묶기 — LLM 이 낸 JSON 을 서버에서 다시 검증한다: 스키마 · 범위 · 근거 id 실재 · 수치 필드가 계산 결과와 일치 · 문장 속 숫자 출처.
실행: python structured_output_validate.py   (numpy 불필요, pandas 만 — API 키·네트워크 없음)
입력: LLM 응답 원문(문자열) + 스키마(dict) + 계산 결과(facts: 코드가 표에서 직접 센 값) + 실재하는 기록 id 집합.
출력: 오류 코드 리스트(빈 리스트 = 통과).  오류 코드는 '분류:세부' 꼴이라 화면·로그에 그대로 쓴다.
원칙: 숫자는 계산 결과에서만 온다.  LLM 은 수치 필드를 '옮겨 적을' 뿐이고, 옮겨 적은 값이 계산 값과 다르면 서버가 거른다.
공급사 구조화 출력이 스키마 일치를 보장해도 숫자 최소·최대, 문자열 길이 같은 제약은 지원하지 않을 수 있다(원천: Claude 문서 요약 기준) -> 범위 검사는 이 서버 코드가 한다.
데이터는 합성이다.
"""
import copy
import json
import re
import sys
import pandas as pd

# ---------------------------------------------------------------- 스키마 (JSON Schema 의 일부만 직접 구현: 표준 라이브러리만 쓰려는 선택)
SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["action", "evidence_ids", "cause_candidates", "n_similar", "mean_downtime_min", "confidence", "reason"],
    "properties": {
        "action": {"type": "string", "enum": ["관찰 유지", "부분 점검", "즉시 교체", "답 없음"]},
        "evidence_ids": {"type": "array", "maxItems": 5, "items": {"type": "string", "pattern": r"^N\d{3}$"}},
        "cause_candidates": {"type": "array", "maxItems": 3, "items": {
            "type": "object", "additionalProperties": False, "required": ["note_id", "cause"],
            "properties": {"note_id": {"type": "string", "pattern": r"^N\d{3}$"}, "cause": {"type": "string", "maxLength": 60}}}},
        "n_similar": {"type": "integer", "minimum": 0},                  # 계산값
        "mean_downtime_min": {"type": ["number", "null"], "minimum": 0},  # 계산값
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},     # 모델이 낸 확신도(보정 보장 없음)
        "reason": {"type": "string", "maxLength": 200},
    },
}
CALC_FIELDS = {"n_similar": 0.0, "mean_downtime_min": 0.05}   # 필드 -> 허용 오차(LLM 이 소수 첫째 자리로 반올림해 적는 것은 허용)


def _is_type(v, t):
    if t == "object":
        return isinstance(v, dict)
    if t == "array":
        return isinstance(v, list)
    if t == "string":
        return isinstance(v, str)
    if t == "boolean":
        return isinstance(v, bool)
    if t == "null":
        return v is None
    if t == "integer":
        return isinstance(v, int) and not isinstance(v, bool)        # 파이썬 bool 은 int 의 하위 형 — 걸러야 한다
    if t == "number":
        return isinstance(v, (int, float)) and not isinstance(v, bool)
    raise ValueError(t)


def check_schema(v, sch, path="$"):
    """스키마 위반을 'SCHEMA:경로:키워드' 문자열 리스트로 돌려준다."""
    errs = []
    types = sch.get("type")
    if types is not None:
        types = types if isinstance(types, list) else [types]
        if not any(_is_type(v, t) for t in types):
            return [f"SCHEMA:{path}:type"]
    if "enum" in sch and v not in sch["enum"]:
        errs.append(f"SCHEMA:{path}:enum")
    if isinstance(v, dict):
        for k in sch.get("required", []):
            if k not in v:
                errs.append(f"SCHEMA:{path}.{k}:required")
        props = sch.get("properties", {})
        if sch.get("additionalProperties") is False:
            for k in v:
                if k not in props:
                    errs.append(f"SCHEMA:{path}.{k}:additional")
        for k, sub in props.items():
            if k in v:
                errs += check_schema(v[k], sub, f"{path}.{k}")
    if isinstance(v, list):
        if "maxItems" in sch and len(v) > sch["maxItems"]:
            errs.append(f"SCHEMA:{path}:maxItems")
        if "minItems" in sch and len(v) < sch["minItems"]:
            errs.append(f"SCHEMA:{path}:minItems")
        for i, x in enumerate(v):
            if "items" in sch:
                errs += check_schema(x, sch["items"], f"{path}[{i}]")
    if isinstance(v, str):
        if "maxLength" in sch and len(v) > sch["maxLength"]:
            errs.append(f"SCHEMA:{path}:maxLength")
        if "pattern" in sch and not re.search(sch["pattern"], v):
            errs.append(f"SCHEMA:{path}:pattern")
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if "minimum" in sch and v < sch["minimum"]:
            errs.append(f"RANGE:{path}:minimum")
        if "maximum" in sch and v > sch["maximum"]:
            errs.append(f"RANGE:{path}:maximum")
    return errs


# ---------------------------------------------------------------- 계산 결과: 숫자의 유일한 출처
def compute_facts(df, cause_tag):
    """표(note_id, cause_tag, downtime_min)에서 해당 원인 태그의 건수·평균 다운타임을 센다.  LLM 을 거치지 않는다."""
    sub = df[df["cause_tag"] == cause_tag]
    return {"ids": set(sub["note_id"]), "n_similar": int(len(sub)),
            "mean_downtime_min": float(sub["downtime_min"].mean()) if len(sub) else None,
            "total_downtime_min": float(sub["downtime_min"].sum())}


NUM = re.compile(r"\d+(?:\.\d+)?")


def numbers_in_text(text):
    """문장 속 숫자 토큰. 기록 id(N003 같은 꼴)의 숫자는 제외한다."""
    t = re.sub(r"N\d{3}", " ", text)
    return [float(x) for x in NUM.findall(t)]


def validate(raw, facts, known_ids, extra_numbers=(), schema=SCHEMA):
    """raw = LLM 응답 원문.  반환 = 오류 코드 리스트."""
    try:
        obj = json.loads(raw)
    except Exception:
        return ["PARSE:json"]                                    # 거절·max_tokens 절단 때 나는 일
    errs = check_schema(obj, schema)
    if errs and any(e.startswith("SCHEMA:$:type") for e in errs):
        return errs
    # 근거 id 실재 + 후보 원인은 근거 안에서만
    ev = obj.get("evidence_ids", []) if isinstance(obj.get("evidence_ids"), list) else []
    for i in ev:
        if isinstance(i, str) and i not in known_ids:
            errs.append(f"CITE:unknown:{i}")
    cc = obj.get("cause_candidates", []) if isinstance(obj.get("cause_candidates"), list) else []
    for c in cc:
        if isinstance(c, dict) and isinstance(c.get("note_id"), str) and c["note_id"] not in ev:
            errs.append(f"CITE:not_in_evidence:{c['note_id']}")
    # 수치 필드는 계산 값과 일치
    for f, tol in CALC_FIELDS.items():
        if f not in obj or not _is_type(obj[f], "number") and obj[f] is not None:
            continue
        want, got = facts.get(f), obj[f]
        if (want is None) != (got is None) or (want is not None and abs(want - got) > tol):
            errs.append(f"FACT:{f}")
    # 답 없음은 근거도 수치도 없어야 한다
    if obj.get("action") == "답 없음" and (ev or obj.get("n_similar") not in (0, None) or obj.get("mean_downtime_min") is not None):
        errs.append("REFUSAL:inconsistent")
    # 문장 속 숫자는 계산 결과에서만
    allowed = [facts.get("n_similar"), facts.get("mean_downtime_min"), facts.get("total_downtime_min"), *extra_numbers]
    allowed = [a for a in allowed if a is not None]
    if isinstance(obj.get("reason"), str):
        for x in numbers_in_text(obj["reason"]):
            if not any(abs(x - a) <= 0.05 for a in allowed):
                errs.append(f"NUMBER_IN_TEXT:{x:g}")
    return errs


# ---------------------------------------------------------------- 합성 데이터 + 합성 LLM 응답
def make_table():
    """원인 태그 A(밸브)·B(RF)·C(헬륨) 의 합성 조치 기록: 다운타임(분)."""
    rows = [("N001", "A", 190), ("N002", "A", 150), ("N003", "A", 210),
            ("N004", "B", 240), ("N005", "B", 270), ("N006", "B", 120),
            ("N007", "C", 90), ("N008", "C", 160), ("N009", "C", 200), ("N010", "C", 130)]
    return pd.DataFrame(rows, columns=["note_id", "cause_tag", "downtime_min"])


def card(**kw):
    base = {"action": "부분 점검", "evidence_ids": ["N001", "N002", "N003"],
            "cause_candidates": [{"note_id": "N001", "cause": "스로틀 밸브 구동부 마모"}],
            "n_similar": 3, "mean_downtime_min": 183.3, "confidence": 0.7,
            "reason": "유사 기록 3건, 평균 다운타임 183.3분."}
    base.update(kw)
    return base


def build_cases():
    """(이름, 응답 원문, 기대 오류 코드 집합, 대조할 계산 결과) — 기대값은 손으로 쓴 리터럴이다(검증기 출력으로 만들지 않는다).
    답 없음 사례는 '검색 결과가 비었다'는 계산 결과(none)와 대조한다."""
    df = make_table()
    fa, none = compute_facts(df, "A"), compute_facts(df, "Z")
    j = json.dumps
    no_reason = card(); del no_reason["reason"]
    extra = card(); extra["fix"] = "교체하세요"
    refusal_ok = {"action": "답 없음", "evidence_ids": [], "cause_candidates": [], "n_similar": 0, "mean_downtime_min": None,
                  "confidence": 0.1, "reason": "관련 기록이 없어 답하지 않습니다."}
    return [
        ("정상", j(card(), ensure_ascii=False), set(), fa),
        ("정상-답 없음", j(refusal_ok, ensure_ascii=False), set(), none),
        ("필수 필드 누락(reason)", j(no_reason, ensure_ascii=False), {"SCHEMA:$.reason:required"}, fa),
        ("enum 위반(action)", j(card(action="교체"), ensure_ascii=False), {"SCHEMA:$.action:enum"}, fa),
        ("범위 위반(confidence 1.4)", j(card(confidence=1.4)), {"RANGE:$.confidence:maximum"}, fa),
        ("추가 필드(fix)", j(extra, ensure_ascii=False), {"SCHEMA:$.fix:additional"}, fa),
        ("형 오류(n_similar 문자열)", j(card(n_similar="3"), ensure_ascii=False), {"SCHEMA:$.n_similar:type"}, fa),
        ("건수 틀림(4 vs 3)", j(card(n_similar=4, reason="유사 기록 4건."), ensure_ascii=False), {"FACT:n_similar", "NUMBER_IN_TEXT:4"}, fa),
        ("평균 틀림(200 vs 183.3)", j(card(mean_downtime_min=200.0, reason="평균 200분."), ensure_ascii=False),
         {"FACT:mean_downtime_min", "NUMBER_IN_TEXT:200"}, fa),
        ("문장에 지어낸 숫자(35%)", j(card(reason="유사 기록 3건, 교체 후 불량 35% 감소."), ensure_ascii=False), {"NUMBER_IN_TEXT:35"}, fa),
        ("없는 근거 id(N999)", j(card(evidence_ids=["N001", "N999"]), ensure_ascii=False), {"CITE:unknown:N999"}, fa),
        ("후보 원인이 근거 밖(N004)", j(card(cause_candidates=[{"note_id": "N004", "cause": "RF 매처 불량"}]), ensure_ascii=False),
         {"CITE:not_in_evidence:N004"}, fa),
        ("답 없음인데 근거 인용", j(dict(refusal_ok, evidence_ids=["N001"]), ensure_ascii=False), {"REFUSAL:inconsistent"}, none),
        ("잘린 JSON(max_tokens)", j(card(), ensure_ascii=False)[:-25], {"PARSE:json"}, fa),
    ]


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    df = make_table()
    facts = compute_facts(df, "A")
    known = set(df["note_id"])
    print(f"[계산 결과] 원인 태그 A: 건수 {facts['n_similar']} · 평균 다운타임 {facts['mean_downtime_min']:.2f}분 · 합계 {facts['total_downtime_min']:.0f}분 (코드가 표에서 직접 센 값)")
    cases = build_cases()
    print(f"{'사례':<26} {'검출된 오류 코드'}")
    for name, raw, want, fx in cases:
        got = validate(raw, fx, known)
        print(f"{name:<26} {sorted(got) if got else '통과'}")

    # ================= 독립 하드체크 =================
    # (1) 손으로 센 계산 결과: A 는 190+150+210=550 -> 평균 183.333, B 는 630/3=210, C 는 580/4=145
    fa, fb, fc = (compute_facts(df, t) for t in "ABC")
    assert fa["n_similar"] == 3 and abs(fa["mean_downtime_min"] - 550 / 3) < 1e-9 and fa["total_downtime_min"] == 550
    assert fb["mean_downtime_min"] == 210.0 and fc["n_similar"] == 4 and fc["mean_downtime_min"] == 145.0
    assert compute_facts(df, "Z") == {"ids": set(), "n_similar": 0, "mean_downtime_min": None, "total_downtime_min": 0.0}
    # (2) 사례별 기대 오류 코드가 손으로 쓴 리터럴과 정확히 일치(과검출·미검출 둘 다 잡는다)
    for name, raw, want, fx in cases:
        got = set(validate(raw, fx, known))
        assert got == want, (name, got, want)
    # (3) 변이 시험: 정상 응답의 필수 필드를 하나씩 지우면 그 필드의 required 오류가 나온다
    ok = card()
    for k in SCHEMA["required"]:
        m = copy.deepcopy(ok); del m[k]
        assert f"SCHEMA:$.{k}:required" in validate(json.dumps(m, ensure_ascii=False), facts, known), k
    # (4) 변이 시험: 평균을 허용 오차 안(±0.04)으로 흔들면 통과, 밖(±0.2)이면 FACT 오류
    for d, expect_err in ((0.04, False), (-0.04, False), (0.2, True), (-0.2, True)):
        m = card(mean_downtime_min=183.33 + d, reason="유사 기록 3건.")
        assert (("FACT:mean_downtime_min" in validate(json.dumps(m, ensure_ascii=False), facts, known)) == expect_err), d
    # (5) 경계값: confidence 0 과 1 은 통과, 1.0000001 과 -0.0001 은 실패. reason 길이 200 통과·201 실패. bool 은 정수가 아니다.
    for c, bad in ((0, False), (1, False), (1.0000001, True), (-0.0001, True)):
        assert bool(validate(json.dumps(card(confidence=c), ensure_ascii=False), facts, known)) == bad, c
    for n, bad in ((200, False), (201, True)):
        r = ("가" * n)
        assert bool(validate(json.dumps(card(reason=r), ensure_ascii=False), facts, known)) == bad, n
    assert "SCHEMA:$.n_similar:type" in validate(json.dumps(card(n_similar=True)), facts, known)
    # (6) 문장 속 숫자: 기록 id 의 숫자는 무시, 계산 값(3, 183.3, 합계 550)은 허용, 다른 값은 검출
    assert numbers_in_text("N001 과 N003 에서 3건, 평균 183.3분, 합계 550분") == [3.0, 183.3, 550.0]
    assert validate(json.dumps(card(reason="N001 외 2건, 합계 550분."), ensure_ascii=False), facts, known) == ["NUMBER_IN_TEXT:2"]
    # (7) 검증기는 입력을 바꾸지 않는다
    f2 = copy.deepcopy(facts); k2 = set(known)
    validate(json.dumps(card(), ensure_ascii=False), facts, known)
    assert f2 == facts and k2 == known
    # (8) 근거가 있는데 '답 없음'으로 거절한 응답도 계산 결과와 어긋나므로 걸린다 (과소 응답 검출)
    refusal = json.dumps({"action": "답 없음", "evidence_ids": [], "cause_candidates": [], "n_similar": 0, "mean_downtime_min": None,
                          "confidence": 0.1, "reason": "답하지 않습니다."}, ensure_ascii=False)
    assert set(validate(refusal, facts, known)) == {"FACT:n_similar", "FACT:mean_downtime_min"}
    # (9) 계산 값이 달라지면(원인 태그 B) 같은 응답이 거절된다 — 검증이 응답이 아니라 '계산 결과'에 묶여 있다는 증거
    assert "FACT:n_similar" not in validate(json.dumps(card(), ensure_ascii=False), facts, known)
    assert "FACT:mean_downtime_min" in validate(json.dumps(card(), ensure_ascii=False), fb, known)
    print("하드체크 통과")
