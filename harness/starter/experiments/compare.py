"""Compare two outputs on the same labeled cases; no external calls."""
import argparse
import json
from pathlib import Path


def read_cases(path):
    rows = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(rows, list) or not rows:
        raise ValueError("cases must be a nonempty JSON array")
    result = {}
    for row in rows:
        if not isinstance(row, dict) or set(row) != {"id", "value"}:
            raise ValueError("each case must contain exactly id and value")
        key = row["id"]
        if not isinstance(key, str) or not key.strip() or key in result:
            raise ValueError("case ids must be unique nonempty strings")
        # Strict JSON values: NaN/Infinity must not silently pass as labels.
        json.dumps(row["value"], allow_nan=False)
        result[key] = row["value"]
    return result


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def compare(truth, baseline, candidate):
    if set(truth) != set(baseline) or set(truth) != set(candidate):
        raise ValueError("all three files must have identical case ids; missing cases cannot be dropped")
    rows = []
    for key, expected in truth.items():
        rows.append({"id": key, "expected": expected, "baseline": baseline[key], "candidate": candidate[key],
                     "baseline_correct": canonical(expected) == canonical(baseline[key]),
                     "candidate_correct": canonical(expected) == canonical(candidate[key])})
    count = len(rows)
    a = sum(r["baseline_correct"] for r in rows)
    b = sum(r["candidate_correct"] for r in rows)
    return {"method": "paired offline exact-match comparison; not randomized A/B or causal evidence",
            "cases": count, "baseline_correct": a, "candidate_correct": b,
            "accuracy_delta_percentage_points": 100 * (b - a) / count,
            "regressions": [r["id"] for r in rows if r["baseline_correct"] and not r["candidate_correct"]],
            "improvements": [r["id"] for r in rows if not r["baseline_correct"] and r["candidate_correct"]],
            "details": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("truth")
    parser.add_argument("baseline")
    parser.add_argument("candidate")
    args = parser.parse_args()
    try:
        report = compare(*(read_cases(p) for p in (args.truth, args.baseline, args.candidate)))
    except (ValueError, OSError) as error:
        parser.exit(2, f"invalid comparison: {error}\n")
    print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
