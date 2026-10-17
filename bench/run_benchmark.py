"""bench/run_benchmark.py — VeilGuard AI benchmark runner.

Usage:
  python -m bench.run_benchmark --split dev --systems all
  python -m bench.run_benchmark --split test --confirm-frozen --systems all

Integrity:
  --split test requires --confirm-frozen, verifies SHA-256 hashes against
  MANIFEST.json, requires a clean git tree, and appends one line to
  bench/results/test_run_log.jsonl.

Never opens the test file content for analysis during Parts B and C;
only opens it when explicitly running the benchmark with --split test.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

# ─── Path setup ───────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BENCH_DATA = PROJECT_ROOT / "bench" / "data"
BENCH_RESULTS = PROJECT_ROOT / "bench" / "results"
ENGINE_PATH = PROJECT_ROOT / "engine"
if str(ENGINE_PATH) not in sys.path:
    sys.path.insert(0, str(ENGINE_PATH))


# ─── Metrics ──────────────────────────────────────────────────────────────────
from bench.metrics import (
    compute_decision_accuracy,
    compute_entity_metrics,
    compute_flagged_metrics,
    is_required_retained,
    is_sensitive_removed,
    percentile,
    wilson_ci,
)


# ─── Integrity helpers ────────────────────────────────────────────────────────

def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _git_is_clean() -> bool:
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, cwd=str(PROJECT_ROOT),
        )
        return result.returncode == 0 and result.stdout.strip() == ""
    except Exception:
        return False


def _git_commit() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, cwd=str(PROJECT_ROOT),
        )
        return result.stdout.strip()
    except Exception:
        return "unknown"


def _load_manifest() -> Dict[str, Any]:
    manifest_path = BENCH_DATA / "MANIFEST.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"MANIFEST.json not found at {manifest_path}")
    with open(manifest_path, encoding="utf-8") as f:
        return json.load(f)


def _verify_hashes(split: str, manifest: Dict[str, Any]) -> None:
    """Verify that the on-disk split file matches the manifest SHA-256."""
    split_path = BENCH_DATA / f"{split}.jsonl"
    if not split_path.exists():
        raise FileNotFoundError(f"{split}.jsonl not found")
    actual_hash = _sha256_file(split_path)
    expected_hash = manifest["splits"][split]["sha256"]
    if actual_hash != expected_hash:
        raise RuntimeError(
            f"Hash mismatch for {split}.jsonl!\n"
            f"  Expected: {expected_hash}\n"
            f"  Actual:   {actual_hash}\n"
            "The dataset file has been modified. Aborting."
        )


# ─── Dataset loader ───────────────────────────────────────────────────────────

def _load_split(split: str) -> List[Dict[str, Any]]:
    path = BENCH_DATA / f"{split}.jsonl"
    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


# ─── System registry ──────────────────────────────────────────────────────────

def _build_systems(system_names: List[str]) -> Dict[str, Any]:
    """Lazily import and instantiate benchmark systems."""
    from bench.baselines.keyword import KeywordBaseline
    from bench.baselines.presidio_baselines import PresidioDefault, PresidioAllStock
    from bench.baselines.veilguard_baselines import VeilGuardTypeBased, VeilGuardFull

    all_systems = {
        "keyword": KeywordBaseline,
        "presidio_default": PresidioDefault,
        "presidio_all_stock": PresidioAllStock,
        "veilguard_type_based": VeilGuardTypeBased,
        "veilguard_full": VeilGuardFull,
    }

    if "all" in system_names:
        system_names = list(all_systems.keys())

    instances: Dict[str, Any] = {}
    for name in system_names:
        if name not in all_systems:
            raise ValueError(f"Unknown system: {name!r}. Choose from: {list(all_systems)}")
        print(f"  Loading {name}...")
        instances[name] = all_systems[name]()
    return instances


# ─── Per-system evaluation ────────────────────────────────────────────────────

_ENTITY_GROUP_MAP = {
    # keyword baseline rules → benchmark groups
    "R01_MOBILE": "PHONE", "R02_EMAIL": "EMAIL", "R11_UPI": "FINANCIAL_ACCOUNT",
    "R03_12DIGIT": "GOV_ID", "R04_PAN": "GOV_ID",
    "R05_CARD": "FINANCIAL_ACCOUNT", "R06_SECRET_KW": "SECRET",
    "R07_AWS_KEY": "SECRET", "R07_GITHUB_TOKEN": "SECRET",
    "R07_STRIPE_KEY": "SECRET", "R07_SLACK_TOKEN": "SECRET",
    "R07_GOOGLE_KEY": "SECRET", "R07_CONNECTION_STR": "SECRET",
    "R07_JWT": "SECRET", "R08_CONFIDENTIAL": "CONFIDENTIAL",
    "R09_MEDICAL": "MEDICAL", "R10_IFSC": "FINANCIAL_ACCOUNT",
    # Presidio entity types → benchmark groups
    "PERSON": "PERSON", "PHONE_NUMBER": "PHONE", "EMAIL_ADDRESS": "EMAIL",
    "EMAIL": "EMAIL", "IN_MOBILE": "PHONE", "IN_AADHAAR": "GOV_ID",
    "IN_PAN": "GOV_ID", "IN_GSTIN": "GOV_ID", "US_SSN": "GOV_ID",
    "CREDIT_CARD": "FINANCIAL_ACCOUNT", "IN_BANK_ACCOUNT": "FINANCIAL_ACCOUNT",
    "IBAN_CODE": "FINANCIAL_ACCOUNT", "UPI_ID": "FINANCIAL_ACCOUNT",
    "IN_IFSC": "FINANCIAL_ACCOUNT", "API_KEY": "SECRET",
    "AWS_ACCESS_KEY": "SECRET", "GITHUB_TOKEN": "SECRET",
    "SLACK_TOKEN": "SECRET", "GOOGLE_API_KEY": "SECRET",
    "STRIPE_KEY": "SECRET", "JWT_TOKEN": "SECRET",
    "PRIVATE_KEY": "SECRET", "CONNECTION_STRING": "SECRET",
    "GENERIC_SECRET": "SECRET", "WATCHLIST_TERM": "CONFIDENTIAL",
    "CONFIDENTIAL_TERM": "CONFIDENTIAL", "MEDICAL_LICENSE": "MEDICAL",
    "MEDICAL_CONDITION": "MEDICAL", "MEDICATION": "MEDICAL",
    "MEDICAL_PROCEDURE": "MEDICAL",
    # VeilGuard quasi (Phase 5)
    "QUASI_AGE": "QUASI", "QUASI_ROLE": "QUASI", "QUASI_ORG": "QUASI",
    "QUASI_LOCATION": "QUASI", "QUASI_EVENT": "QUASI", "QUASI_GENDER": "QUASI",
}


def _normalize_group(raw_group: str) -> str:
    return _ENTITY_GROUP_MAP.get(raw_group, raw_group)


def _get_system_predictions(system: Any, record: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Run system detection and return list of {start, end, group} dicts."""
    text = record["text"]
    from bench.baselines.keyword import KeywordBaseline
    from bench.baselines.presidio_baselines import _PresidioBase
    from bench.baselines.veilguard_baselines import _VeilGuardBase

    if isinstance(system, KeywordBaseline):
        findings = system.detect(text)
        return [
            {"start": f.start, "end": f.end, "group": _normalize_group(f.rule)}
            for f in findings
        ]
    elif isinstance(system, _PresidioBase):
        findings = system.detect(text)
        return [
            {"start": f.start, "end": f.end, "group": _normalize_group(f.entity_type)}
            for f in findings
        ]
    elif isinstance(system, _VeilGuardBase):
        # For VeilGuard, use the scanner directly for entity-level metrics
        scanner = system._scanner
        scan_result = scanner.scan(text)
        return [
            {
                "start": f.start, "end": f.end,
                "group": _normalize_group(f.entity_type),
            }
            for f in scan_result.findings
        ]
    else:
        return []


def _get_system_decision(system: Any, record: Dict[str, Any]) -> str:
    """Return the system's decision string for flagged-item metrics."""
    from bench.baselines.keyword import KeywordBaseline
    from bench.baselines.presidio_baselines import _PresidioBase
    from bench.baselines.veilguard_baselines import _VeilGuardBase

    text = record["text"]
    if isinstance(system, (KeywordBaseline, _PresidioBase)):
        flagged = system.is_flagged(text)
        return "redact" if flagged else "allow"
    elif isinstance(system, _VeilGuardBase):
        result = system.run(text)
        return result.decision
    return "allow"


def _get_sanitized(system: Any, text: str) -> str:
    """Return system-sanitized text."""
    return system.sanitize(text)


# ─── Latency measurement ──────────────────────────────────────────────────────

N_WARMUP = 5
N_PASSES = 3


def _measure_latency(system: Any, records: List[Dict[str, Any]]) -> List[float]:
    """Measure in-process latency (scan+policy+sanitize, not HTTP).

    3 passes over all records after 5 warmup calls. Returns list of per-item ms.
    """
    from bench.baselines.keyword import KeywordBaseline
    from bench.baselines.presidio_baselines import _PresidioBase
    from bench.baselines.veilguard_baselines import _VeilGuardBase

    texts = [r["text"] for r in records]

    def _time_one(text: str) -> float:
        t0 = time.perf_counter()
        system.sanitize(text)
        return (time.perf_counter() - t0) * 1000.0

    # Warmup
    for text in texts[:N_WARMUP]:
        _time_one(text)

    # Timed passes
    all_latencies: List[float] = []
    for _ in range(N_PASSES):
        for text in texts:
            all_latencies.append(_time_one(text))

    return all_latencies


# ─── Per-category aggregation ─────────────────────────────────────────────────

def _aggregate_by_category(
    records: List[Dict[str, Any]],
    all_predictions: List[List[Dict[str, Any]]],
    all_decisions: List[str],
    all_sanitized: List[str],
) -> Dict[str, Any]:
    """Group entity metrics and flagged metrics by category."""
    categories: Dict[str, Dict[str, Any]] = {}

    for rec, preds, decision, sanitized in zip(
        records, all_predictions, all_decisions, all_sanitized
    ):
        cat = rec["category"]
        if cat not in categories:
            categories[cat] = {
                "predictions": [], "gold_entities": [],
                "system_flagged": [], "gold_flagged": [],
                "combo_risk": [], "retained": [], "removed": [],
            }
        c = categories[cat]
        gold_ents = rec.get("expected_entities", [])
        c["predictions"].extend(preds)
        c["gold_entities"].extend(gold_ents)
        c["system_flagged"].append(decision != "allow")
        c["gold_flagged"].append(rec["expected_decision"] != "allow")
        c["combo_risk"].append(rec.get("combo_risk", False))

        ret, ret_total = is_required_retained(sanitized, rec.get("required_spans", []), rec["text"])
        rem, rem_total = is_sensitive_removed(sanitized, gold_ents, rec["text"])
        c["retained"].append((ret, ret_total))
        c["removed"].append((rem, rem_total))

    result: Dict[str, Any] = {}
    for cat, data in categories.items():
        em = compute_entity_metrics(data["predictions"], data["gold_entities"])
        fm = compute_flagged_metrics(data["system_flagged"], data["gold_flagged"], data["combo_risk"])
        total_ret = sum(t for _, t in data["retained"])
        kept_ret = sum(k for k, _ in data["retained"])
        total_rem = sum(t for _, t in data["removed"])
        removed_rem = sum(k for k, _ in data["removed"])
        n = len(data["system_flagged"])
        result[cat] = {
            "n": n,
            "entity_metrics": em,
            "flagged_metrics": fm,
            "utility": {
                "required_retained_count": kept_ret,
                "required_total": total_ret,
                "required_retained_rate": kept_ret / total_ret if total_ret > 0 else None,
                "sensitive_removed_count": removed_rem,
                "sensitive_total": total_rem,
                "sensitive_removed_rate": removed_rem / total_rem if total_rem > 0 else None,
            },
            "low_confidence": n < 20,
        }
    return result


# ─── Main benchmark function ───────────────────────────────────────────────────

def run_benchmark(
    split: str,
    system_names: List[str],
    confirm_frozen: bool = False,
) -> Dict[str, Any]:
    """Run all systems on the requested split, return results dict."""
    BENCH_RESULTS.mkdir(parents=True, exist_ok=True)

    # ── Integrity checks ───────────────────────────────────────────────────────
    manifest = _load_manifest()

    if split == "test":
        if not confirm_frozen:
            raise RuntimeError(
                "Running on the test split requires --confirm-frozen flag to "
                "acknowledge the frozen dataset constraint."
            )
        if not _git_is_clean():
            raise RuntimeError(
                "Working tree is not clean. Commit all changes before running "
                "benchmark on the test split."
            )
        print("Verifying test split hash...")
        _verify_hashes("test", manifest)
        print("  Hash verified OK.")
        # Also verify dev hash (should not have changed)
        _verify_hashes("dev", manifest)
        print("  Dev hash verified OK.")

    # ── Load data ──────────────────────────────────────────────────────────────
    print(f"Loading {split} split...")
    records = _load_split(split)
    print(f"  {len(records)} records loaded.")

    # ── Load systems ───────────────────────────────────────────────────────────
    print("Initialising systems...")
    systems = _build_systems(system_names)

    # ── Per-system evaluation ──────────────────────────────────────────────────
    commit = _git_commit()
    results: Dict[str, Any] = {
        "meta": {
            "split": split,
            "n": len(records),
            "commit": commit,
            "manifest_version": manifest.get("version", "v1"),
            "dev_sha256": manifest["splits"].get("dev", {}).get("sha256"),
            "test_sha256": manifest["splits"].get("test", {}).get("sha256"),
            "hardware": {
                "platform": platform.platform(),
                "python": platform.python_version(),
                "processor": platform.processor(),
            },
        },
        "systems": {},
    }

    for sys_name, system in systems.items():
        print(f"\nEvaluating {sys_name}...")

        all_predictions: List[List[Dict[str, Any]]] = []
        all_decisions: List[str] = []
        all_sanitized: List[str] = []

        for i, rec in enumerate(records):
            if i % 50 == 0:
                print(f"  [{i}/{len(records)}] ...", end="\r")
            preds = _get_system_predictions(system, rec)
            decision = _get_system_decision(system, rec)
            sanitized = _get_sanitized(system, rec["text"])
            all_predictions.append(preds)
            all_decisions.append(decision)
            all_sanitized.append(sanitized)

        print(f"  [{len(records)}/{len(records)}] done.")

        # Entity metrics (micro)
        all_preds_flat = [p for preds in all_predictions for p in preds]
        all_gold_flat = [e for rec in records for e in rec.get("expected_entities", [])]
        entity_metrics = compute_entity_metrics(all_preds_flat, all_gold_flat)
        entity_metrics_strict = compute_entity_metrics(
            all_preds_flat, all_gold_flat, strict_exact=True
        )

        # Flagged-item metrics
        system_flagged = [d != "allow" for d in all_decisions]
        gold_flagged = [r["expected_decision"] != "allow" for r in records]
        combo_risk = [r.get("combo_risk", False) for r in records]
        flagged_metrics = compute_flagged_metrics(system_flagged, gold_flagged, combo_risk)

        # Decision accuracy (VeilGuard variants only)
        decision_accuracy = None
        from bench.baselines.veilguard_baselines import _VeilGuardBase
        if isinstance(system, _VeilGuardBase):
            gold_decisions = [r["expected_decision"] for r in records]
            decision_accuracy = compute_decision_accuracy(all_decisions, gold_decisions)

        # Utility
        total_ret = total_ret_n = 0
        total_rem = total_rem_n = 0
        for rec, sanitized in zip(records, all_sanitized):
            ret, ret_n = is_required_retained(sanitized, rec.get("required_spans", []), rec["text"])
            rem, rem_n = is_sensitive_removed(sanitized, rec.get("expected_entities", []), rec["text"])
            total_ret += ret
            total_ret_n += ret_n
            total_rem += rem
            total_rem_n += rem_n

        utility = {
            "required_retained_rate": total_ret / total_ret_n if total_ret_n > 0 else None,
            "required_retained_count": total_ret,
            "required_total": total_ret_n,
            "sensitive_removed_rate": total_rem / total_rem_n if total_rem_n > 0 else None,
            "sensitive_removed_count": total_rem,
            "sensitive_total": total_rem_n,
            "note": "Retention rate does not prove an AI would answer identically.",
        }

        # Per-category breakdown
        cat_breakdown = _aggregate_by_category(
            records, all_predictions, all_decisions, all_sanitized
        )

        # Latency
        print(f"  Measuring latency ({N_PASSES} passes, {N_WARMUP} warmup)...")
        latencies = _measure_latency(system, records)
        latency = {
            "p50_ms": percentile(latencies, 50),
            "p95_ms": percentile(latencies, 95),
            "n_measurements": len(latencies),
            "passes": N_PASSES,
            "warmup_calls": N_WARMUP,
        }

        # Wilson CIs for top-level metrics
        def _wci(k: int, n: int) -> Dict[str, float]:
            lo, hi = wilson_ci(k, n)
            return {"lower": round(lo, 4), "upper": round(hi, 4)}

        n_total = len(records)
        entity_tp = entity_metrics["tp"]
        entity_tp_fp = entity_tp + entity_metrics["fp"]
        entity_tp_fn = entity_tp + entity_metrics["fn"]

        results["systems"][sys_name] = {
            "entity_metrics": {
                **entity_metrics,
                "precision_ci95": _wci(entity_tp, entity_tp_fp),
                "recall_ci95": _wci(entity_tp, entity_tp_fn),
            },
            "entity_metrics_strict": {
                **entity_metrics_strict,
            },
            "flagged_metrics": {
                **flagged_metrics,
                "precision_ci95": _wci(flagged_metrics["tp"], flagged_metrics["tp"] + flagged_metrics["fp"]),
                "recall_ci95": _wci(flagged_metrics["tp"], flagged_metrics["tp"] + flagged_metrics["fn"]),
                "combo_risk_recall_ci95": _wci(
                    flagged_metrics["combo_flagged"], flagged_metrics["combo_total"]
                ),
            },
            "decision_accuracy": decision_accuracy,
            "utility": utility,
            "per_category": cat_breakdown,
            "latency": latency,
        }

    # ── Log and save ──────────────────────────────────────────────────────────
    if split == "test":
        _append_test_run_log(results, manifest)

    return results


def _append_test_run_log(results: Dict[str, Any], manifest: Dict[str, Any]) -> None:
    """Append one line to bench/results/test_run_log.jsonl."""
    log_path = BENCH_RESULTS / "test_run_log.jsonl"
    # Determine run number
    run_number = 1
    if log_path.exists():
        with open(log_path, encoding="utf-8") as f:
            for _ in f:
                run_number += 1

    entry = {
        "run_number": run_number,
        "timestamp": _now_iso(),
        "git_commit": results["meta"]["commit"],
        "dev_sha256": results["meta"]["dev_sha256"],
        "test_sha256": results["meta"]["test_sha256"],
        "n_records": results["meta"]["n"],
        "systems": list(results["systems"].keys()),
    }
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    print(f"\n*** TEST SPLIT RUN #{run_number} logged to test_run_log.jsonl ***")
    results["meta"]["test_run_number"] = run_number


def _now_iso() -> str:
    import datetime
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ─── Report generation ────────────────────────────────────────────────────────

def _pct(v: Optional[float]) -> str:
    if v is None:
        return "N/A"
    return f"{v * 100:.1f}%"


def _fmt_ci(ci: Optional[Dict[str, float]]) -> str:
    if not ci:
        return ""
    return f" [{_pct(ci.get('lower'))}–{_pct(ci.get('upper'))}]"


def generate_markdown_report(results: Dict[str, Any], split: str) -> str:
    """Generate BENCHMARK.md content from results dict."""
    meta = results["meta"]
    systems = results["systems"]
    sys_names = list(systems.keys())

    lines: List[str] = []
    a = lines.append

    a("# VeilGuard AI Benchmark Report")
    a("")
    run_no = meta.get("test_run_number", "N/A (dev)")
    a(f"> **Split:** `{split}` | **Run #:** {run_no} | **Commit:** `{meta['commit']}`")
    a(f"> **Records:** {meta['n']} | **Generated from JSON — no numbers typed by hand.**")
    a("")
    a("> [!IMPORTANT]")
    a("> Results are on a **synthetic, same-team-authored dataset**. They measure")
    a("> relative behaviour on this corpus — not real-world accuracy, not a formal")
    a("> privacy guarantee, not a probability of re-identification. See §Limitations.")
    a("")

    # Dataset composition
    a("## Dataset Composition")
    a("")
    a("| Category | Dev | Test |")
    a("|---|---|---|")
    manifest = _load_manifest()
    for cat in sorted(manifest["splits"]["dev"]["categories"]):
        d = manifest["splits"]["dev"]["categories"].get(cat, 0)
        t = manifest["splits"]["test"]["categories"].get(cat, 0)
        lc = " ⚠" if t < 20 else ""
        a(f"| {cat} | {d} | {t}{lc} |")
    a(f"| **Total** | **{manifest['splits']['dev']['count']}** | **{manifest['splits']['test']['count']}** |")
    a("")
    a("*⚠ = fewer than 20 test items (low confidence)*")
    a("")

    # System descriptions
    a("## Systems")
    a("")
    descriptions = {
        "keyword": "Competent regex/keyword filter (R01–R11, see `bench/baselines/keyword.py`)",
        "presidio_default": "Stock `AnalyzerEngine()`, default registry, `entities=None`",
        "presidio_all_stock": "Presidio with all predefined recognizers enabled",
        "veilguard_type_based": "VeilGuard Phase 3a pipeline, all Phase 5 intelligence OFF",
        "veilguard_full": "VeilGuard with all intelligence features ON",
    }
    for name in sys_names:
        a(f"- **{name}**: {descriptions.get(name, name)}")
    a("")

    # Entity-level F1 table
    a("## Entity-Level Metrics (50% IoU, micro)")
    a("")
    a("| System | TP | FP | FN | Precision | Recall | F1 | P CI95 | R CI95 |")
    a("|---|---|---|---|---|---|---|---|---|")
    for name in sys_names:
        em = systems[name]["entity_metrics"]
        p_ci = systems[name]["entity_metrics"].get("precision_ci95", {})
        r_ci = systems[name]["entity_metrics"].get("recall_ci95", {})
        a(f"| {name} | {em['tp']} | {em['fp']} | {em['fn']} "
          f"| {_pct(em['precision'])} | {_pct(em['recall'])} | {_pct(em['f1'])} "
          f"| {_pct(p_ci.get('lower'))}–{_pct(p_ci.get('upper'))} "
          f"| {_pct(r_ci.get('lower'))}–{_pct(r_ci.get('upper'))} |")
    a("")

    # Strict exact-boundary variant
    a("### Strict Exact-Boundary Variant")
    a("")
    a("| System | TP | FP | FN | Precision | Recall | F1 |")
    a("|---|---|---|---|---|---|---|")
    for name in sys_names:
        em = systems[name]["entity_metrics_strict"]
        a(f"| {name} | {em['tp']} | {em['fp']} | {em['fn']} "
          f"| {_pct(em['precision'])} | {_pct(em['recall'])} | {_pct(em['f1'])} |")
    a("")

    # Flagged-item metrics
    a("## Flagged-Item Metrics")
    a("")
    a("| System | Precision | Recall | F1 | FPR | P CI95 | R CI95 |")
    a("|---|---|---|---|---|---|---|")
    for name in sys_names:
        fm = systems[name]["flagged_metrics"]
        p_ci = fm.get("precision_ci95", {})
        r_ci = fm.get("recall_ci95", {})
        a(f"| {name} | {_pct(fm['precision'])} | {_pct(fm['recall'])} "
          f"| {_pct(fm['f1'])} | {_pct(fm['fpr'])} "
          f"| {_pct(p_ci.get('lower'))}–{_pct(p_ci.get('upper'))} "
          f"| {_pct(r_ci.get('lower'))}–{_pct(r_ci.get('upper'))} |")
    a("")

    # Combination-risk recall
    a("## Combination-Risk Recall")
    a("")
    a("| System | Combo Flagged | Combo Total | Recall | CI95 |")
    a("|---|---|---|---|---|")
    for name in sys_names:
        fm = systems[name]["flagged_metrics"]
        cr_ci = fm.get("combo_risk_recall_ci95", {})
        a(f"| {name} | {fm['combo_flagged']} | {fm['combo_total']} "
          f"| {_pct(fm['combo_risk_recall'])} "
          f"| {_pct(cr_ci.get('lower'))}–{_pct(cr_ci.get('upper'))} |")
    a("")

    # Utility
    a("## Utility (Required Retention & Sensitive Removal)")
    a("")
    a("> Retention rate does not prove an AI would answer identically.")
    a("")
    a("| System | Required Retained | Sensitive Removed |")
    a("|---|---|---|")
    for name in sys_names:
        u = systems[name]["utility"]
        a(f"| {name} | {_pct(u['required_retained_rate'])} "
          f"({u['required_retained_count']}/{u['required_total']}) "
          f"| {_pct(u['sensitive_removed_rate'])} "
          f"({u['sensitive_removed_count']}/{u['sensitive_total']}) |")
    a("")

    # Decision accuracy (VeilGuard only)
    vg_systems = [n for n in sys_names if systems[n].get("decision_accuracy")]
    if vg_systems:
        a("## Decision Accuracy (VeilGuard Variants Only)")
        a("")
        for name in vg_systems:
            da = systems[name]["decision_accuracy"]
            a(f"### {name}: accuracy={_pct(da['accuracy'])} ({da['correct']}/{da['n']})")
            a("")
            # Confusion matrix
            matrix = da["confusion_matrix"]
            classes = ["allow", "redact", "require_approval", "block"]
            header = "| Gold \\ Pred | " + " | ".join(classes) + " |"
            sep = "|---|" + "---|" * len(classes)
            a(header)
            a(sep)
            for g in classes:
                row = f"| {g} | " + " | ".join(str(matrix[g].get(p, 0)) for p in classes) + " |"
                a(row)
            a("")

    # Latency
    a("## Latency")
    a("")
    hw = meta["hardware"]
    a(f"Hardware: `{hw.get('processor', 'unknown')}` | OS: `{hw.get('platform', 'unknown')}` | "
      f"Python: `{hw.get('python', 'unknown')}`")
    a("")
    a("| System | p50 (ms) | p95 (ms) |")
    a("|---|---|---|")
    for name in sys_names:
        lat = systems[name]["latency"]
        a(f"| {name} | {lat['p50_ms']:.1f} | {lat['p95_ms']:.1f} |")
    a("")

    # Ablation (type_based vs full)
    if "veilguard_type_based" in systems and "veilguard_full" in systems:
        a("## Ablation: veilguard_type_based vs veilguard_full")
        a("")
        tb = systems["veilguard_type_based"]
        fu = systems["veilguard_full"]
        a("| Metric | type_based | full | Delta |")
        a("|---|---|---|---|")
        for label, tb_val, fu_val in [
            ("Entity F1", tb["entity_metrics"]["f1"], fu["entity_metrics"]["f1"]),
            ("Flagged F1", tb["flagged_metrics"]["f1"], fu["flagged_metrics"]["f1"]),
            ("Combo Recall", tb["flagged_metrics"]["combo_risk_recall"], fu["flagged_metrics"]["combo_risk_recall"]),
            ("Required Retained", tb["utility"]["required_retained_rate"] or 0, fu["utility"]["required_retained_rate"] or 0),
        ]:
            delta = (fu_val - tb_val)
            sign = "+" if delta >= 0 else ""
            a(f"| {label} | {_pct(tb_val)} | {_pct(fu_val)} | {sign}{_pct(delta)} |")
        a("")

    # Where VeilGuard did not win
    a("## Where VeilGuard Did Not Win")
    a("")
    a("Categories where a baseline matched or beat VeilGuard Full on Entity F1:")
    a("")
    if "veilguard_full" in systems:
        vg_f1_per_cat = {
            cat: systems["veilguard_full"]["per_category"].get(cat, {})
            .get("entity_metrics", {}).get("f1", 0.0)
            for cat in manifest["splits"][split]["categories"]
        }
        any_loss = False
        for name in [n for n in sys_names if n != "veilguard_full"]:
            for cat in sorted(vg_f1_per_cat):
                bl_f1 = systems[name].get("per_category", {}).get(cat, {}).get(
                    "entity_metrics", {}
                ).get("f1", 0.0)
                vg_f1 = vg_f1_per_cat.get(cat, 0.0)
                if bl_f1 >= vg_f1 and (bl_f1 > 0 or vg_f1 > 0):
                    a(f"- **{cat}**: `{name}` F1={_pct(bl_f1)} vs VeilGuard Full F1={_pct(vg_f1)}")
                    any_loss = True
        if not any_loss:
            a("- None on this run.")
    else:
        a("- (veilguard_full not included in this run)")
    a("")

    # Per-category breakdown
    a("## Per-Category Entity Metrics (Entity F1)")
    a("")
    cats = sorted(set(
        cat for s in systems.values()
        for cat in s.get("per_category", {}).keys()
    ))
    a("| Category | N | " + " | ".join(f"{n} F1" for n in sys_names) + " |")
    a("|---|---|" + "---|" * len(sys_names))
    for cat in cats:
        n_test = manifest["splits"][split]["categories"].get(cat, 0)
        lc = " *" if n_test < 20 else ""
        row = f"| {cat}{lc} | {n_test} | "
        for name in sys_names:
            f1 = systems[name].get("per_category", {}).get(cat, {}).get(
                "entity_metrics", {}
            ).get("f1", None)
            row += f"{_pct(f1)} | "
        a(row)
    a("")
    a("*\\* low confidence (n < 20)*")
    a("")

    # Run log
    if split == "test":
        run_log_path = BENCH_RESULTS / "test_run_log.jsonl"
        if run_log_path.exists():
            a("## Test Split Run Log")
            a("")
            a("| Run # | Timestamp | Commit | Systems |")
            a("|---|---|---|---|")
            with open(run_log_path, encoding="utf-8") as f:
                for line in f:
                    entry = json.loads(line.strip())
                    a(f"| {entry['run_number']} | {entry['timestamp']} "
                      f"| `{entry['git_commit']}` | {', '.join(entry['systems'])} |")
            a("")

    # Limitations
    a("## Limitations")
    a("")
    a("- **Synthetic dataset**: all items were authored by the same team writing the engine.")
    a("- **Same-team authorship**: the no-peek rule cannot be technically enforced.")
    a("- **Small N**: per-category counts are small; CIs are wide.")
    a("- **Rule-based components**: task inference is lexical and English-only.")
    a("- **Expert-guess weights**: re-identification weights are heuristic estimates, not probabilities.")
    a("- **Medical lexicon**: non-exhaustive; medical detection is best-effort.")
    a("- **`may_change_result` unvalidated**: not tested with a real AI model.")
    a("- **NER limitations**: `en_core_web_sm` misses some Indian names (documented xfail).")
    a("")

    return "\n".join(lines)


# ─── CLI entry point ──────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="VeilGuard AI Benchmark Runner")
    parser.add_argument("--split", choices=["dev", "test"], required=True)
    parser.add_argument("--systems", nargs="+", default=["all"],
                        help="Systems to evaluate. Use 'all' for all five.")
    parser.add_argument("--confirm-frozen", action="store_true",
                        help="Required when --split test: acknowledges sealed dataset.")
    parser.add_argument("--out", type=Path, default=None,
                        help="Override output JSON path.")
    args = parser.parse_args()

    print(f"\n=== VeilGuard Benchmark Runner ===")
    print(f"Split: {args.split} | Systems: {args.systems}")
    if args.split == "test":
        print(f"*** TEST SPLIT — results will be logged ***")

    results = run_benchmark(
        split=args.split,
        system_names=args.systems,
        confirm_frozen=args.confirm_frozen,
    )

    # Write JSON
    out_path = args.out or (BENCH_RESULTS / f"benchmark_{args.split}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"\nResults JSON: {out_path}")

    # Generate and write Markdown
    md = generate_markdown_report(results, args.split)
    md_path = BENCH_RESULTS / "BENCHMARK.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"Markdown report: {md_path}")

    # Show top-line summary
    print("\n--- Top-line summary ---")
    for sys_name, sys_data in results["systems"].items():
        em = sys_data["entity_metrics"]
        fm = sys_data["flagged_metrics"]
        print(
            f"  {sys_name:<25} entity_F1={_pct(em['f1']):<8} "
            f"flagged_recall={_pct(fm['recall']):<8} "
            f"combo_recall={_pct(fm['combo_risk_recall'])}"
        )

    if args.split == "test":
        run_no = results["meta"].get("test_run_number", "?")
        print(f"\n*** This was test split run #{run_no}. ***")


if __name__ == "__main__":
    main()
