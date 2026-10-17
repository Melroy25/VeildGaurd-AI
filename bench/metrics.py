"""bench/metrics.py — Benchmark evaluation metrics for VeilGuard AI.

Defines:
  span_match()         — 50% IoU overlap check (gold span basis)
  compute_entity_metrics() — TP/FP/FN + precision/recall/F1 (micro + per-category)
  wilson_ci()          — Wilson 95% confidence interval for proportions
  percentile()         — p50 / p95 latency from a list of float ms
  is_required_retained() — required_spans verbatim presence check
  is_sensitive_removed() — gold entity spans absent in sanitized text

All metrics are documented precisely in docs/BENCHMARK.md.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple


# ─── Span helpers ─────────────────────────────────────────────────────────────

def span_overlap(pred_start: int, pred_end: int, gold_start: int, gold_end: int) -> float:
    """Compute IoU of two spans on the gold span.

    Returns overlap_length / gold_length (i.e., recall-oriented overlap ratio).
    A predicted span matches a gold span if this value >= 0.5.
    """
    overlap_start = max(pred_start, gold_start)
    overlap_end = min(pred_end, gold_end)
    overlap_len = max(0, overlap_end - overlap_start)
    gold_len = gold_end - gold_start
    if gold_len == 0:
        return 0.0
    return overlap_len / gold_len


def span_exact(pred_start: int, pred_end: int, gold_start: int, gold_end: int) -> bool:
    """Return True if predicted span has exactly the same boundaries as gold."""
    return pred_start == gold_start and pred_end == gold_end


# ─── Entity-level metrics ─────────────────────────────────────────────────────

def compute_entity_metrics(
    predictions: List[Dict[str, Any]],   # [{start, end, group}]
    gold_entities: List[Dict[str, Any]],  # [{start, end, group}]
    iou_threshold: float = 0.5,
    strict_exact: bool = False,
) -> Dict[str, Any]:
    """Compute entity-level precision, recall, F1 with TP/FP/FN.

    Matching rules (per Phase 5 prompt §5.2):
    - A predicted span matches a gold span if entity group matches AND
      overlap(pred, gold) >= iou_threshold (default 0.5) [OR exact boundary if strict].
    - Each gold span matched at most once.
    - Unmatched predictions are false positives.

    Returns dict with keys:
      tp, fp, fn, precision, recall, f1, per_group: {group: {tp,fp,fn,precision,recall,f1}}
    """
    matched_gold: set = set()
    tp = 0
    fp = 0
    per_group: Dict[str, Dict[str, int]] = {}

    def _group_counts(g: str) -> Dict[str, int]:
        if g not in per_group:
            per_group[g] = {"tp": 0, "fp": 0, "fn": 0}
        return per_group[g]

    for pred in predictions:
        pg = pred.get("group", "")
        matched = False
        for idx, gold in enumerate(gold_entities):
            if idx in matched_gold:
                continue
            if gold.get("group", "") != pg:
                continue
            if strict_exact:
                ok = span_exact(pred["start"], pred["end"], gold["start"], gold["end"])
            else:
                ok = span_overlap(pred["start"], pred["end"], gold["start"], gold["end"]) >= iou_threshold
            if ok:
                matched_gold.add(idx)
                matched = True
                break
        if matched:
            tp += 1
            _group_counts(pg)["tp"] += 1
        else:
            fp += 1
            _group_counts(pg)["fp"] += 1

    fn = 0
    for idx, gold in enumerate(gold_entities):
        if idx not in matched_gold:
            fn += 1
            _group_counts(gold.get("group", ""))["fn"] += 1

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

    for g, c in per_group.items():
        p = c["tp"] / (c["tp"] + c["fp"]) if (c["tp"] + c["fp"]) > 0 else 0.0
        r = c["tp"] / (c["tp"] + c["fn"]) if (c["tp"] + c["fn"]) > 0 else 0.0
        c["precision"] = p
        c["recall"] = r
        c["f1"] = (2 * p * r / (p + r)) if (p + r) > 0 else 0.0

    return {
        "tp": tp, "fp": fp, "fn": fn,
        "precision": precision, "recall": recall, "f1": f1,
        "per_group": per_group,
    }


# ─── Wilson confidence interval ───────────────────────────────────────────────

def wilson_ci(k: int, n: int, z: float = 1.96) -> Tuple[float, float]:
    """Compute Wilson score 95% confidence interval for a proportion k/n.

    Returns (lower, upper) in [0, 1].
    If n == 0, returns (0.0, 1.0) — maximally uncertain.
    """
    if n == 0:
        return (0.0, 1.0)
    p_hat = k / n
    center = (p_hat + z * z / (2 * n)) / (1 + z * z / n)
    margin = z * math.sqrt((p_hat * (1 - p_hat) + z * z / (4 * n)) / n) / (1 + z * z / n)
    return (max(0.0, center - margin), min(1.0, center + margin))


# ─── Latency percentiles ──────────────────────────────────────────────────────

def percentile(values: List[float], p: float) -> float:
    """Compute p-th percentile from a list of floats.

    Uses nearest-rank method. Returns 0.0 if list is empty.
    """
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = max(0, int(math.ceil(p / 100.0 * len(sorted_vals))) - 1)
    return sorted_vals[idx]


# ─── Utility metrics ─────────────────────────────────────────────────────────

def is_required_retained(
    sanitized_text: str,
    required_spans: List[Dict[str, Any]],
    original_text: str,
) -> Tuple[int, int]:
    """Return (retained_count, total_count) of required_spans present verbatim.

    A required span is retained if its original substring still appears in
    sanitized_text. State that retention does not prove an AI would answer identically.
    """
    total = len(required_spans)
    retained = 0
    for span in required_spans:
        original_value = original_text[span["start"]:span["end"]]
        if original_value and original_value in sanitized_text:
            retained += 1
    return retained, total


def is_sensitive_removed(
    sanitized_text: str,
    gold_entities: List[Dict[str, Any]],
    original_text: str,
) -> Tuple[int, int]:
    """Return (removed_count, total_count) of gold entity spans absent in sanitized_text.

    Considers a gold span removed if its verbatim substring does NOT appear
    in sanitized_text.
    """
    total = len(gold_entities)
    removed = 0
    for ent in gold_entities:
        original_value = original_text[ent["start"]:ent["end"]]
        if original_value and original_value not in sanitized_text:
            removed += 1
    return removed, total


# ─── Flagged-item metrics ─────────────────────────────────────────────────────

def compute_flagged_metrics(
    system_flagged: List[bool],      # True if system flagged this item
    gold_flagged: List[bool],        # True if expected_decision != "allow"
    combo_risk: List[bool],          # True if combo_risk == true
) -> Dict[str, Any]:
    """Compute flagged-item precision, recall, FPR, and combo_risk_recall.

    An item is a "positive" if gold_flagged is True.
    system_flagged is the system's prediction.
    """
    assert len(system_flagged) == len(gold_flagged) == len(combo_risk)
    n = len(system_flagged)
    tp = fp = fn = tn = 0
    combo_flagged = combo_total = 0

    for sf, gf, cr in zip(system_flagged, gold_flagged, combo_risk):
        if gf and sf:
            tp += 1
        elif not gf and sf:
            fp += 1
        elif gf and not sf:
            fn += 1
        else:
            tn += 1
        if cr:
            combo_total += 1
            if sf:
                combo_flagged += 1

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    combo_recall = combo_flagged / combo_total if combo_total > 0 else 0.0

    return {
        "n": n,
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "precision": precision, "recall": recall, "f1": f1, "fpr": fpr,
        "combo_risk_recall": combo_recall,
        "combo_total": combo_total,
        "combo_flagged": combo_flagged,
    }


# ─── Decision accuracy (VeilGuard only) ──────────────────────────────────────

DECISION_CLASSES = ["allow", "redact", "require_approval", "block"]


def compute_decision_accuracy(
    predictions: List[str],  # predicted decisions
    gold: List[str],          # expected decisions
) -> Dict[str, Any]:
    """Four-class decision accuracy and confusion matrix for VeilGuard variants."""
    assert len(predictions) == len(gold)
    n = len(predictions)
    correct = sum(p == g for p, g in zip(predictions, gold))
    accuracy = correct / n if n > 0 else 0.0

    # Confusion matrix: rows=gold, cols=pred
    matrix: Dict[str, Dict[str, int]] = {
        c: {d: 0 for d in DECISION_CLASSES} for c in DECISION_CLASSES
    }
    for pred, g in zip(predictions, gold):
        g_key = g if g in DECISION_CLASSES else "allow"
        p_key = pred if pred in DECISION_CLASSES else "allow"
        matrix[g_key][p_key] += 1

    return {
        "n": n,
        "correct": correct,
        "accuracy": accuracy,
        "confusion_matrix": matrix,
    }
