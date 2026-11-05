import importlib.util
from pathlib import Path
import pytest
spec = importlib.util.spec_from_file_location("compare_outputs", Path(__file__).with_name("compare.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def test_equal_score_can_hide_regression():
    result = m.compare({"a": 1, "b": 2}, {"a": 0, "b": 2}, {"a": 1, "b": 0})
    assert result["accuracy_delta_percentage_points"] == 0
    assert result["regressions"] == ["b"]
    assert result["improvements"] == ["a"]


def test_missing_cases_rejected():
    with pytest.raises(ValueError):
        m.compare({"a": 1}, {"a": 1}, {})


def test_boolean_not_number():
    assert m.compare({"a": True}, {"a": 1}, {"a": True})["baseline_correct"] == 0


@pytest.mark.parametrize("raw", ['[]', '[{"id":"a","value":1},{"id":"a","value":2}]', '[{"id":"a","value":NaN}]'])
def test_invalid_input(tmp_path, raw):
    path = tmp_path / "cases.json"
    path.write_text(raw)
    with pytest.raises(ValueError):
        m.read_cases(path)
