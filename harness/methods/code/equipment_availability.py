"""장비 상태 이력에서 가용도·정지 구간 뽑기.  실행: python code/equipment_availability.py
입력 eqp_state : eqp_id, state, start, end     (구간 [start, end), 시각은 pandas Timestamp)
   state 코드(원천 컬럼 예): RUN=생산(Productive) · IDLE=대기(Standby) · ENG=엔지니어링 · PM=계획 정지 ·
                            DOWN=비계획 정지 · NONSCHED=비계획 시간(Non-scheduled, 사업상 세운 시간 — 이 코드 이름은 추론)
   현업 로그가 다른 이름(PROD/STBY/SDT/UDT 등)이면 normalize_states(df, mapping) 으로 먼저 바꾼다.
가용도 4종(원천 FabTime 글이 SEMI E10/E79 를 인용해 정리한 정의):
   e79_avail = (P+S+E)/T            op_avail = (P+S+E)/(T−N)
   op_mfg    = (P+S)/(T−N)          e79_mfg  = (P+S)/T          (P=RUN, S=IDLE, E=ENG, N=NONSCHED, T=창 길이)
"""
import numpy as np
import pandas as pd

H = pd.Timedelta(hours=1)
STATES = ["RUN", "IDLE", "ENG", "PM", "DOWN", "NONSCHED"]
E10_NAME = {"RUN": "Productive", "IDLE": "Standby", "ENG": "Engineering", "PM": "계획 정지(scheduled down)",
            "DOWN": "비계획 정지(unscheduled down)", "NONSCHED": "Non-scheduled"}
DEFS = {  # 이름: (분자 상태, 분모에서 NONSCHED 를 뺄까)
    "e79_avail": (["RUN", "IDLE", "ENG"], False),
    "op_avail": (["RUN", "IDLE", "ENG"], True),
    "op_mfg": (["RUN", "IDLE"], True),
    "e79_mfg": (["RUN", "IDLE"], False),
}


# ---------------------------------------------------------------- 계산 본체
def normalize_states(df, mapping):
    out = df.copy()
    bad = set(out["state"]) - set(mapping)
    assert not bad, f"매핑에 없는 상태 코드: {sorted(bad)}"
    out["state"] = out["state"].map(mapping)
    return out


def clip_states(st, t0, t1):
    """창 [t0,t1) 로 자르고 빈 구간을 버린다."""
    c = st.copy()
    c["start"], c["end"] = c["start"].clip(lower=t0, upper=t1), c["end"].clip(lower=t0, upper=t1)
    return c[c["end"] > c["start"]].reset_index(drop=True)


def coverage(c, t0, t1):
    """장비별 데이터 점검: 겹침(overlap_h)·빈틈(gap_h).  '상태 시간 합 = 창 길이' 만으로는 겹침과 빈틈이 서로 상쇄되어 통과하므로 둘을 따로 센다."""
    rows = []
    for e, g in c.sort_values(["eqp_id", "start", "end"], kind="mergesort").groupby("eqp_id"):
        cur, ov, gap = t0, pd.Timedelta(0), pd.Timedelta(0)
        for s, en in zip(g["start"], g["end"]):
            if s > cur:
                gap += s - cur
            elif s < cur:
                ov += min(cur, en) - s
            cur = max(cur, en)
        gap += max(pd.Timedelta(0), t1 - cur)
        rows.append((e, ov / H, gap / H))
    return pd.DataFrame(rows, columns=["eqp_id", "overlap_h", "gap_h"]).set_index("eqp_id")


def state_hours(c):
    """장비 × 상태 시간(시간 단위) 표.  모든 상태 열을 항상 만든다."""
    d = c.assign(h=(c["end"] - c["start"]) / H)
    return d.pivot_table(index="eqp_id", columns="state", values="h", aggfunc="sum", fill_value=0.0).reindex(columns=STATES, fill_value=0.0)


def availability(hours, total_h):
    """4가지 정의를 한 표로.  total_h = 창 길이(시간).  T−N 이 0 이면 NaN."""
    T = float(total_h)
    out = pd.DataFrame(index=hours.index)
    for name, (num, drop_n) in DEFS.items():
        den = T - hours["NONSCHED"] if drop_n else pd.Series(T, index=hours.index)
        out[name] = hours[num].sum(axis=1) / den.where(den > 0)
    return out


def stop_intervals(st, kinds=("DOWN",), tol=pd.Timedelta(0)):
    """kinds 상태의 연속 구간을 한 정지 사건으로 합친다(앞 end 와 뒤 start 가 tol 이내면 이어짐).  행이 쪼개져 있어도 한 건."""
    s = st[st["state"].isin(kinds)].sort_values(["eqp_id", "start"], kind="mergesort")
    out = []
    for e, g in s.groupby("eqp_id"):
        cur = None
        for a, b in zip(g["start"], g["end"]):
            if cur and a - cur[1] <= tol:
                cur[1] = max(cur[1], b)
            else:
                if cur:
                    out.append((e, *cur))
                cur = [a, b]
        if cur:
            out.append((e, *cur))
    r = pd.DataFrame(out, columns=["eqp_id", "start", "end"])
    r["dur_h"] = (r["end"] - r["start"]) / H
    return r


def stop_summary(stops, hours):
    """장비별 정지 건수·합·MTTR(평균 정지 시간).  MTBF 는 정상 시간(RUN+IDLE+ENG) ÷ 건수 — 이 정의는 추론(원천: 고장 사이 평균 정상 가동 시간)."""
    g = stops.groupby("eqp_id")["dur_h"].agg(n="size", total_h="sum", mttr_h="mean")
    g = hours[["RUN", "IDLE", "ENG"]].sum(axis=1).rename("up_h").to_frame().join(g).fillna({"n": 0, "total_h": 0.0})
    g["mtbf_h"] = g["up_h"] / g["n"].where(g["n"] > 0)
    return g


def weekly_cv(st, t0, t1, name="op_avail"):
    """주 단위로 잘라 장비별 가용도를 구하고 CV = 표준편차(ddof=1)/평균.  가용도의 평균만이 아니라 변동도 본다(원천: FabTime)."""
    edges = pd.date_range(t0, t1, freq="7D")
    if edges[-1] < t1:
        edges = edges.append(pd.DatetimeIndex([t1]))
    cols = []
    for a, b in zip(edges[:-1], edges[1:]):
        c = clip_states(st, a, b)
        cols.append(availability(state_hours(c), (b - a) / H)[name])
    w = pd.concat(cols, axis=1)
    return pd.DataFrame({"mean": w.mean(axis=1), "cv": w.std(axis=1, ddof=1) / w.mean(axis=1)})


# ---------------------------------------------------------------- 합성 데이터
def make_demo(seed=20261113, n_eqp=8, days=28):
    """합성 장비 상태 이력.  분(minute) 격자에 상태를 칠하고(truth), 같은 구간을 행으로도 내보낸다.
    DOWN 일부는 한 사건을 두 행으로 쪼개 둔다(정지 사건 합치기 시험).  정답은 격자 세기 — 행 계산 코드와 무관한 경로."""
    rng = np.random.default_rng(seed)
    t0 = pd.Timestamp("2026-10-01")
    n_min = days * 24 * 60
    code = {s: i for i, s in enumerate(STATES)}
    rows, grids = [], {}
    for k in range(n_eqp):
        e = f"EQ{k + 1:02d}"
        p_dn, p_pm = 0.05 + 0.02 * k, 0.04
        grid = np.empty(n_min, dtype=np.int8)
        m, prev = 0, None
        while m < n_min:
            probs = {"RUN": 0.55, "IDLE": 0.2, "ENG": 0.06, "PM": p_pm, "DOWN": p_dn, "NONSCHED": 0.03}
            if prev:
                probs[prev] = 0.0
            s = rng.choice(STATES, p=np.array(list(probs.values())) / sum(probs.values()))
            mean_h = {"RUN": 14.0, "IDLE": 4.0, "ENG": 3.0, "PM": 5.0, "DOWN": 3.0, "NONSCHED": 10.0}[s]
            d = max(5, int(rng.exponential(mean_h) * 60))
            d = min(d, n_min - m)
            grid[m:m + d] = code[s]
            parts = [(m, m + d)]
            if s == "DOWN" and d >= 60 and rng.random() < 0.4:      # 한 사건을 두 행으로
                cut = m + int(rng.integers(10, d - 10))
                parts = [(m, cut), (cut, m + d)]
            for a, b in parts:
                rows.append((e, s, t0 + pd.Timedelta(minutes=a), t0 + pd.Timedelta(minutes=b)))
            m, prev = m + d, s
        grids[e] = grid
    st = pd.DataFrame(rows, columns=["eqp_id", "state", "start", "end"])
    return st, grids, t0


def grid_hours(grid, a, b):
    """하드체크용: 분 격자 [a,b) 에서 상태별 시간(시간 단위)을 bincount 로."""
    cnt = np.bincount(grid[a:b], minlength=len(STATES))
    return cnt / 60.0


def grid_runs(grid, state):
    """하드체크용: 격자에서 state 가 연속인 최대 구간들(분) — 행 구조와 무관하게 정지 사건을 센다."""
    x = np.concatenate([[0], (grid == STATES.index(state)).astype(np.int8), [0]])
    d = np.diff(x)
    return list(zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)))


if __name__ == "__main__":
    st, grids, t0 = make_demo()
    # 분석 창은 데이터보다 안쪽(2일 ~ 26일)이라 clip 이 실제로 쓰인다
    w0, w1 = t0 + pd.Timedelta(days=2), t0 + pd.Timedelta(days=26)
    T = (w1 - w0) / H
    c = clip_states(st, w0, w1)
    cov = coverage(c, w0, w1)
    hrs = state_hours(c)
    av = availability(hrs, T)
    stops = stop_intervals(c, ("DOWN",))
    ss = stop_summary(stops, hrs)
    print(f"창 {T:.0f}h · 장비 {len(hrs)}대 · 겹침 {cov.overlap_h.sum():.2f}h · 빈틈 {cov.gap_h.sum():.2f}h")
    print("\n[장비 × 상태 시간(h)]\n" + hrs.round(1).to_string())
    print("\n[같은 이력, 정의 4종 — 가용도 %]\n" + (100 * av).round(1).to_string())
    print(f"\n[정의 간 최대 차이] 장비별 max−min: {(100 * (av.max(axis=1) - av.min(axis=1))).round(1).tolist()} %p")
    print("\n[비계획 정지 요약] \n" + ss.round(2).to_string())
    cv = weekly_cv(st, t0, t0 + pd.Timedelta(days=28), "op_avail")
    print("\n[주간 Operational Availability 평균·CV]\n" + cv.round(3).to_string())

    # ---- 독립 하드체크 ----
    # (1) 상태 시간 합 = 창 길이, 겹침·빈틈 0  /  행 계산 == 분 격자 세기(다른 경로), 모든 장비·상태
    assert np.allclose(hrs.sum(axis=1), T, atol=1e-9) and (cov.abs() < 1e-12).all().all()
    a, b = 2 * 24 * 60, 26 * 24 * 60
    for e in hrs.index:
        assert np.allclose(hrs.loc[e, STATES].to_numpy(), grid_hours(grids[e], a, b), atol=1e-9), e
    # (2) 쪼개진 DOWN 행도 한 사건으로 합쳐 격자의 최대 연속 구간과 건수·길이가 일치
    for e in hrs.index:
        runs = grid_runs(grids[e][a:b], "DOWN")
        mine = stops[stops.eqp_id == e]
        assert len(runs) == len(mine) and np.allclose(sorted((y - x) / 60 for x, y in runs), sorted(mine["dur_h"]), atol=1e-9), e
    assert len(stops) < (c["state"] == "DOWN").sum()          # 쪼개진 행이 실제로 있었다
    # (3) 손계산: T=100h  P50 S20 E10 PM5 DOWN5 N10 → 0.80 · 80/90 · 70/90 · 0.70
    h1 = pd.DataFrame([[50, 20, 10, 5, 5, 10]], columns=STATES, index=pd.Index(["X"], name="eqp_id"), dtype=float)
    a1 = availability(h1, 100.0).iloc[0]
    assert abs(a1.e79_avail - 0.80) < 1e-12 and abs(a1.op_avail - 80 / 90) < 1e-12
    assert abs(a1.op_mfg - 70 / 90) < 1e-12 and abs(a1.e79_mfg - 0.70) < 1e-12
    # (4) 정의 간 순서(항상 성립): e79_mfg ≤ e79_avail ≤ op_avail, e79_mfg ≤ op_mfg ≤ op_avail
    assert (av.e79_mfg <= av.e79_avail + 1e-12).all() and (av.e79_avail <= av.op_avail + 1e-12).all()
    assert (av.e79_mfg <= av.op_mfg + 1e-12).all() and (av.op_mfg <= av.op_avail + 1e-12).all()
    # (5) 'PM 를 NONSCHED 로 표시하는 관행': E79 계열(분모 T)은 그대로, Operational 계열(분모 T−N)만 올라간다
    hp = hrs.copy()
    hp["NONSCHED"], hp["PM"] = hp["NONSCHED"] + hp["PM"], 0.0
    ap = availability(hp, T)
    assert np.allclose(ap.e79_avail, av.e79_avail) and np.allclose(ap.e79_mfg, av.e79_mfg)
    assert (ap.op_avail > av.op_avail).all() and (ap.op_mfg > av.op_mfg).all()
    # (6) 겹침+빈틈이 서로 상쇄되면 '합 = 창 길이' 는 통과한다 → coverage 가 따로 잡는다 (창 [0,25h): RUN 0~10, IDLE 12~20, DOWN 18~25)
    z = pd.Timestamp("2026-01-01")
    bad = pd.DataFrame([("Y", "RUN", z, z + 10 * H), ("Y", "IDLE", z + 12 * H, z + 20 * H), ("Y", "DOWN", z + 18 * H, z + 25 * H)],
                       columns=["eqp_id", "state", "start", "end"])
    cb = coverage(bad, z, z + 25 * H)
    assert abs(state_hours(bad).sum(axis=1)["Y"] - 25.0) < 1e-12                 # 합은 25h 로 '정상'처럼 보인다
    assert abs(cb.loc["Y", "gap_h"] - 2.0) < 1e-12 and abs(cb.loc["Y", "overlap_h"] - 2.0) < 1e-12
    # (7) 상태 코드 정규화: 모르는 코드는 거부
    m = normalize_states(pd.DataFrame({"eqp_id": ["Z"], "state": ["UDT"], "start": [z], "end": [z + H]}), {"UDT": "DOWN"})
    assert m.loc[0, "state"] == "DOWN"
    try:
        normalize_states(pd.DataFrame({"eqp_id": ["Z"], "state": ["???"], "start": [z], "end": [z + H]}), {"UDT": "DOWN"})
        raise SystemExit("미지 상태 코드를 거부하지 않았다")
    except AssertionError:
        pass
    spread = (av.max(axis=1) - av.min(axis=1)).max() * 100
    print(f"\nHARD CHECK OK: 상태 시간 합 = {T:.0f}h(장비 {len(hrs)}대)·행 계산 == 분 격자 세기·정지 사건 {len(stops)}건(쪼개진 행 합침) 격자와 일치·"
          f"손계산 4종 일치·정의 간 최대 차이 {spread:.1f}%p·겹침/빈틈 상쇄 사례 검출")
