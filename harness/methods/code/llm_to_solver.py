"""질문을 파라미터로 LLM 질의 -> 파라미터 (OptiGuide 패턴): 질문 -> 파라미터 diff -> 솔버 재실행 -> 전후 KPI -> 설명문.

실행: python llm_to_solver.py   (numpy, pandas, ortools 만 필요, 네트워크 불필요)
구조: LLM 은 (1) 질문을 파라미터 diff 로 바꾸고 (2) KPI 숫자를 문장으로 풀 뿐, 데이터 행을 보지 않는다.
  - LLM 자리는 규칙 기반 목 LLM(mock_llm / mock_explain)이 맡는다. 실제 모델을 붙일 때는 mock_llm 과 같은 입출력(payload -> 파라미터 diff)의 함수로 갈아 끼운다.
  - 어느 쪽이든 모든 LLM 입출력은 Gateway 를 지나고, Gateway 가 원본 데이터 유출(LOT 이름 등)을 코드로 막는다.
입력 DataFrame `lots`: lot(LOT 이름) · minutes(처리시간, 분) · due(납기, 시작 후 분) · weight(우선순위 가중, 기본 1)
파라미터 스키마(PARAM_SCHEMA): down {장비: [시작h, 끝h]} · speed {장비: 속도배율} · rush [LOT 이름]
"""
import json
import math
import re
import numpy as np
import pandas as pd
from ortools.sat.python import cp_model

MACHINES = ["E1", "E2", "E3", "E4"]
PARAM_SCHEMA = {"down": "{machine: [start_hour, end_hour]}", "speed": "{machine: factor 0<f<=2}", "rush": "[lot name]"}
BASE_PARAMS = {"down": {}, "speed": {}, "rush": []}


def make_lots(n=8, seed=16):
    rng = np.random.default_rng(seed)
    return pd.DataFrame({"lot": [f"LOT-{i:02d}" for i in range(n)], "minutes": rng.integers(90, 241, n),
                         "due": rng.integers(200, 421, n), "weight": 1})


def solve(lots, params):
    """CP-SAT: 장비 4대 병렬, 장비별 겹침 금지, 다운 구간 회피, 가중 지연 합 최소. 스케줄 + KPI 반환."""
    m, H = cp_model.CpModel(), 24 * 60
    per = {k: [] for k in MACHINES}
    for k, (a, b) in params["down"].items():
        per[k].append(m.NewFixedSizeIntervalVar(int(a * 60), int((b - a) * 60), ""))
    pres, ends, tards = {}, [], []
    for r in lots.itertuples():
        w = r.weight * (5 if r.lot in params["rush"] else 1)
        row = []
        for k in MACHINES:
            d = math.ceil(r.minutes / params["speed"].get(k, 1.0))
            p = m.NewBoolVar("")
            s = m.NewIntVar(0, H, "")
            per[k].append(m.NewOptionalFixedSizeIntervalVar(s, d, p, ""))
            pres[r.lot, k] = (p, s, d); row.append(p)
        m.AddExactlyOne(row)
        e = m.NewIntVar(0, H, "")
        for k in MACHINES:
            m.Add(e == pres[r.lot, k][1] + pres[r.lot, k][2]).OnlyEnforceIf(pres[r.lot, k][0])
        t = m.NewIntVar(0, H, ""); m.Add(t >= e - int(r.due)); tards.append((w, t)); ends.append(e)
    for k in MACHINES:
        m.AddNoOverlap(per[k])
    mk = m.NewIntVar(0, H, ""); m.AddMaxEquality(mk, ends)
    m.Minimize(sum(w * t for w, t in tards) * 1000 + mk)  # 1순위 가중 지연, 동률은 makespan
    sv = cp_model.CpSolver(); sv.parameters.num_workers = 1; sv.parameters.random_seed = 16
    st = sv.Solve(m)
    assert st == cp_model.OPTIMAL, sv.StatusName(st)
    sched = [(r.lot, k, sv.Value(pres[r.lot, k][1]), sv.Value(pres[r.lot, k][1]) + pres[r.lot, k][2])
             for r in lots.itertuples() for k in MACHINES if sv.Value(pres[r.lot, k][0])]
    return sched, kpis(lots, params, sched)


def kpis(lots, params, sched):
    """스케줄에서 KPI 를 다시 계산 (솔버 내부 변수에 의존하지 않음) — 검증기와 공용. 가중치는 목적함수에만 쓴다."""
    due = lots.set_index("lot").due
    late = {l: max(0, e - due[l]) for l, _, _, e in sched}
    return {"total_tardiness_min": int(sum(late.values())), "late_lots": int(sum(v > 0 for v in late.values())),
            "makespan_min": int(max(e for *_, e in sched)), "rush_tardiness_min": int(sum(late[l] for l in params["rush"]))}


# ---------------- LLM 쪽 (데이터 행을 받지 않는다) ----------------
def mock_llm(payload):
    """규칙 기반 목 LLM: 질문 텍스트 + 스키마 + 장비 ID 만 보고 diff 를 만든다. 모르면 {}."""
    q, diff = payload["question"], {}
    mach = [x for x in re.findall(r"E\d+", q) if x in payload["machines"]]
    hrs = re.search(r"(\d+)\s*시간", q)
    span = re.search(r"(\d+)\s*시\s*(?:부터|~|-)\s*(\d+)\s*시", q)
    if mach and ("멈추" in q or "고장" in q or "다운" in q):
        a, b = (int(span[1]), int(span[2])) if span else (0, int(hrs[1]) if hrs else 4)
        diff["down"] = {mach[0]: [a, b]}
    pct = re.search(r"(\d+)\s*%\s*느려", q)
    if mach and pct:
        diff["speed"] = {mach[0]: round(1 - int(pct[1]) / 100, 2)}
    lot = re.findall(r"LOT-\d+", q)
    if lot and "긴급" in q:
        diff["rush"] = lot
    return diff


def mock_explain(p):
    b, a = p["kpi_before"], p["kpi_after"]
    d = a["total_tardiness_min"] - b["total_tardiness_min"]
    return (f"'{p['question']}' 조건({json.dumps(p['diff'], ensure_ascii=False)})으로 솔버를 다시 돌렸습니다. "
            f"총 지연 {b['total_tardiness_min']}분 -> {a['total_tardiness_min']}분({d:+d}분), "
            f"지연 LOT {b['late_lots']} -> {a['late_lots']}건, 종료 {b['makespan_min']} -> {a['makespan_min']}분."
            + (f" 긴급 LOT 지연 {b['rush_tardiness_min']} -> {a['rush_tardiness_min']}분." if p["diff"].get("rush") else ""))


class Gateway:
    """LLM 으로 나가는 모든 payload 를 기록하고, 원본 데이터(LOT 이름·행 값)가 섞이면 막는다."""
    ALLOWED = {"question", "param_schema", "machines", "diff", "kpi_before", "kpi_after"}

    def __init__(self, lots):
        self.lots, self.log = lots, []

    def check(self, payload):
        assert set(payload) <= self.ALLOWED, set(payload) - self.ALLOWED
        text = json.dumps({k: v for k, v in payload.items() if k != "question"}, ensure_ascii=False)
        leaked = [l for l in self.lots.lot if l in text and l not in payload.get("question", "")]
        assert not leaked, f"원본 데이터 유출 차단: {leaked}"
        assert '"minutes"' not in text and '"due"' not in text  # 데이터 컬럼 금지

    def send(self, fn, payload):
        self.check(payload); self.log.append(payload)
        return fn(payload)


def validate_diff(diff, lots):
    """LLM 이 낸 diff 를 스키마·범위·실재 여부로 걸러 낸다 (환각 차단)."""
    ok = {"down": {}, "speed": {}, "rush": []}
    for k, (a, b) in (diff.get("down") or {}).items():
        if k in MACHINES and 0 <= a < b <= 24: ok["down"][k] = [a, b]
    for k, f in (diff.get("speed") or {}).items():
        if k in MACHINES and 0 < f <= 2: ok["speed"][k] = f
    ok["rush"] = [l for l in diff.get("rush", []) if l in set(lots.lot)]
    return ok


def ask(question, lots, gw, before):
    llm = mock_llm
    raw = gw.send(llm, {"question": question, "param_schema": PARAM_SCHEMA, "machines": MACHINES})
    diff = validate_diff(raw, lots)
    params = {**BASE_PARAMS, **{k: v for k, v in diff.items() if v}}
    if params == BASE_PARAMS:
        return None, "바꿀 수 있는 조건(" + ", ".join(PARAM_SCHEMA) + ")으로 해석하지 못했습니다. 답을 지어내지 않습니다."
    sched, after = solve(lots, params)
    kb = {**before[1], "rush_tardiness_min": kpis(lots, params, before[0])["rush_tardiness_min"]}  # 같은 LOT 집합 기준
    pl = {"question": question, "diff": {k: v for k, v in diff.items() if v}, "kpi_before": kb, "kpi_after": after}
    return (sched, after, params), gw.send(mock_explain, pl)


def hard_check(lots, params, sched, kpi):
    """검증기: 솔버 변수를 안 쓰고 스케줄만으로 겹침·다운 회피·소요시간·KPI 를 다시 센다."""
    mins = lots.set_index("lot").minutes
    assert sorted(l for l, *_ in sched) == sorted(lots.lot)  # 모든 LOT 이 정확히 한 번
    for k in MACHINES:
        ivs = sorted((s, e) for l, kk, s, e in sched if kk == k)
        if k in params["down"]:
            a, b = params["down"][k]; ivs = sorted(ivs + [(a * 60, b * 60)])
        assert all(ivs[i][1] <= ivs[i + 1][0] for i in range(len(ivs) - 1)), (k, ivs)
    for l, k, s, e in sched:
        assert e - s == math.ceil(mins[l] / params["speed"].get(k, 1.0)) and s >= 0
    assert kpis(lots, params, sched) == kpi


if __name__ == "__main__":
    lots = make_lots()
    gw = Gateway(lots)
    base_sched, base_kpi = solve(lots, BASE_PARAMS)
    hard_check(lots, BASE_PARAMS, base_sched, base_kpi)
    print(f"[MOCK LLM] 현행 KPI: {base_kpi}")
    due = lots.set_index("lot").due  # 데모용: 현재 가장 늦는 LOT 을 사용자가 질문에 적었다고 가정
    hot = max(base_sched, key=lambda r: r[3] - due[r[0]])[0]
    for q in ["장비 E3 이 4시간 멈추면?", "E1 이 2시부터 8시까지 멈추면?", "E2 속도가 40% 느려지면?",
              f"{hot} 을 긴급으로 올리면?", "내일 날씨는 어때?"]:
        res, text = ask(q, lots, gw, (base_sched, base_kpi))
        print(f"\nQ: {q}\nA: {text}")
        if res:
            hard_check(lots, res[2], res[0], res[1])
            if res[2]["down"] or res[2]["speed"]:  # 자원이 줄면 총 지연이 개선될 수 없다
                assert res[1]["total_tardiness_min"] >= base_kpi["total_tardiness_min"]
            if res[2]["rush"]:  # 가중치를 올린 LOT 의 지연은 늘 수 없다
                assert res[1]["rush_tardiness_min"] <= kpis(lots, res[2], base_sched)["rush_tardiness_min"]
    assert mock_llm({"question": "E9 이 멈추면", "machines": MACHINES}) == {}  # 없는 장비는 diff 가 비어 있다
    assert validate_diff({"down": {"E9": [0, 4]}, "rush": ["LOT-99"]}, lots) == {"down": {}, "speed": {}, "rush": []}
    try:
        gw.check({"question": "x", "param_schema": {}, "machines": MACHINES, "diff": {"rows": lots.lot.tolist()}})
        raise SystemExit("유출 차단 실패")
    except AssertionError:
        pass
    sent = json.dumps(gw.log, ensure_ascii=False)
    assert not any(l in sent for l in lots.lot if l != hot) and hot in sent  # 질문에 쓴 이름만 허용
    print(f"\nHARD CHECK OK: 스케줄 검증기 통과 · LLM 로 나간 payload {len(gw.log)}건에 데이터 행 0건 · 유출 시도 차단 · 환각 diff 제거")
