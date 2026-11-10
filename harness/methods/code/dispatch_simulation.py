"""디스패칭 규칙 시뮬레이션 디스패칭 규칙 비교: SimPy 이산사건 시뮬레이션(FIFO · EDD · CR). 같은 도착·공정시간(공통 난수)으로 규칙만 바꾼다.
입력(DataFrame): lots(lot, arrive, due) · ops(lot, step, station, proc) · stations{스테이션: 장비 수} · qt{(step 번호): 허용 대기}
실행: python dispatch_simulation.py
"""
import numpy as np
import pandas as pd
import simpy

STATIONS = {"PHOTO": 2, "ETCH": 3, "CMP": 1}
ROUTE = [("PHOTO", 12), ("ETCH", 20), ("CMP", 14), ("PHOTO", 12), ("ETCH", 20)]  # 재진입 경로, 평균 공정시간(분)
QT = {2: 30}  # 식각(step1) 종료 -> CMP(step2) 시작 허용 대기 30분. 초과는 폐기 위험 LOT 로 센다.


def make_data(seed, n_lots=300, load_gap=15.5):
    rng = np.random.default_rng(seed)
    arrive = np.cumsum(rng.exponential(load_gap, n_lots))
    ops = pd.DataFrame([dict(lot=i, step=k, station=s, proc=rng.gamma(4, m / 4)) for i in range(n_lots)
                        for k, (s, m) in enumerate(ROUTE)])
    raw = ops.groupby("lot").proc.sum().to_numpy()
    lots = pd.DataFrame({"lot": range(n_lots), "arrive": arrive, "due": arrive + raw * rng.uniform(2.2, 4.0, n_lots)})
    return lots, ops


# 규칙 = (lot정보, 현재시각) -> 값, 작은 쪽 먼저
RULES = {"FIFO": lambda j, now: j["enter"],
         "EDD": lambda j, now: j["due"],
         "CR": lambda j, now: (j["due"] - now) / j["remain"]}


def simulate(lots, ops, rule, stations=STATIONS):
    env, log, queues, wake = simpy.Environment(), [], {s: [] for s in stations}, {s: None for s in stations}
    plan = {l: g.sort_values("step") for l, g in ops.groupby("lot")}
    due = dict(zip(lots.lot, lots.due))

    def enqueue(lot, step):
        p = plan[lot].iloc[step:]
        queues[p.station.iloc[0]].append(dict(lot=lot, step=step, enter=env.now, due=due[lot], remain=p.proc.sum(),
                                              proc=p.proc.iloc[0], station=p.station.iloc[0]))
        ev = wake[p.station.iloc[0]]
        if ev is not None and not ev.triggered:
            ev.succeed()

    def arrivals():
        for r in lots.sort_values("arrive").itertuples():
            yield env.timeout(max(0, r.arrive - env.now)); enqueue(r.lot, 0)

    def machine(st, name):
        while True:
            while not queues[st]:
                if wake[st] is None or wake[st].triggered:
                    wake[st] = env.event()
                yield wake[st]
            j = min(queues[st], key=lambda q: RULES[rule](q, env.now)); queues[st].remove(j)
            t0 = env.now
            yield env.timeout(j["proc"])
            log.append(dict(lot=j["lot"], step=j["step"], station=st, machine=name, enter=j["enter"], start=t0, end=env.now))
            if j["step"] + 1 < len(plan[j["lot"]]):
                enqueue(j["lot"], j["step"] + 1)

    env.process(arrivals())
    for st, n in stations.items():
        for k in range(n):
            env.process(machine(st, f"{st}{k + 1}"))
    env.run()
    return pd.DataFrame(log)


def kpis(log, lots, qt=QT):
    done = log.groupby("lot").end.max()
    ct = done - lots.set_index("lot").arrive
    late = (done - lots.set_index("lot").due).clip(lower=0)
    q = 0
    for step, limit in qt.items():
        a = log[log.step == step - 1].set_index("lot").end
        b = log[log.step == step].set_index("lot").start
        q += int(((b - a) > limit).sum())
    return dict(mean_ct=ct.mean(), p90_ct=ct.quantile(0.9), tardy_pct=100 * (late > 0).mean(), mean_late=late.mean(), qtime_viol=q)


def verify(log, lots, ops, rule):
    """독립 하드체크: 로그만 보고 시뮬레이터 내부와 다른 방식으로 재검사."""
    for m, g in log.sort_values("start").groupby("machine"):
        assert (g.start.to_numpy()[1:] >= g.end.to_numpy()[:-1] - 1e-9).all(), f"{m} 겹침"
    assert len(log) == len(ops), "처리되지 않은 공정이 있다"
    pr = ops.set_index(["lot", "step"]).proc
    assert np.allclose(log.end - log.start, [pr[l, s] for l, s in zip(log.lot, log.step)]), "공정시간 변조"
    arr = lots.set_index("lot").arrive
    for l, g in log.sort_values("step").groupby("lot"):
        assert g.start.iloc[0] >= arr[l] - 1e-9 and (g.start.to_numpy()[1:] >= g.end.to_numpy()[:-1] - 1e-9).all()
    ct = log.groupby("lot").end.max() - arr  # Little 법칙: 시간적분 WIP = 사이클타임 합 (도착/완료 사건 스윕으로 따로 계산)
    ev = sorted([(t, 1) for t in arr] + [(t, -1) for t in log.groupby("lot").end.max()])
    area, n, prev = 0.0, 0, ev[0][0]
    for t, d in ev:
        area += n * (t - prev); n += d; prev = t
    assert abs(area - ct.sum()) < 1e-6 * ct.sum(), "Little 법칙 불일치"
    due = lots.set_index("lot").due
    rem = {(l, s): ops[(ops.lot == l) & (ops.step >= s)].proc.sum() for l, s in zip(log.lot, log.step)}
    for st, g in log.groupby("station"):  # 규칙 의미 검사: 시작하는 LOT 은 그 순간 대기 중인 LOT 중 규칙상 최선이어야 한다
        g = g.reset_index(drop=True)
        for r in g.itertuples():
            w = g[(g.enter <= r.start + 1e-9) & (g.start > r.start + 1e-9)]
            if rule == "FIFO":
                assert (w.enter >= r.enter - 1e-9).all()
            elif rule == "EDD":
                assert (due[w.lot].to_numpy() >= due[r.lot] - 1e-9).all()
            else:
                cr = lambda lot, st_: (due[lot] - r.start) / rem[lot, st_]
                assert all(cr(a, b) >= cr(r.lot, r.step) - 1e-9 for a, b in zip(w.lot, w.step))


if __name__ == "__main__":
    rows = []
    for seed in range(8):
        lots, ops = make_data(seed)
        for rule in RULES:
            log = simulate(lots, ops, rule)
            verify(log, lots, ops, rule)
            rows.append(dict(rule=rule, seed=seed, **kpis(log, lots)))
    res = pd.DataFrame(rows).groupby("rule").mean().drop(columns="seed").round(1).loc[list(RULES)]
    print("[규칙별 KPI: 8개 시드 평균, 분/건]"); print(res.to_string())
    # what-if: 병목(CMP) 장비를 1대 -> 2대로 늘리면 (질문 -> 파라미터 stations 변경)
    lots, ops = make_data(0)
    base = kpis(simulate(lots, ops, "FIFO"), lots)["mean_ct"]
    more = kpis(simulate(lots, ops, "FIFO", {"PHOTO": 2, "ETCH": 3, "CMP": 2}), lots)["mean_ct"]
    print(f"[what-if CMP 1대->2대, FIFO, 시드0] 평균 CT {base:.0f} -> {more:.0f} 분")
    assert more < base, "병목 장비를 늘렸는데 사이클타임이 줄지 않음"
    try:  # 검사기 자체 시험: FIFO 로그를 EDD 라고 우기면 걸려야 한다
        verify(simulate(lots, ops, "FIFO"), lots, ops, "EDD"); raise SystemExit("검사기가 규칙 불일치를 못 잡음")
    except AssertionError:
        pass
    print("HARD CHECK OK: 장비 겹침 없음 · 공정시간 불변 · 전 공정 완료 · Little 법칙 · FIFO/EDD/CR 선택 규칙 의미 · 병목 증설 시 CT 감소")
