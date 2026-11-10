"""사건 이력에서 라벨 만들기 — 예측 시점 t0 · 관측 창 W · 예측 구간 H.   실행: python code/event_label_builder.py
입력: events(eqp_id, ts, code, severity) 알람 이력 / outcomes(eqp_id, ts, end_ts, type) 정지 이력 (시각 단위 = 시간, float) / data_end.
출력: samples(eqp_id, t0, 특징..., label, excluded_reason).  label = 1[(t0, t0+H] 안에 사건 시작이 1건 이상].
규칙(이 파일이 정본):
  관측 창   (t0-W, t0]  — 아래쪽 끝은 제외, t0 에 막 울린 알람은 포함(그 순간 이미 아는 정보).
  예측 구간 (t0, t0+H]  — 위쪽 끝 포함.  사건 시작 시각이 t0 와 같으면 이미 진행 중이므로 이 표본에서 뺀다.
  제외      in_progress: 사건이 start <= t0 < end 로 진행 중 / censored: t0+H > data_end(라벨 확정 불가 → 0 으로 두지 않고 버린다).
합성 데이터는 스스로 만든다. 결과는 방법 시연이지 현장 수치가 아니다. 필요: numpy · pandas (하드체크의 AUC 만 scikit-learn).
"""
import sys
import numpy as np
import pandas as pd

LEGIT_FEATURES = ["n_alarm_W", "max_sev_W", "hours_since_last_alarm"]  # t0 이전에 알 수 있는 컬럼 허용 목록


def episode_t0(events, quiet_h):
    """알람 연쇄를 사건 하나로 묶는 인과적 규칙: 같은 장비의 직전 알람이 quiet_h 시간 넘게 이전이면 새 사건의 시작.
    시작 시각 t0 에서 직전 알람만 보면 되므로 미래 정보를 쓰지 않는다. 반환: DataFrame(eqp_id, t0)."""
    rows = []
    for eqp, g in events.sort_values(["eqp_id", "ts"]).groupby("eqp_id"):
        prev = -np.inf
        for ts in g["ts"].to_numpy(float):
            if ts - prev > quiet_h:
                rows.append((eqp, ts))
            prev = ts
    return pd.DataFrame(rows, columns=["eqp_id", "t0"])


def grid_t0(eqps, start, stop, step):
    """장비 × 고정 간격 시각 칸. stop 포함."""
    ts = np.arange(start, stop + 1e-9, step)
    return pd.DataFrame([(e, float(t)) for e in eqps for t in ts], columns=["eqp_id", "t0"])


def build_samples(t0_table, events, outcomes, W, H, data_end):
    ev = {e: g.sort_values("ts") for e, g in events.groupby("eqp_id")}
    oc = {e: g.sort_values("ts") for e, g in outcomes.groupby("eqp_id")}
    empty_e, empty_o = events.iloc[0:0], outcomes.iloc[0:0]
    rows = []
    for eqp, t0 in zip(t0_table["eqp_id"], t0_table["t0"]):
        e = ev.get(eqp, empty_e)
        win = e[(e["ts"] > t0 - W) & (e["ts"] <= t0)]
        o = oc.get(eqp, empty_o)
        in_prog = bool(((o["ts"] <= t0) & (t0 < o["end_ts"])).any())
        hit = bool(((o["ts"] > t0) & (o["ts"] <= t0 + H)).any())
        reason = "in_progress" if in_prog else ("censored" if t0 + H > data_end else "")
        rows.append({
            "eqp_id": eqp, "t0": float(t0),
            "n_alarm_W": int(len(win)),
            "max_sev_W": int(win["severity"].max()) if len(win) else 0,
            "hours_since_last_alarm": float(t0 - win["ts"].max()) if len(win) else float(W),
            "feat_max_ts": float(win["ts"].max()) if len(win) else np.nan,  # 점검용: 특징에 쓴 가장 늦은 시각
            "label": np.nan if reason else float(hit),
            "excluded_reason": reason,
        })
    return pd.DataFrame(rows)


def audit_features(columns, allowed=LEGIT_FEATURES, meta=("eqp_id", "t0", "feat_max_ts", "label", "excluded_reason")):
    """허용 목록에 없는 컬럼을 돌려준다(= t0 에 알 수 있는지 사람이 확인해야 할 의심 컬럼)."""
    return [c for c in columns if c not in allowed and c not in meta]


def add_leaky_column(samples, outcomes):
    """시연용 금지 컬럼: 다음 정지 시작까지 남은 시간(미래 정보). 실제 서비스에서는 절대 특징이 될 수 없다."""
    oc = {e: g["ts"].to_numpy(float) for e, g in outcomes.groupby("eqp_id")}
    nxt = []
    for eqp, t0 in zip(samples["eqp_id"], samples["t0"]):
        later = oc.get(eqp, np.array([])); later = later[later > t0]
        nxt.append(float(later.min() - t0) if len(later) else 1e4)
    out = samples.copy()
    out["hours_to_next_down"] = nxt
    return out


def synthetic_history(seed=7, n_eqp=6, days=60):
    """장비별 정지(평균 약 150h 마다, 1~3h) + 정지 직전 6h 에 알람이 잦아지는 합성 이력. 정답 구조를 아는 시험지."""
    rng = np.random.default_rng(seed)
    T = days * 24.0
    ev, oc = [], []
    for k in range(n_eqp):
        eqp = f"E{k+1}"
        t = rng.exponential(150)
        downs = []
        while t < T - 5:
            dur = float(rng.uniform(1, 3)); downs.append((t, t + dur)); t += dur + rng.exponential(150)
        for s, e in downs:
            oc.append((eqp, s, e, "DOWN"))
        alarm_ts = list(rng.uniform(0, T, rng.poisson(0.05 * T)))                 # 배경 알람 0.05/h
        for s, _ in downs:
            alarm_ts += list(s - rng.uniform(0, 6, rng.poisson(4)))                 # 정지 전 6h 에 평균 4건 추가
        for ts in alarm_ts:
            if ts > 0:
                ev.append((eqp, float(ts), f"A{rng.integers(1, 6)}", int(rng.integers(1, 4))))
    events = pd.DataFrame(ev, columns=["eqp_id", "ts", "code", "severity"]).sort_values(["eqp_id", "ts"]).reset_index(drop=True)
    outcomes = pd.DataFrame(oc, columns=["eqp_id", "ts", "end_ts", "type"])
    return events, outcomes, T


def py_reference_label(eqp, t0, outcomes_rows, H, data_end):
    """검산용: pandas 를 쓰지 않는 순수 파이썬 루프. 반환 (label 또는 None, 사유)."""
    for e, s, en in outcomes_rows:
        if e == eqp and s <= t0 < en:
            return None, "in_progress"
    if t0 + H > data_end:
        return None, "censored"
    return (1.0 if any(e == eqp and t0 < s <= t0 + H for e, s, en in outcomes_rows) else 0.0), ""


def py_reference_features(eqp, t0, W, events_rows):
    xs = [(ts, sv) for e, ts, sv in events_rows if e == eqp and t0 - W < ts <= t0]
    n = len(xs)
    return n, (max(sv for _, sv in xs) if xs else 0), (t0 - max(ts for ts, _ in xs) if xs else float(W))


def main():
    W, H = 12.0, 8.0

    # ---------- (A) 손으로 만든 소형 이력 — 라벨을 손으로 먼저 쓴다 ----------
    ev = pd.DataFrame([("E1", 2.0, "A1", 1), ("E1", 7.5, "A2", 3), ("E1", 9.0, "A1", 2), ("E1", 20.0, "A1", 1),
                       ("E2", 28.0, "A3", 2), ("E2", 28.5, "A3", 5), ("E2", 15.0, "A1", 1)],
                      columns=["eqp_id", "ts", "code", "severity"])
    oc = pd.DataFrame([("E1", 10.0, 13.0, "DOWN"), ("E1", 26.0, 27.0, "DOWN"), ("E2", 32.0, 33.0, "DOWN")],
                      columns=["eqp_id", "ts", "end_ts", "type"])
    hW, hH, end = 8.0, 4.0, 40.0
    grid = grid_t0(["E1", "E2"], 4.0, 40.0, 4.0)
    s = build_samples(grid, ev, oc, hW, hH, end)
    expected = {  # (장비, t0): (라벨 또는 None, 사유) — 손으로 쓴 정답
        ("E1", 4.0): (0.0, ""), ("E1", 8.0): (1.0, ""),            # (8,12] 안에 10 에 시작
        ("E1", 12.0): (None, "in_progress"),                        # 10<=12<13 진행 중
        ("E1", 16.0): (0.0, ""), ("E1", 20.0): (0.0, ""),
        ("E1", 24.0): (1.0, ""),                                    # (24,28] 안에 26
        ("E1", 28.0): (0.0, ""), ("E1", 32.0): (0.0, ""), ("E1", 36.0): (0.0, ""),
        ("E1", 40.0): (None, "censored"),                           # 40+4 > 40
        ("E2", 4.0): (0.0, ""), ("E2", 8.0): (0.0, ""), ("E2", 12.0): (0.0, ""), ("E2", 16.0): (0.0, ""),
        ("E2", 20.0): (0.0, ""), ("E2", 24.0): (0.0, ""),
        ("E2", 28.0): (1.0, ""),                                    # 위쪽 끝 포함: (28,32] 에 32
        ("E2", 32.0): (None, "in_progress"),                        # 시작 시각 == t0 → 이미 진행 중
        ("E2", 36.0): (0.0, ""), ("E2", 40.0): (None, "censored"),
    }
    assert len(s) == len(expected), (len(s), len(expected))
    for _, r in s.iterrows():
        lab, why = expected[(r["eqp_id"], r["t0"])]
        got = None if np.isnan(r["label"]) else r["label"]
        assert got == lab and r["excluded_reason"] == why, (r["eqp_id"], r["t0"], got, r["excluded_reason"], lab, why)
    # 특징도 손계산: E1 t0=12 → (4,12] 알람 7.5(sev3), 9.0(sev2) → n=2, max=3, since=3.0 ; E2 t0=28 → (20,28] 28.0(2) → n=1, max=2, since=0
    #   E2 t0=36 → (28,36] 에는 28.5 만 → n=1, max=5, since=7.5 (28.0 은 창 아래쪽 끝이라 제외)
    f = s.set_index(["eqp_id", "t0"])
    assert tuple(f.loc[("E1", 12.0), ["n_alarm_W", "max_sev_W", "hours_since_last_alarm"]]) == (2, 3, 3.0)
    # E2 t0=28: 창 (20,28] → 알람 28.0(sev2) 만 (28.5 는 t0 뒤) → (1, 2, 0.0)
    assert tuple(f.loc[("E2", 28.0), ["n_alarm_W", "max_sev_W", "hours_since_last_alarm"]]) == (1, 2, 0.0)
    assert tuple(f.loc[("E2", 36.0), ["n_alarm_W", "max_sev_W", "hours_since_last_alarm"]]) == (1, 5, 7.5)
    assert tuple(f.loc[("E2", 4.0), ["n_alarm_W", "max_sev_W", "hours_since_last_alarm"]]) == (0, 0, 8.0)
    # 사건 묶기(quiet 4h): E1 알람 2.0 | 7.5 9.0 (7.5-2.0=5.5>4 → 새 사건, 9.0-7.5=1.5 → 같은 사건) | 20.0 ; E2 15.0 | 28.0 28.5
    ep = episode_t0(ev, 4.0)
    assert [(a, t) for a, t in zip(ep["eqp_id"], ep["t0"])] == [("E1", 2.0), ("E1", 7.5), ("E1", 20.0), ("E2", 15.0), ("E2", 28.0)], ep
    print("[A] 손으로 만든 이력: 표본 20행(제외 4행)의 라벨·사유·특징이 손정답과 정확히 일치")

    # ---------- (B) 합성 이력: 예측 시점 뒤를 보지 않는다 ----------
    events, outcomes, T = synthetic_history()
    t0s = grid_t0(sorted(events["eqp_id"].unique()), 24.0, T, 2.0)
    samp = build_samples(t0s, events, outcomes, W, H, T)
    used = samp.dropna(subset=["feat_max_ts"])
    assert (used["feat_max_ts"] <= used["t0"] + 1e-12).all(), "특징이 t0 뒤 시각을 썼다"
    ev_rows = list(zip(events["eqp_id"], events["ts"], events["severity"]))
    oc_rows = list(zip(outcomes["eqp_id"], outcomes["ts"], outcomes["end_ts"]))
    rng = np.random.default_rng(0)
    for i in rng.choice(len(samp), 400, replace=False):           # 순수 파이썬 루프 대조(400행 무작위)
        r = samp.iloc[i]
        lab, why = py_reference_label(r["eqp_id"], r["t0"], oc_rows, H, T)
        assert (None if np.isnan(r["label"]) else r["label"]) == lab and r["excluded_reason"] == why
        n, mx, since = py_reference_features(r["eqp_id"], r["t0"], W, ev_rows)
        assert (r["n_alarm_W"], r["max_sev_W"]) == (n, mx) and abs(r["hours_since_last_alarm"] - since) < 1e-9
    # 미래 변조 시험: t0 이후 알람의 심각도를 전부 99 로 바꿔도 특징이 같아야 한다
    for i in rng.choice(len(samp), 30, replace=False):
        r = samp.iloc[i]
        tampered = events.copy()
        tampered.loc[tampered["ts"] > r["t0"], "severity"] = 99
        r2 = build_samples(pd.DataFrame([(r["eqp_id"], r["t0"])], columns=["eqp_id", "t0"]), tampered, outcomes, W, H, T).iloc[0]
        assert (r2["n_alarm_W"], r2["max_sev_W"]) == (r["n_alarm_W"], r["max_sev_W"])
    print(f"[B] 합성 이력: 표본 {len(samp)}행, 특징의 가장 늦은 시각 <= t0 전수 통과, 순수 파이썬 대조 400행 일치, 미래 변조 30건 불변")

    # ---------- (C) H 를 줄이면 양성 비율이 0 으로 ----------
    print("    H(h)  표본수  양성  양성비율   (제외: in_progress / censored)")
    rates = []
    for h in (1e-6, 1.0, 4.0, 8.0, 24.0):
        sh = build_samples(t0s, events, outcomes, W, h, T)
        ok = sh.dropna(subset=["label"])
        rates.append(ok["label"].mean())
        ex = sh["excluded_reason"].value_counts()
        print(f"    {h:<6g} {len(ok):6d} {int(ok['label'].sum()):5d}  {ok['label'].mean():.4f}     ({ex.get('in_progress', 0)} / {ex.get('censored', 0)})")
    assert rates[0] == 0.0, "H→0 이면 양성 비율이 0 이어야 한다"
    assert rates[1] < rates[3] < rates[4]
    print("[C] H→0 이면 양성 비율 0, H 를 키우면 늘어남")

    # ---------- (D) 금지 컬럼을 넣으면 검사가 작동한다 ----------
    from sklearn.metrics import roc_auc_score
    ok = samp.dropna(subset=["label"])
    leaky = add_leaky_column(ok, outcomes)
    auc_legit = max(roc_auc_score(leaky["label"], leaky[c]) for c in ("n_alarm_W", "max_sev_W"))
    auc_leak = roc_auc_score(leaky["label"], -leaky["hours_to_next_down"])
    flagged = audit_features(list(leaky.columns))
    print(f"[D] 허용 특징 단일 AUC 최대 {auc_legit:.3f} / 금지 컬럼(hours_to_next_down) AUC {auc_leak:.3f} / 허용 목록 밖 컬럼 {flagged}")
    assert auc_leak > 0.95 and auc_leak > auc_legit + 0.2, "금지 컬럼을 넣었는데 점수가 비정상적으로 뛰지 않았다 — 검사가 못 잡는다"
    assert flagged == ["hours_to_next_down"] and audit_features(LEGIT_FEATURES) == []
    # 알람 연쇄 묶기: 장비별로 사건 수가 알람 수보다 줄어든다
    ep = episode_t0(events, 4.0)
    assert 0 < len(ep) < len(events)
    print(f"    알람 {len(events)}건 → 사건 {len(ep)}건 (quiet 4h)")
    print("HARD CHECK OK: 손정답 20행 일치 · 특징 시각 <= t0 전수 · 순수 파이썬 대조 · 미래 변조 불변 · H→0 양성 0 · 금지 컬럼 AUC "
          f"{auc_leak:.2f} 감지")


if __name__ == "__main__":
    sys.exit(main())
