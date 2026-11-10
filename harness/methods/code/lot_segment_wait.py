"""로트 이력에서 구간 대기 뽑기 — 공정 간 대기·Q-time 위반·사이클타임 분해·리틀의 법칙 검산.  실행: python code/lot_segment_wait.py
입력 lot_hist  : lot_id, step, eqp_id, track_in, track_out   (시각은 pandas Timestamp, 한 행 = 한 번의 공정 처리)
     선택 열   : rework(bool)
입력 qtime     : from_step, to_step, limit_h               (앞 공정 track_out → 뒤 공정 track_in 이 limit_h 를 넘으면 위반)
입력 eqp_state : eqp_id, state(RUN/IDLE/PM/DOWN/ENG), start, end      (원인 겹침 조인용)
입력 urgent    : lot_id, requested_at, priority            (긴급 요청 로트)
입력 expt      : lot_id, eqp_id, planned_start, planned_end (실험 로트 일정)
입력 lineage   : child_lot_id, parent_lot_id               (분할·병합 로트 잇기용, 선택)
위반 판정은 엄격한 '>' — 정확히 limit_h 인 대기는 위반이 아니다(경계 포함 여부는 현업과 합의, 문서 함정 참고).
"""
import numpy as np
import pandas as pd

H = pd.Timedelta(hours=1)
ROUTE = ["PHOTO", "ETCH", "CLEAN", "OXID", "DEP", "CMP"]
EQPS = {"PHOTO": ["PH01", "PH02"], "ETCH": ["ET01", "ET02", "ET03"], "CLEAN": ["CL01", "CL02"],
        "OXID": ["OX01", "OX02"], "DEP": ["DP01", "DP02"], "CMP": ["CM01"]}
PROC_MEAN_H = {"PHOTO": 1.0, "ETCH": 1.5, "CLEAN": 0.5, "OXID": 3.0, "DEP": 2.0, "CMP": 1.5}
QTIME = pd.DataFrame([("ETCH", "CLEAN", 4.0), ("CLEAN", "OXID", 6.0)], columns=["from_step", "to_step", "limit_h"])


# ---------------------------------------------------------------- 계산 본체
def data_quality(h):
    """구간을 뽑기 전 점검: 처리 시간이 음수인 행, 한 로트 안에서 겹치는 이벤트, 완전 중복 행, 이벤트가 1개뿐인 로트."""
    s = h.sort_values(["lot_id", "track_in", "track_out"], kind="mergesort")
    nxt_in = s.groupby("lot_id")["track_in"].shift(-1)
    return {
        "neg_proc_rows": int((s["track_out"] < s["track_in"]).sum()),
        "overlap_rows": int((nxt_in < s["track_out"]).sum()),
        "duplicate_rows": int(h.duplicated(["lot_id", "step", "eqp_id", "track_in", "track_out"]).sum()),
        "single_event_lots": int((h.groupby("lot_id").size() == 1).sum()),
    }


def build_segments(h):
    """이벤트를 (lot_id, track_in, track_out) 으로 정렬하고 같은 로트의 다음 이벤트와 짝지어 구간을 만든다.
    구간 = 앞 처리의 track_out → 뒤 처리의 track_in.  wait_h 는 그 사이 시간(시간 단위)."""
    s = h.sort_values(["lot_id", "track_in", "track_out"], kind="mergesort").reset_index(drop=True)
    nxt = s.groupby("lot_id").shift(-1)
    ok = nxt["step"].notna()
    seg = pd.DataFrame({
        "lot_id": s["lot_id"], "from_step": s["step"], "to_step": nxt["step"],
        "from_eqp": s["eqp_id"], "to_eqp": nxt["eqp_id"],
        "t_out": s["track_out"], "t_in": nxt["track_in"],
    })[ok].reset_index(drop=True)
    seg["wait"] = seg["t_in"] - seg["t_out"]
    seg["wait_h"] = seg["wait"] / H
    return seg


def flag_qtime(seg, qtime):
    """(from_step, to_step) 로 규칙표를 붙이고 wait > limit 이면 violated.  Timedelta 로 비교해 부동소수 경계 오차를 없앤다."""
    q = qtime.copy()
    q["limit"] = pd.to_timedelta(q["limit_h"], unit="h")
    out = seg.merge(q[["from_step", "to_step", "limit_h", "limit"]], on=["from_step", "to_step"], how="left")
    out["violated"] = out["limit"].notna() & (out["wait"] > out["limit"])
    return out.drop(columns="limit")


def lot_cycle_table(h, seg):
    """로트별 사이클타임 분해: ct = (마지막 out − 첫 in) = Σ처리 + Σ구간대기 + residual (residual≠0 이면 겹침·누락)."""
    g = h.groupby("lot_id")
    t = pd.DataFrame({"first_in": g["track_in"].min(), "last_out": g["track_out"].max(), "n_events": g.size()})
    t["ct_h"] = (t["last_out"] - t["first_in"]) / H
    t["proc_h"] = ((h["track_out"] - h["track_in"]) / H).groupby(h["lot_id"]).sum()
    t["wait_h"] = seg.groupby("lot_id")["wait_h"].sum()
    t["wait_h"] = t["wait_h"].fillna(0.0)
    t["residual_h"] = t["ct_h"] - t["proc_h"] - t["wait_h"]
    if "rework" in h.columns:
        t["rework_n"] = h.groupby("lot_id")["rework"].sum().astype(int)
    else:  # 재진입 공정이면 부정확 — 문서 함정
        t["rework_n"] = g["step"].size() - g["step"].nunique()
    return t


def pair_summary(segq):
    """공정 쌍별 대기 분포와 위반율(대기 시간 합이 큰 순)."""
    g = segq.groupby(["from_step", "to_step"])["wait_h"]
    s = g.agg(n="size", mean="mean", p50="median", max="max", total="sum")
    s["p90"] = g.quantile(0.9)
    s["p95"] = g.quantile(0.95)
    v = segq.groupby(["from_step", "to_step"])["violated"].agg(viol_n="sum")
    s = s.join(v)
    s["viol_rate"] = s["viol_n"] / s["n"]
    return s.sort_values("total", ascending=False)


def wait_by_group(seg, key="to_eqp"):
    """장비(또는 step) 앞 대기 시간 합 순위 — '사이클타임을 가장 많이 먹는 곳'."""
    return seg.groupby(key)["wait_h"].agg(n="size", total="sum", mean="mean").sort_values("total", ascending=False)


def stitch_lineage(h, lineage):
    """분할·병합 로트 잇기: 자식 로트의 첫 이벤트 앞에, track_out 이 자식 첫 track_in 이하인 부모 이벤트 중 가장 늦은 것
    (병합이면 부모들 중 마지막으로 끝난 것) 하나를 복사해 붙인다.  구간 분석용 — 로트 단위 CT·WIP 합계에는 쓰지 않는다
    (부모 대기가 자식 수만큼 중복 집계된다)."""
    first_in = h.groupby("lot_id")["track_in"].min()
    last = h.sort_values("track_out").groupby("lot_id").tail(1).set_index("lot_id")
    rows = []
    for child, grp in lineage.groupby("child_lot_id"):
        cin = first_in[child]
        cand = [last.loc[p].copy() for p in grp["parent_lot_id"] if p in last.index and last.loc[p, "track_out"] <= cin]
        if not cand:
            continue
        best = max(cand, key=lambda r: r["track_out"])
        r = best.copy()
        r["lot_id"] = child
        rows.append(r)
    add = pd.DataFrame(rows).reset_index(drop=True)
    return pd.concat([h, add[h.columns]], ignore_index=True) if len(add) else h


# ---------------------------------------------------------------- 4종 조인(원인 겹침)
def _merge_iv(ivs):
    out = []
    for a, b in sorted(ivs):
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def _overlap_h(a0, a1, ivs):
    return sum((max(pd.Timedelta(0), min(a1, b) - max(a0, a)) for a, b in _merge_iv(ivs)), pd.Timedelta(0)) / H


def join_context(segq, h, eqp_state, urgent, expt, share=0.5):
    """위반 구간마다 [t_out, t_in] 과 같은 뒤 장비(to_eqp) 위의 세 가지 겹침 시간을 잰다.
       down_h : eqp_state 가 PM/DOWN 인 구간과 겹친 시간        (조인 키 eqp_id + 시간 겹침)
       expt_h : 실험 로트(expt.lot_id)가 그 장비를 처리 중이던 시간  (lot_id 로 lot_hist 와 조인, eqp_id 일치)
       hot_h  : 긴급 로트(urgent.lot_id)가 그 장비를 처리 중이던 시간
    가장 큰 겹침이 대기의 share 이상이면 그 이름을, 아니면 '미식별'.  겹침은 인과가 아니다 — 원인 후보를 좁힐 뿐."""
    v = segq[segq["violated"]].copy().reset_index(drop=True)
    st = eqp_state[eqp_state["state"].isin(["PM", "DOWN"])]
    hx = h[h["lot_id"].isin(expt["lot_id"])]
    hu = h[h["lot_id"].isin(urgent["lot_id"])]
    rows = []
    for r in v.itertuples():
        e = r.to_eqp
        down = _overlap_h(r.t_out, r.t_in, [(a, b) for a, b in zip(st.loc[st.eqp_id == e, "start"], st.loc[st.eqp_id == e, "end"])])
        ex = _overlap_h(r.t_out, r.t_in, [(a, b) for a, b in zip(hx.loc[hx.eqp_id == e, "track_in"], hx.loc[hx.eqp_id == e, "track_out"])])
        ho = _overlap_h(r.t_out, r.t_in, [(a, b) for a, b in zip(hu.loc[hu.eqp_id == e, "track_in"], hu.loc[hu.eqp_id == e, "track_out"])])
        rows.append((down, ex, ho))
    v[["down_h", "expt_h", "hot_h"]] = pd.DataFrame(rows, columns=["down_h", "expt_h", "hot_h"]) if rows else np.empty((0, 3))
    names = np.array(["장비 정지", "실험 로트", "긴급 로트"])
    if len(v):
        m = v[["down_h", "expt_h", "hot_h"]].to_numpy()
        top = m.argmax(axis=1)
        v["cause"] = np.where(m.max(axis=1) >= share * v["wait_h"].to_numpy(), names[top], "미식별")
    else:
        v["cause"] = []
    return v


# ---------------------------------------------------------------- 리틀의 법칙 검산
def lot_intervals(h):
    g = h.groupby("lot_id")
    return pd.DataFrame({"first_in": g["track_in"].min(), "last_out": g["track_out"].max()})


def wip_overlap_mean(iv, t0, t1):
    """창 [t0,t1) 의 평균 재공 = Σ(로트 체류 구간 ∩ 창) / 창 길이."""
    ov = (iv["last_out"].clip(upper=t1) - iv["first_in"].clip(lower=t0)).clip(lower=pd.Timedelta(0))
    return ov.sum() / (t1 - t0)


def wip_sweep_mean(iv, t0, t1):
    """같은 값을 다른 방법으로: 입고(+1)·출고(−1) 사건을 시간순으로 훑어 재공 계단함수를 적분."""
    ts = np.concatenate([iv["first_in"].astype("int64").to_numpy(), iv["last_out"].astype("int64").to_numpy()]) / 1e9
    dl = np.concatenate([np.ones(len(iv)), -np.ones(len(iv))])
    o = np.lexsort((dl, ts))                      # 같은 시각이면 출고(−1)를 먼저
    ts, dl = ts[o], dl[o]
    lvl = np.cumsum(dl)
    a, b = t0.value / 1e9, t1.value / 1e9
    edges = np.append(ts, max(b, ts[-1]))
    seg_lo, seg_hi = np.clip(edges[:-1], a, b), np.clip(edges[1:], a, b)
    return float((lvl * (seg_hi - seg_lo)).sum() / (b - a))


def wip_snapshot_mean(iv, t0, t1, step_min=60):
    """MES 재공 스냅샷을 흉내: step_min 분마다 '그 시각 체류 중 로트 수'를 세어 평균(별도 출처의 WIP)."""
    grid = pd.date_range(t0, t1, freq=f"{step_min}min", inclusive="left")
    fi, lo = np.sort(iv["first_in"].to_numpy()), np.sort(iv["last_out"].to_numpy())
    g = grid.to_numpy()
    cnt = np.searchsorted(fi, g, side="right") - np.searchsorted(lo, g, side="right")
    return float(cnt.mean())


def littles_law(h, t0, t1, wip_ref=None):
    """창 [t0,t1) 에서 λ(창 안에 나간 로트 수/시간), W(그 로트들의 평균 체류), L(평균 재공) 을 구해 L ≈ λW 인지 본다.
    wip_ref 가 주어지면(별도 출처의 평균 WIP) 그것과 λW 를 비교한다."""
    iv = lot_intervals(h)
    ex = iv[(iv["last_out"] >= t0) & (iv["last_out"] < t1)]
    T = (t1 - t0) / H
    lam = len(ex) / T
    W = ((ex["last_out"] - ex["first_in"]) / H).mean()
    out = {"n_exit": len(ex), "lambda_per_h": lam, "W_h": W, "L_pred": lam * W,
           "L_overlap": wip_overlap_mean(iv, t0, t1), "L_sweep": wip_sweep_mean(iv, t0, t1)}
    if wip_ref is not None:
        out["L_ref"] = wip_ref
        out["rel_err"] = abs(out["L_pred"] - wip_ref) / wip_ref
    return out


# ---------------------------------------------------------------- 합성 데이터
def make_demo(seed=20261111, n_lots=700):
    """합성 로트 이력.  시간은 시간 단위 정수 분으로 만들어 경계 판정이 정확하다.
    심어 둔 것: Q-time 위반 16건(원인 4종 × 4: 장비 정지·실험 로트·긴급 로트·미식별) + 경계 정확히 한도인 1건(위반 아님)
    + 재작업 로트 12개.  planted = 정답표(계산 코드는 이 표를 보지 않는다)."""
    rng = np.random.default_rng(seed)
    t0 = pd.Timestamp("2026-09-01 00:00")
    mins = lambda hrs: pd.Timedelta(minutes=int(round(hrs * 60)))
    limit = {("ETCH", "CLEAN"): 4.0, ("CLEAN", "OXID"): 6.0}
    pool = rng.choice(np.arange(100, 600), size=16 + 1 + 12, replace=False)
    causes = ["장비 정지"] * 4 + ["실험 로트"] * 4 + ["긴급 로트"] * 4 + ["미식별"] * 4
    pairs = [("ETCH", "CLEAN"), ("CLEAN", "OXID")] * 8
    planted = {int(i): (pairs[k], causes[k]) for k, i in enumerate(pool[:16])}
    boundary_lot = int(pool[16])                 # ETCH→CLEAN 대기가 정확히 4h
    rework_lots = set(int(i) for i in pool[17:])
    arr = t0 + pd.to_timedelta(np.cumsum(rng.exponential(2.4, n_lots)), unit="h")
    rows, state, ctx_lots, urgent, expt, truth = [], [], [], [], [], {}
    for i in range(n_lots):
        lot = f"L{i:04d}"
        t = arr[i]
        for k, step in enumerate(ROUTE):
            eqp = rng.choice(EQPS[step])
            pr = mins(rng.lognormal(np.log(PROC_MEAN_H[step]) - 0.02, 0.2))
            rows.append((lot, step, eqp, t, t + pr, False))
            t_out = t + pr
            if step == "ETCH" and i in rework_lots:      # 재작업: 같은 ETCH 를 한 번 더
                t2 = t_out + mins(rng.uniform(0.5, 2.0))
                eqp2 = rng.choice(EQPS[step])
                pr2 = mins(rng.lognormal(np.log(PROC_MEAN_H[step]) - 0.02, 0.2))
                rows.append((lot, step, eqp2, t2, t2 + pr2, True))
                t_out, eqp = t2 + pr2, eqp2
            if k == len(ROUTE) - 1:
                break
            nxt = ROUTE[k + 1]
            key = (step, nxt)
            if i in planted and planted[i][0] == key:
                wait = mins(limit[key] + rng.uniform(1.0, 12.0))
            elif i == boundary_lot and key == ("ETCH", "CLEAN"):
                wait = mins(4.0)
            elif key in limit:
                wait = mins(rng.uniform(0.3, 0.8 * limit[key]))
            else:
                wait = mins(float(np.clip(rng.exponential(14.0), 0.2, 72.0)))
            t = t_out + wait
            if i in planted and planted[i][0] == key:    # 원인 쪽 기록을 뒤 장비 위에 심는다
                to_eqp = rng.choice(EQPS[nxt])
                # 이 로트의 다음 처리 장비는 아래에서 to_eqp 로 고정한다
                truth[lot] = (key, planted[i][1], to_eqp)
    h = pd.DataFrame(rows, columns=["lot_id", "step", "eqp_id", "track_in", "track_out", "rework"])
    for lot, (key, cause, to_eqp) in truth.items():
        idx = h.index[(h.lot_id == lot) & (h.step == key[1])][0]
        h.loc[idx, "eqp_id"] = to_eqp
        t_out = h.loc[(h.lot_id == lot) & (h.step == key[0]), "track_out"].max()
        t_in = h.loc[idx, "track_in"]
        a, b = t_out + pd.Timedelta(minutes=15), t_in - pd.Timedelta(minutes=15)
        if cause == "장비 정지":
            state.append((to_eqp, "DOWN", a, b))
        elif cause == "실험 로트":
            xid = f"X{len(expt):03d}"
            ctx_lots.append((xid, key[1], to_eqp, a, b, False))
            expt.append((xid, to_eqp, a, b))
        elif cause == "긴급 로트":
            hid = f"H{len(urgent):03d}"
            ctx_lots.append((hid, key[1], to_eqp, a, b, False))
            urgent.append((hid, t_out, int(rng.integers(1, 4))))
    # 배경 장비 상태: 짧은 PM/DOWN(≤1.5h) 은 어느 위반 대기(>4h)의 절반도 못 채운다
    horizon = (h["track_out"].max() - t0) / H
    for e in [e for v in EQPS.values() for e in v]:
        for _ in range(3):
            s = t0 + mins(rng.uniform(0, horizon))
            state.append((e, str(rng.choice(["PM", "DOWN"])), s, s + mins(rng.uniform(0.5, 1.5))))
        for _ in range(3):
            s = t0 + mins(rng.uniform(0, horizon))
            state.append((e, "IDLE", s, s + mins(rng.uniform(0.5, 6.0))))
    h = pd.concat([h, pd.DataFrame(ctx_lots, columns=h.columns)], ignore_index=True)
    eqp_state = pd.DataFrame(state, columns=["eqp_id", "state", "start", "end"])
    urgent = pd.DataFrame(urgent, columns=["lot_id", "requested_at", "priority"])
    expt = pd.DataFrame(expt, columns=["lot_id", "eqp_id", "planned_start", "planned_end"])
    exp_viol = {(f"L{i:04d}", pair[0], pair[1]): cause for i, (pair, cause) in planted.items()}
    return h, eqp_state, urgent, expt, {"violations": exp_viol,
                                        "boundary": (f"L{boundary_lot:04d}", "ETCH", "CLEAN"),
                                        "rework_lots": {f"L{i:04d}" for i in rework_lots}, "t0": t0}


def ref_segments_loop(h):
    """하드체크용: 판다스 shift 와 다른 경로(순수 파이썬 dict·리스트 순회)로 구간 대기를 다시 계산."""
    by = {}
    for r in h.itertuples():
        by.setdefault(r.lot_id, []).append((r.track_in, r.track_out, r.step))
    out = {}
    for lot, ev in by.items():
        ev.sort(key=lambda x: (x[0], x[1]))
        for a, b in zip(ev, ev[1:]):
            out.setdefault((lot, a[2], b[2]), []).append((b[0] - a[1]).total_seconds() / 3600.0)
    return out


def hand_stitch_cases():
    """손계산 소형 사례(시각은 시간 단위 숫자를 Timestamp 로).  분할: P(A 0~1, B 2~3) → C1(C 5~6), C2(C 7~8).
    병합: P1(A 0~1, B 2~3), P2(A 0~1, B 4~5) → M(C 8~9).  기대: C1 B→C 대기 2h, C2 4h, M 은 마지막으로 끝난 P2 의 B 에서 3h."""
    ts = lambda x: pd.Timestamp("2026-01-01") + pd.Timedelta(hours=x)
    h = pd.DataFrame([("P", "A", "e1", ts(0), ts(1), False), ("P", "B", "e2", ts(2), ts(3), False),
                      ("C1", "C", "e3", ts(5), ts(6), False), ("C2", "C", "e3", ts(7), ts(8), False),
                      ("P1", "A", "e1", ts(0), ts(1), False), ("P1", "B", "e2", ts(2), ts(3), False),
                      ("P2", "A", "e1", ts(0), ts(1), False), ("P2", "B", "e2", ts(4), ts(5), False),
                      ("M", "C", "e3", ts(8), ts(9), False)],
                     columns=["lot_id", "step", "eqp_id", "track_in", "track_out", "rework"])
    lin = pd.DataFrame([("C1", "P"), ("C2", "P"), ("M", "P1"), ("M", "P2")], columns=["child_lot_id", "parent_lot_id"])
    return h, lin


if __name__ == "__main__":
    h, eqp_state, urgent, expt, truth = make_demo()
    dq = data_quality(h)
    seg = build_segments(h)
    segq = flag_qtime(seg, QTIME)
    ct = lot_cycle_table(h, seg)
    print(f"이벤트 {len(h)}행 · 로트 {h.lot_id.nunique()}개 · 구간 {len(seg)}개 · 데이터 점검 {dq}")
    print("\n[공정 쌍별 대기(시간) — 대기 합 큰 순]")
    print(pair_summary(segq).round(2).to_string())
    viol = join_context(segq, h, eqp_state, urgent, expt)
    print(f"\n[Q-time 위반 {len(viol)}건 — 원인 겹침 조인]")
    print(viol[["lot_id", "from_step", "to_step", "to_eqp", "wait_h", "limit_h", "down_h", "expt_h", "hot_h", "cause"]].round(2).to_string(index=False))

    # ---- 독립 하드체크 ----
    # (1) 심어 둔 위반을 정확히 찾는다(과검출·누락 모두 0), 경계(정확히 한도)는 위반이 아니다
    found = {(r.lot_id, r.from_step, r.to_step) for r in segq[segq.violated].itertuples()}
    want = set(truth["violations"])
    assert found == want, (sorted(found - want), sorted(want - found))
    b = segq[(segq.lot_id == truth["boundary"][0]) & (segq.from_step == "ETCH") & (segq.to_step == "CLEAN")]
    assert (b["wait_h"] == 4.0).all() and not b["violated"].any()
    # (2) 판다스 구간 계산 == 순수 파이썬 순회 계산 (모든 구간 대기, 오차 0)
    ref = ref_segments_loop(h)
    mine = {}
    for r in seg.itertuples():
        mine.setdefault((r.lot_id, r.from_step, r.to_step), []).append(r.wait_h)
    assert mine.keys() == ref.keys() and all(np.allclose(sorted(mine[k]), sorted(ref[k]), atol=1e-9, rtol=0) for k in ref)
    # (3) 사이클타임 분해: 모든 로트에서 CT = Σ처리 + Σ대기 (재작업 로트 포함)
    assert ct["residual_h"].abs().max() < 1e-9, ct["residual_h"].abs().max()
    assert set(ct.index[ct["rework_n"] > 0]) == truth["rework_lots"]
    # (4) 원인 겹침 조인이 심어 둔 원인과 16건 모두 일치 (미식별 4건 포함)
    got = {(r.lot_id, r.from_step, r.to_step): r.cause for r in viol.itertuples()}
    assert got == truth["violations"], {k: (got.get(k), truth["violations"].get(k)) for k in got if got.get(k) != truth["violations"].get(k)}
    # (5) 리틀의 법칙 — 전 구간 정확 항등식, 정상상태 창 허용 오차, 결함 데이터는 못 통과
    iv = lot_intervals(h)
    T0, T1 = iv["first_in"].min(), iv["last_out"].max()
    full = littles_law(h, T0, T1 + pd.Timedelta(seconds=1))
    assert abs(full["L_pred"] - full["L_overlap"]) < 1e-9 and abs(full["L_sweep"] - full["L_overlap"]) < 1e-6, full
    w0, w1 = T0 + pd.Timedelta(days=20), T0 + pd.Timedelta(days=55)
    ll = littles_law(h, w0, w1, wip_ref=wip_snapshot_mean(iv, w0, w1))
    print(f"\n[리틀의 법칙, 창 35일] λ={ll['lambda_per_h']:.4f}/h  W={ll['W_h']:.1f}h  λW={ll['L_pred']:.1f}  "
          f"스냅샷 WIP={ll['L_ref']:.1f}  상대오차 {ll['rel_err']:.3%}")
    assert abs(ll["L_overlap"] - ll["L_sweep"]) < 1e-6
    assert ll["rel_err"] < 0.05, ll
    lots = sorted(h.lot_id.unique())
    cut = set(np.random.default_rng(3).choice(lots, size=len(lots) * 3 // 10, replace=False))   # 결함: 30% 로트의 마지막 2개 이벤트 누락
    hb = h.sort_values(["lot_id", "track_in"]).copy()
    drop = hb[hb.lot_id.isin(cut)].groupby("lot_id").tail(2).index
    hb = hb.drop(index=drop)
    bad = littles_law(hb, w0, w1, wip_ref=ll["L_ref"])
    print(f"[결함 데이터(30% 로트 마지막 2이벤트 누락)] λW={bad['L_pred']:.1f}  스냅샷 WIP={bad['L_ref']:.1f}  상대오차 {bad['rel_err']:.3%}")
    assert bad["rel_err"] > 0.05 and bad["rel_err"] > 2 * ll["rel_err"], bad
    # (6) 분할·병합 잇기 손계산: C1 2h, C2 4h, M 3h(마지막으로 끝난 부모 P2 기준)
    hh, lin = hand_stitch_cases()
    sg = build_segments(stitch_lineage(hh, lin))
    w = {r.lot_id: r.wait_h for r in sg.itertuples() if r.lot_id in ("C1", "C2", "M")}
    assert w == {"C1": 2.0, "C2": 4.0, "M": 3.0}, w
    assert not (build_segments(hh).lot_id.isin(["C1", "C2", "M"])).any()    # 잇기 전에는 이 구간이 아예 없다
    # (7) 데이터 점검이 심은 결함을 센다
    h2 = pd.concat([h, h.iloc[[0]]], ignore_index=True)   # 완전 중복 1행
    h2.loc[1, "track_out"] = h2.loc[1, "track_in"] - pd.Timedelta(minutes=5)   # 처리 시간 음수 1행
    d2 = data_quality(h2)
    assert d2["duplicate_rows"] == 1 and d2["neg_proc_rows"] == 1, d2
    print(f"\nHARD CHECK OK: 위반 {len(want)}건 정확 검출(경계 4.0h 제외)·원인 {len(got)}건 일치·CT 잔차 0·리틀 오차 {ll['rel_err']:.2%}(결함 {bad['rel_err']:.1%})·분할병합 손계산 일치")
