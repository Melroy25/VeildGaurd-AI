# VeilGuard AI Benchmark Report

> **Split:** `test` | **Run #:** 1 | **Commit:** `41b9fc1`
> **Records:** 286 | **Generated from JSON — no numbers typed by hand.**

> [!IMPORTANT]
> Results are on a **synthetic, same-team-authored dataset**. They measure
> relative behaviour on this corpus — not real-world accuracy, not a formal
> privacy guarantee, not a probability of re-identification. See §Limitations.

## Dataset Composition

| Category | Dev | Test |
|---|---|---|
| direct_pii | 23 | 52 |
| financial | 24 | 19 ⚠ |
| hard_negatives | 35 | 34 |
| india_ids | 53 | 56 |
| indirect_combo | 26 | 47 |
| medical | 20 | 30 |
| secrets | 31 | 30 |
| utility_tasks | 21 | 18 ⚠ |
| **Total** | **233** | **286** |

*⚠ = fewer than 20 test items (low confidence)*

## Systems

- **keyword**: Competent regex/keyword filter (R01–R11, see `bench/baselines/keyword.py`)
- **presidio_default**: Stock `AnalyzerEngine()`, default registry, `entities=None`
- **presidio_all_stock**: Presidio with all predefined recognizers enabled
- **veilguard_type_based**: VeilGuard Phase 3a pipeline, all Phase 5 intelligence OFF
- **veilguard_full**: VeilGuard with all intelligence features ON

## Entity-Level Metrics (50% IoU, micro)

| System | TP | FP | FN | Precision | Recall | F1 | P CI95 | R CI95 |
|---|---|---|---|---|---|---|---|---|
| keyword | 209 | 28 | 297 | 88.2% | 41.3% | 56.3% | 83.5%–91.7% | 37.1%–45.6% |
| presidio_default | 124 | 465 | 382 | 21.1% | 24.5% | 22.6% | 17.9%–24.5% | 21.0%–28.4% |
| presidio_all_stock | 124 | 465 | 382 | 21.1% | 24.5% | 22.6% | 17.9%–24.5% | 21.0%–28.4% |
| veilguard_type_based | 165 | 90 | 341 | 64.7% | 32.6% | 43.4% | 58.7%–70.3% | 28.7%–36.8% |
| veilguard_full | 379 | 151 | 127 | 71.5% | 74.9% | 73.2% | 67.5%–75.2% | 71.0%–78.5% |

### Strict Exact-Boundary Variant

| System | TP | FP | FN | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| keyword | 191 | 46 | 315 | 80.6% | 37.7% | 51.4% |
| presidio_default | 122 | 467 | 384 | 20.7% | 24.1% | 22.3% |
| presidio_all_stock | 122 | 467 | 384 | 20.7% | 24.1% | 22.3% |
| veilguard_type_based | 157 | 98 | 349 | 61.6% | 31.0% | 41.3% |
| veilguard_full | 338 | 192 | 168 | 63.8% | 66.8% | 65.3% |

## Flagged-Item Metrics

| System | Precision | Recall | F1 | FPR | P CI95 | R CI95 |
|---|---|---|---|---|---|---|
| keyword | 97.3% | 79.2% | 87.3% | 3.9% | 93.3%–99.0% | 72.8%–84.5% |
| presidio_default | 60.5% | 72.7% | 66.0% | 84.5% | 53.9%–66.7% | 65.8%–78.6% |
| presidio_all_stock | 60.5% | 72.7% | 66.0% | 84.5% | 53.9%–66.7% | 65.8%–78.6% |
| veilguard_type_based | 100.0% | 56.8% | 72.5% | 0.0% | 96.4%–100.0% | 49.6%–63.8% |
| veilguard_full | 100.0% | 84.2% | 91.4% | 0.0% | 97.6%–100.0% | 78.2%–88.7% |

## Combination-Risk Recall

| System | Combo Flagged | Combo Total | Recall | CI95 |
|---|---|---|---|---|
| keyword | 6 | 35 | 17.1% | 8.1%–32.7% |
| presidio_default | 34 | 35 | 97.1% | 85.5%–99.5% |
| presidio_all_stock | 34 | 35 | 97.1% | 85.5%–99.5% |
| veilguard_type_based | 0 | 35 | 0.0% | 0.0%–9.9% |
| veilguard_full | 28 | 35 | 80.0% | 64.1%–90.0% |

## Utility (Required Retention & Sensitive Removal)

> Retention rate does not prove an AI would answer identically.

| System | Required Retained | Sensitive Removed |
|---|---|---|
| keyword | 96.7% (175/181) | 41.1% (208/506) |
| presidio_default | 63.5% (115/181) | 48.8% (247/506) |
| presidio_all_stock | 63.5% (115/181) | 48.8% (247/506) |
| veilguard_type_based | 100.0% (181/181) | 24.3% (123/506) |
| veilguard_full | 100.0% (181/181) | 24.5% (124/506) |

## Decision Accuracy (VeilGuard Variants Only)

### veilguard_type_based: accuracy=71.7% (205/286)

| Gold \ Pred | allow | redact | require_approval | block |
|---|---|---|---|---|
| allow | 103 | 0 | 0 | 0 |
| redact | 31 | 73 | 0 | 0 |
| require_approval | 48 | 1 | 0 | 0 |
| block | 0 | 1 | 0 | 29 |

### veilguard_full: accuracy=55.2% (158/286)

| Gold \ Pred | allow | redact | require_approval | block |
|---|---|---|---|---|
| allow | 103 | 0 | 0 | 0 |
| redact | 9 | 26 | 69 | 0 |
| require_approval | 20 | 29 | 0 | 0 |
| block | 0 | 1 | 0 | 29 |

## Latency

Hardware: `Intel64 Family 6 Model 140 Stepping 1, GenuineIntel` | OS: `Windows-11-10.0.26300-SP0` | Python: `3.13.5`

| System | p50 (ms) | p95 (ms) |
|---|---|---|
| keyword | 0.1 | 0.1 |
| presidio_default | 6.2 | 9.7 |
| presidio_all_stock | 6.1 | 8.7 |
| veilguard_type_based | 6.5 | 11.9 |
| veilguard_full | 19.3 | 29.9 |

## Ablation: veilguard_type_based vs veilguard_full

| Metric | type_based | full | Delta |
|---|---|---|---|
| Entity F1 | 43.4% | 73.2% | +29.8% |
| Flagged F1 | 72.5% | 91.4% | +18.9% |
| Combo Recall | 0.0% | 80.0% | +80.0% |
| Required Retained | 100.0% | 100.0% | +0.0% |

## Where VeilGuard Did Not Win

Categories where a baseline matched or beat VeilGuard Full on Entity F1:

- **direct_pii**: `keyword` F1=72.3% vs VeilGuard Full F1=60.4%
- **financial**: `keyword` F1=66.7% vs VeilGuard Full F1=37.5%
- **india_ids**: `keyword` F1=65.6% vs VeilGuard Full F1=46.2%
- **direct_pii**: `veilguard_type_based` F1=65.2% vs VeilGuard Full F1=60.4%
- **financial**: `veilguard_type_based` F1=60.0% vs VeilGuard Full F1=37.5%
- **india_ids**: `veilguard_type_based` F1=61.0% vs VeilGuard Full F1=46.2%
- **secrets**: `veilguard_type_based` F1=95.1% vs VeilGuard Full F1=92.1%

## Per-Category Entity Metrics (Entity F1)

| Category | N | keyword F1 | presidio_default F1 | presidio_all_stock F1 | veilguard_type_based F1 | veilguard_full F1 |
|---|---|---|---|---|---|---|
| direct_pii | 52 | 72.3% | 49.7% | 49.7% | 65.2% | 60.4% | 
| financial * | 19 | 66.7% | 6.7% | 6.7% | 60.0% | 37.5% | 
| hard_negatives | 34 | 22.2% | 35.0% | 35.0% | 48.8% | 54.5% | 
| india_ids | 56 | 65.6% | 0.0% | 0.0% | 61.0% | 46.2% | 
| indirect_combo | 47 | 0.0% | 0.0% | 0.0% | 0.0% | 77.7% | 
| medical | 30 | 76.9% | 45.6% | 45.6% | 39.6% | 94.2% | 
| secrets | 30 | 69.9% | 0.0% | 0.0% | 95.1% | 92.1% | 
| utility_tasks * | 18 | 0.0% | 0.0% | 0.0% | 0.0% | 73.7% | 

*\* low confidence (n < 20)*

## Test Split Run Log

| Run # | Timestamp | Commit | Systems |
|---|---|---|---|
| 1 | 2026-10-17T16:43:53Z | `41b9fc1` | keyword, presidio_default, presidio_all_stock, veilguard_type_based, veilguard_full |

## Limitations

- **Synthetic dataset**: all items were authored by the same team writing the engine.
- **Same-team authorship**: the no-peek rule cannot be technically enforced.
- **Small N**: per-category counts are small; CIs are wide.
- **Rule-based components**: task inference is lexical and English-only.
- **Expert-guess weights**: re-identification weights are heuristic estimates, not probabilities.
- **Medical lexicon**: non-exhaustive; medical detection is best-effort.
- **`may_change_result` unvalidated**: not tested with a real AI model.
- **NER limitations**: `en_core_web_sm` misses some Indian names (documented xfail).
