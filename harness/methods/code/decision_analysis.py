"""기대손실 결정표 의사결정분석·기대가치 — 결정표, 판단이 바뀌는 확률 경계, EVPI.  실행: python decision_analysis.py
입력: 손실표 DataFrame (행=조치, 열=상태, 값=그 조치·상태 조합의 손실, 단위 억원) + 상태 확률 dict.
경계(breakpoints)는 상태 2개(정상/이상)일 때 지원한다: p = P(두 번째 열 상태).
"""
import numpy as np
import pandas as pd


def expected_loss(table, probs):
    p = pd.Series(probs)[table.columns]
    return table.mul(p, axis=1).sum(axis=1)


def evpi(table, probs):
    """완전정보의 가치 = 현재 최선 기대손실 − 상태를 미리 알 때의 기대손실. 추가 계측·검사에 쓸 돈의 상한."""
    p = pd.Series(probs)[table.columns]
    return expected_loss(table, probs).min() - (table.min(axis=0) * p).sum()


def breakpoints(table):
    """상태 2개: p∈[0,1] 에서 최소 기대손실 조치가 바뀌는 구간 [(p_시작, p_끝, 조치)] — 하부 포락선을 정확히 구한다."""
    a, s = table.iloc[:, 0].to_numpy(float), (table.iloc[:, 1] - table.iloc[:, 0]).to_numpy(float)
    names, p = list(table.index), 0.0
    cur = min(range(len(a)), key=lambda i: (a[i], s[i]))
    out = []
    while True:
        nxt = [(max((a[j] - a[cur]) / (s[cur] - s[j]), p), s[j], j) for j in range(len(a)) if s[j] < s[cur] - 1e-12]
        nxt = [t for t in nxt if t[0] <= 1.0]
        if not nxt:
            out.append((float(p), 1.0, names[cur])); return out
        pn, _, j = min(nxt)
        out.append((float(p), float(pn), names[cur])); p, cur = float(pn), j


def lot_table(V, claim, c_insp=0.2, sens=0.9, false_rej=0.05):
    """출하/재검/폐기. V=랏 가치, claim=불량 유출 시 손실(가정). 손실은 '이상적 판정 대비' 후회 형태."""
    return pd.DataFrame({"정상": [0.0, c_insp + false_rej * V, V], "불량": [claim, c_insp + (1 - sens) * claim, 0.0]},
                        index=["출하", "재검", "폐기"])


def equip_table(hour_cost=8.9, stop_a=2.0, stop_b=0.5, detect=0.7, fail_h=8.0, repair=3.0):
    """조치 A(즉시 정지·교체)/B(부분 점검)/관찰. 병목 장비 시간당 손실 hour_cost(억원, 재무문서 §2-3 추정) × 정지 시간."""
    F = fail_h * hour_cost + repair
    return pd.DataFrame({"정상": [stop_a * hour_cost, stop_b * hour_cost, 0.0],
                         "고장임박": [stop_a * hour_cost, stop_b * hour_cost + (1 - detect) * F, F]},
                        index=["A 즉시교체", "B 부분점검", "관찰 유지"])


def report(title, table, p_fault):
    probs = {table.columns[0]: 1 - p_fault, table.columns[1]: p_fault}
    el = expected_loss(table, probs)
    print(f"[{title}] P({table.columns[1]})={p_fault}\n{table.round(2).to_string()}")
    print("기대손실(억원):", el.round(3).to_dict(), "→ 최선:", el.idxmin(), "| EVPI:", round(evpi(table, probs), 3))
    print("판단 경계:", [(round(x, 4), round(y, 4), n) for x, y, n in breakpoints(table)])
    return probs


if __name__ == "__main__":
    claim = 20.0  # 고객 클레임 손실 — 가정(근거 없음, 슬라이더 입력)
    t_cost, t_opp = lot_table(1.45, claim), lot_table(8.6, claim)  # 랏 가치: 원가 기준 / 기회비용 기준 (재무문서 §2-5 추정)
    report("랏 판정·원가 기준", t_cost, 0.10)
    report("랏 판정·기회비용 기준", t_opp, 0.10)
    t_eq = equip_table()
    pr_eq = report("장비 조치", t_eq, 0.30)

    # ---- 독립 하드체크 ----
    # (1) 격자 전수 탐색: p 를 10001 점으로 훑어 argmin 이 바뀌는 지점 == 해석적 경계
    for t in (t_cost, t_opp, t_eq):
        grid = np.linspace(0, 1, 10001)
        arg = [expected_loss(t, {t.columns[0]: 1 - p, t.columns[1]: p}).idxmin() for p in grid]
        sw = [grid[i] for i in range(1, len(grid)) if arg[i] != arg[i - 1]]
        bp = [x for x, _, _ in breakpoints(t)][1:]
        assert len(sw) == len(bp) and all(abs(u - v) < 2e-4 for u, v in zip(sw, bp)), (sw, bp)
    # (2) 손으로 푼 값(리터럴): 원가 기준 출하→재검 0.2725/(20−1.9275)=0.01508, 재검→폐기 1.1775/3.3775=0.34863
    b = breakpoints(t_cost)
    assert [n for *_, n in b] == ["출하", "재검", "폐기"]
    assert abs(b[1][0] - 0.01508) < 1e-4 and abs(b[2][0] - 0.34863) < 1e-4, b
    # (3) 출하↔폐기 직접 손익분기 p=V/(V+claim) 에서 두 기대손실이 같다
    pb = 1.45 / (1.45 + claim)
    el = expected_loss(t_cost, {"정상": 1 - pb, "불량": pb})
    assert abs(el["출하"] - el["폐기"]) < 1e-12
    # (4) EVPI 몬테카를로: 상태를 뽑아 '미리 알고 최선을 고른' 평균 손실로 다시 계산
    rng = np.random.default_rng(3)
    bad = rng.random(2_000_000) < 0.30
    loss = np.where(bad, t_eq["고장임박"].min(), t_eq["정상"].min())
    mc = expected_loss(t_eq, pr_eq).min() - loss.mean()
    assert abs(mc - evpi(t_eq, pr_eq)) < 0.02, (mc, evpi(t_eq, pr_eq))
    # (5) 경계 성질: EVPI ≥ 0, 확률이 0 이면 EVPI=0, 최선 기대손실 이하
    assert evpi(t_eq, pr_eq) >= 0 and abs(evpi(t_eq, {"정상": 1.0, "고장임박": 0.0})) < 1e-12
    assert evpi(t_eq, pr_eq) <= expected_loss(t_eq, pr_eq).min()
    print("하드체크 통과")
