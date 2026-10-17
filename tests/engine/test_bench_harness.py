"""tests/engine/test_bench_harness.py — Unit tests for benchmark harness components.

Tests:
  T1  span_overlap() — IoU threshold logic
  T2  compute_entity_metrics() — TP/FP/FN counts with known cases
  T3  wilson_ci() — confidence interval bounds
  T4  percentile() — p50/p95 from known lists
  T5  is_required_retained() — span retention detection
  T6  is_sensitive_removed() — sensitive span removal detection
  T7  compute_flagged_metrics() — flagged-item precision/recall/FPR/combo_recall
  T8  hash-mismatch refusal — _verify_hashes raises on mismatch
  T9  dirty-tree refusal — test split requires clean git tree
  T10 test_file_not_opened — dev run never opens test.jsonl
  T11 log_append — _append_test_run_log appends exactly one line

All synthetic data. No real personal data (AGENTS.md Rule 10).
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch

import pytest

# ─── Path setup ───────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
BENCH_DIR = PROJECT_ROOT / "bench"
if str(PROJECT_ROOT / "engine") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "engine"))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from bench.metrics import (
    compute_decision_accuracy,
    compute_entity_metrics,
    compute_flagged_metrics,
    is_required_retained,
    is_sensitive_removed,
    percentile,
    span_overlap,
    wilson_ci,
)


# ─── T1: span_overlap ─────────────────────────────────────────────────────────

class TestSpanOverlap:
    def test_exact_match(self):
        assert span_overlap(0, 10, 0, 10) == pytest.approx(1.0)

    def test_no_overlap(self):
        assert span_overlap(0, 5, 5, 10) == pytest.approx(0.0)

    def test_partial_over_half(self):
        # pred=[0,8], gold=[5,10] → overlap=3, gold_len=5 → 3/5 = 0.6
        assert span_overlap(0, 8, 5, 10) == pytest.approx(0.6)

    def test_partial_under_half(self):
        # pred=[0,6], gold=[5,10] → overlap=1, gold_len=5 → 1/5 = 0.2
        assert span_overlap(0, 6, 5, 10) == pytest.approx(0.2)

    def test_zero_gold_length(self):
        assert span_overlap(0, 5, 3, 3) == pytest.approx(0.0)

    def test_pred_contains_gold(self):
        # pred=[0,20], gold=[5,10] → overlap=5, gold_len=5 → 1.0
        assert span_overlap(0, 20, 5, 10) == pytest.approx(1.0)


# ─── T2: compute_entity_metrics ───────────────────────────────────────────────

class TestComputeEntityMetrics:
    def test_perfect_match(self):
        preds = [{"start": 0, "end": 10, "group": "PERSON"}]
        gold = [{"start": 0, "end": 10, "group": "PERSON"}]
        r = compute_entity_metrics(preds, gold)
        assert r["tp"] == 1
        assert r["fp"] == 0
        assert r["fn"] == 0
        assert r["precision"] == pytest.approx(1.0)
        assert r["recall"] == pytest.approx(1.0)
        assert r["f1"] == pytest.approx(1.0)

    def test_false_positive_wrong_group(self):
        preds = [{"start": 0, "end": 10, "group": "PHONE"}]
        gold = [{"start": 0, "end": 10, "group": "PERSON"}]
        r = compute_entity_metrics(preds, gold)
        assert r["tp"] == 0
        assert r["fp"] == 1
        assert r["fn"] == 1

    def test_false_negative_no_prediction(self):
        preds: list = []
        gold = [{"start": 0, "end": 10, "group": "PERSON"}]
        r = compute_entity_metrics(preds, gold)
        assert r["tp"] == 0
        assert r["fp"] == 0
        assert r["fn"] == 1
        assert r["recall"] == pytest.approx(0.0)

    def test_both_empty(self):
        r = compute_entity_metrics([], [])
        assert r["tp"] == 0
        assert r["fp"] == 0
        assert r["fn"] == 0
        # Precision and recall are 0/0 → 0.0
        assert r["precision"] == pytest.approx(0.0)
        assert r["f1"] == pytest.approx(0.0)

    def test_overlap_threshold_pass(self):
        # 60% overlap — should match
        preds = [{"start": 0, "end": 8, "group": "PERSON"}]
        gold = [{"start": 2, "end": 12, "group": "PERSON"}]  # gold_len=10, overlap=6 → 0.6
        r = compute_entity_metrics(preds, gold)
        assert r["tp"] == 1

    def test_overlap_threshold_fail(self):
        # 30% overlap — should not match
        preds = [{"start": 0, "end": 5, "group": "PERSON"}]
        gold = [{"start": 3, "end": 13, "group": "PERSON"}]  # gold_len=10, overlap=2 → 0.2
        r = compute_entity_metrics(preds, gold)
        assert r["tp"] == 0
        assert r["fp"] == 1
        assert r["fn"] == 1

    def test_gold_matched_at_most_once(self):
        # Two predictions match the same gold span — only first counts as TP
        preds = [
            {"start": 0, "end": 10, "group": "PERSON"},
            {"start": 0, "end": 10, "group": "PERSON"},
        ]
        gold = [{"start": 0, "end": 10, "group": "PERSON"}]
        r = compute_entity_metrics(preds, gold)
        assert r["tp"] == 1
        assert r["fp"] == 1

    def test_per_group_breakdown(self):
        preds = [
            {"start": 0, "end": 5, "group": "PERSON"},
            {"start": 10, "end": 20, "group": "PHONE"},
        ]
        gold = [
            {"start": 0, "end": 5, "group": "PERSON"},
            {"start": 30, "end": 40, "group": "PHONE"},
        ]
        r = compute_entity_metrics(preds, gold)
        assert r["tp"] == 1
        assert r["fp"] == 1
        assert r["fn"] == 1
        assert r["per_group"]["PERSON"]["tp"] == 1
        assert r["per_group"]["PHONE"]["fp"] == 1
        assert r["per_group"]["PHONE"]["fn"] == 1


# ─── T3: wilson_ci ────────────────────────────────────────────────────────────

class TestWilsonCI:
    def test_n_zero(self):
        lo, hi = wilson_ci(0, 0)
        assert lo == 0.0
        assert hi == 1.0

    def test_all_success(self):
        lo, hi = wilson_ci(100, 100)
        assert lo > 0.95
        assert hi == pytest.approx(1.0, abs=0.01)

    def test_all_failure(self):
        lo, hi = wilson_ci(0, 100)
        assert lo == pytest.approx(0.0, abs=0.01)
        assert hi < 0.05

    def test_half_success(self):
        lo, hi = wilson_ci(50, 100)
        assert lo < 0.5
        assert hi > 0.5

    def test_bounds_in_zero_one(self):
        for k, n in [(0, 1), (1, 1), (5, 10), (99, 100)]:
            lo, hi = wilson_ci(k, n)
            assert 0.0 <= lo <= 1.0
            assert 0.0 <= hi <= 1.0
            assert lo <= hi


# ─── T4: percentile ───────────────────────────────────────────────────────────

class TestPercentile:
    def test_empty(self):
        assert percentile([], 50) == 0.0

    def test_single_element(self):
        assert percentile([42.0], 50) == 42.0
        assert percentile([42.0], 95) == 42.0

    def test_known_p50(self):
        values = [1.0, 2.0, 3.0, 4.0, 5.0]
        assert percentile(values, 50) == 3.0

    def test_known_p95(self):
        values = list(range(1, 101))  # 1..100
        p95 = percentile([float(v) for v in values], 95)
        assert p95 == 95.0

    def test_unsorted_input(self):
        values = [5.0, 1.0, 3.0, 2.0, 4.0]
        assert percentile(values, 50) == 3.0


# ─── T5: is_required_retained ─────────────────────────────────────────────────

class TestRequiredRetained:
    _TEXT = "Analyze revenue Q1 Rs.50000, Q2 Rs.75000 for trends."

    def test_all_retained(self):
        original = self._TEXT
        sanitized = original  # unchanged
        spans = [
            {"start": 20, "end": 29},  # "Rs.50000"
            {"start": 31, "end": 40},  # "Rs.75000"
        ]
        # Recompute from actual positions
        spans = [
            {"start": original.find("Rs.50000"), "end": original.find("Rs.50000") + len("Rs.50000")},
            {"start": original.find("Rs.75000"), "end": original.find("Rs.75000") + len("Rs.75000")},
        ]
        retained, total = is_required_retained(sanitized, spans, original)
        assert retained == 2
        assert total == 2

    def test_some_removed(self):
        original = self._TEXT
        sanitized = "Analyze revenue Q1 [REDACTED], Q2 Rs.75000 for trends."
        spans = [
            {"start": original.find("Rs.50000"), "end": original.find("Rs.50000") + len("Rs.50000")},
            {"start": original.find("Rs.75000"), "end": original.find("Rs.75000") + len("Rs.75000")},
        ]
        retained, total = is_required_retained(sanitized, spans, original)
        assert retained == 1
        assert total == 2

    def test_empty_spans(self):
        retained, total = is_required_retained("any text", [], "any text")
        assert retained == 0
        assert total == 0


# ─── T6: is_sensitive_removed ─────────────────────────────────────────────────

class TestSensitiveRemoved:
    def test_entity_present_in_sanitized(self):
        original = "Call John Smith at 9876543210."
        sanitized = "Call John Smith at 9876543210."  # not sanitized
        gold = [{"start": 5, "end": 15, "group": "PERSON"}]  # "John Smith"
        removed, total = is_sensitive_removed(sanitized, gold, original)
        assert removed == 0

    def test_entity_removed(self):
        original = "Call John Smith at 9876543210."
        sanitized = "Call [PERSON_1] at [PHONE_1]."
        gold = [{"start": original.find("9876543210"),
                 "end": original.find("9876543210") + len("9876543210"),
                 "group": "PHONE"}]
        removed, total = is_sensitive_removed(sanitized, gold, original)
        assert removed == 1

    def test_empty_entities(self):
        removed, total = is_sensitive_removed("any text", [], "any text")
        assert removed == 0
        assert total == 0


# ─── T7: compute_flagged_metrics ──────────────────────────────────────────────

class TestFlaggedMetrics:
    def test_all_correct(self):
        sf = [True, True, False, False]
        gf = [True, True, False, False]
        cr = [False, False, False, False]
        r = compute_flagged_metrics(sf, gf, cr)
        assert r["tp"] == 2
        assert r["fp"] == 0
        assert r["fn"] == 0
        assert r["precision"] == pytest.approx(1.0)
        assert r["recall"] == pytest.approx(1.0)

    def test_false_positive(self):
        sf = [True, True]
        gf = [True, False]
        cr = [False, False]
        r = compute_flagged_metrics(sf, gf, cr)
        assert r["tp"] == 1
        assert r["fp"] == 1
        assert r["fn"] == 0
        assert r["fpr"] == pytest.approx(1.0)

    def test_combo_risk_recall(self):
        sf = [True, False, True, False]
        gf = [True, True, True, True]
        cr = [True, True, False, False]
        r = compute_flagged_metrics(sf, gf, cr)
        # combo items: indices 0 and 1; flagged: only index 0
        assert r["combo_total"] == 2
        assert r["combo_flagged"] == 1
        assert r["combo_risk_recall"] == pytest.approx(0.5)

    def test_no_combo_items(self):
        sf = [True, False]
        gf = [True, True]
        cr = [False, False]
        r = compute_flagged_metrics(sf, gf, cr)
        assert r["combo_total"] == 0
        assert r["combo_risk_recall"] == pytest.approx(0.0)


# ─── T8: hash-mismatch refusal ────────────────────────────────────────────────

class TestHashMismatch:
    def test_raises_on_hash_mismatch(self, tmp_path):
        # Write a file with one content
        data_path = tmp_path / "test.jsonl"
        data_path.write_text('{"id": "x1", "text": "hello"}\n', encoding="utf-8")

        real_hash = hashlib.sha256(data_path.read_bytes()).hexdigest()
        bad_hash = "0" * 64  # wrong hash

        manifest = {
            "splits": {
                "test": {"sha256": bad_hash},
                "dev": {"sha256": real_hash},
            }
        }

        # Import and call directly
        from bench.run_benchmark import _verify_hashes

        # Patch BENCH_DATA to point to tmp_path
        import bench.run_benchmark as runner_mod
        original = runner_mod.BENCH_DATA
        try:
            runner_mod.BENCH_DATA = tmp_path
            with pytest.raises(RuntimeError, match="Hash mismatch"):
                _verify_hashes("test", manifest)
        finally:
            runner_mod.BENCH_DATA = original

    def test_passes_on_correct_hash(self, tmp_path):
        data_path = tmp_path / "dev.jsonl"
        data_path.write_text('{"id": "x1"}\n', encoding="utf-8")
        correct_hash = hashlib.sha256(data_path.read_bytes()).hexdigest()
        manifest = {"splits": {"dev": {"sha256": correct_hash}}}

        from bench.run_benchmark import _verify_hashes
        import bench.run_benchmark as runner_mod
        original = runner_mod.BENCH_DATA
        try:
            runner_mod.BENCH_DATA = tmp_path
            _verify_hashes("dev", manifest)  # Should not raise
        finally:
            runner_mod.BENCH_DATA = original


# ─── T9: dirty-tree refusal ───────────────────────────────────────────────────

class TestDirtyTreeRefusal:
    def test_test_split_requires_clean_tree(self, tmp_path):
        """run_benchmark with split=test should abort if git tree is dirty."""
        # Mock _git_is_clean to return False
        import bench.run_benchmark as runner_mod
        with patch.object(runner_mod, "_git_is_clean", return_value=False):
            with pytest.raises(RuntimeError, match="Working tree is not clean"):
                runner_mod.run_benchmark(
                    split="test",
                    system_names=["keyword"],
                    confirm_frozen=True,
                )

    def test_test_split_requires_confirm_frozen(self):
        """run_benchmark with split=test and no --confirm-frozen should abort."""
        import bench.run_benchmark as runner_mod
        with pytest.raises(RuntimeError, match="confirm-frozen"):
            runner_mod.run_benchmark(
                split="test",
                system_names=["keyword"],
                confirm_frozen=False,
            )


# ─── T10: dev run never opens test file ──────────────────────────────────────

class TestDevRunNeverOpensTestFile:
    def test_dev_run_does_not_open_test_jsonl(self, tmp_path):
        """Verify that a dev run never reads the test.jsonl file content."""
        import bench.run_benchmark as runner_mod

        opened_paths = []
        real_open = open

        def tracked_open(path, *args, **kwargs):
            p = str(path)
            if "test.jsonl" in p and "w" not in str(args):
                opened_paths.append(p)
            return real_open(path, *args, **kwargs)

        # Use a minimal mock that skips actual system loading
        with patch("builtins.open", side_effect=tracked_open):
            with patch.object(runner_mod, "_build_systems", return_value={}):
                with patch.object(runner_mod, "_load_manifest", return_value={
                    "version": "v1",
                    "splits": {
                        "dev": {"count": 0, "sha256": "abc", "categories": {}},
                        "test": {"count": 0, "sha256": "def", "categories": {}},
                    },
                }):
                    with patch.object(runner_mod, "_load_split", return_value=[]):
                        runner_mod.run_benchmark(
                            split="dev",
                            system_names=[],
                            confirm_frozen=False,
                        )

        test_opens = [p for p in opened_paths if "test.jsonl" in p]
        assert test_opens == [], f"test.jsonl was opened during dev run: {test_opens}"


# ─── T11: log_append ─────────────────────────────────────────────────────────

class TestLogAppend:
    def test_appends_one_line_per_run(self, tmp_path):
        """_append_test_run_log appends exactly one JSON line per call."""
        import bench.run_benchmark as runner_mod
        orig_results_dir = runner_mod.BENCH_RESULTS
        try:
            runner_mod.BENCH_RESULTS = tmp_path
            results = {
                "meta": {
                    "commit": "abc1234",
                    "dev_sha256": "aaa",
                    "test_sha256": "bbb",
                    "n": 10,
                    "test_run_number": None,
                },
                "systems": {"keyword": {}},
            }
            manifest = {
                "splits": {
                    "dev": {"sha256": "aaa"},
                    "test": {"sha256": "bbb"},
                }
            }
            # First call
            runner_mod._append_test_run_log(results, manifest)
            log_path = tmp_path / "test_run_log.jsonl"
            lines = log_path.read_text(encoding="utf-8").strip().splitlines()
            assert len(lines) == 1
            entry = json.loads(lines[0])
            assert entry["run_number"] == 1

            # Second call
            runner_mod._append_test_run_log(results, manifest)
            lines = log_path.read_text(encoding="utf-8").strip().splitlines()
            assert len(lines) == 2
            entry2 = json.loads(lines[1])
            assert entry2["run_number"] == 2

        finally:
            runner_mod.BENCH_RESULTS = orig_results_dir
