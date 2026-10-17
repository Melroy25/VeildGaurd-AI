# VeilGuard AI Benchmark Report

> **Split:** `dev` | **Run #:** N/A (dev) | **Commit:** `950404a`
> **Records:** 233 | **Generated from JSON — no numbers typed by hand.**

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
| keyword | 149 | 33 | 146 | 81.9% | 50.5% | 62.5% | 75.6%–86.8% | 44.8%–56.2% |
| presidio_default | 26 | 312 | 269 | 7.7% | 8.8% | 8.2% | 5.3%–11.0% | 6.1%–12.6% |
| presidio_all_stock | 26 | 312 | 269 | 7.7% | 8.8% | 8.2% | 5.3%–11.0% | 6.1%–12.6% |
| veilguard_type_based | 105 | 84 | 190 | 55.6% | 35.6% | 43.4% | 48.4%–62.5% | 30.3%–41.2% |
| veilguard_full | 236 | 133 | 59 | 64.0% | 80.0% | 71.1% | 58.9%–68.7% | 75.1%–84.2% |

### Strict Exact-Boundary Variant

| System | TP | FP | FN | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| keyword | 148 | 34 | 147 | 81.3% | 50.2% | 62.1% |
| presidio_default | 26 | 312 | 269 | 7.7% | 8.8% | 8.2% |
| presidio_all_stock | 26 | 312 | 269 | 7.7% | 8.8% | 8.2% |
| veilguard_type_based | 105 | 84 | 190 | 55.6% | 35.6% | 43.4% |
| veilguard_full | 211 | 158 | 84 | 57.2% | 71.5% | 63.6% |

## Flagged-Item Metrics

| System | Precision | Recall | F1 | FPR | P CI95 | R CI95 |
|---|---|---|---|---|---|---|
| keyword | 81.3% | 72.9% | 76.9% | 33.3% | 74.0%–86.9% | 65.4%–79.3% |
| presidio_default | 71.0% | 66.5% | 68.7% | 53.8% | 63.2%–77.8% | 58.7%–73.4% |
| presidio_all_stock | 71.0% | 66.5% | 68.7% | 53.8% | 63.2%–77.8% | 58.7%–73.4% |
| veilguard_type_based | 89.1% | 58.1% | 70.3% | 14.1% | 81.5%–93.8% | 50.2%–65.5% |
| veilguard_full | 89.4% | 60.0% | 71.8% | 14.1% | 82.0%–94.0% | 52.1%–67.4% |

## Combination-Risk Recall

| System | Combo Flagged | Combo Total | Recall | CI95 |
|---|---|---|---|---|
| keyword | 1 | 25 | 4.0% | 0.7%–19.5% |
| presidio_default | 24 | 25 | 96.0% | 80.5%–99.3% |
| presidio_all_stock | 24 | 25 | 96.0% | 80.5%–99.3% |
| veilguard_type_based | 0 | 25 | 0.0% | 0.0%–13.3% |
| veilguard_full | 3 | 25 | 12.0% | 4.2%–30.0% |

## Utility (Required Retention & Sensitive Removal)

> Retention rate does not prove an AI would answer identically.

| System | Required Retained | Sensitive Removed |
|---|---|---|
| keyword | 77.7% (143/184) | 50.8% (150/295) |
| presidio_default | 77.2% (142/184) | 32.5% (96/295) |
| presidio_all_stock | 77.2% (142/184) | 32.5% (96/295) |
| veilguard_type_based | 94.0% (173/184) | 31.2% (92/295) |
| veilguard_full | 94.0% (173/184) | 26.4% (78/295) |

## Decision Accuracy (VeilGuard Variants Only)

### veilguard_type_based: accuracy=67.4% (157/233)

| Gold \ Pred | allow | redact | require_approval | block |
|---|---|---|---|---|
| allow | 67 | 11 | 0 | 0 |
| redact | 40 | 59 | 0 | 0 |
| require_approval | 25 | 0 | 0 | 0 |
| block | 0 | 0 | 0 | 31 |

### veilguard_full: accuracy=58.4% (136/233)

| Gold \ Pred | allow | redact | require_approval | block |
|---|---|---|---|---|
| allow | 67 | 11 | 0 | 0 |
| redact | 40 | 38 | 21 | 0 |
| require_approval | 22 | 3 | 0 | 0 |
| block | 0 | 0 | 0 | 31 |

## Latency

Hardware: `Intel64 Family 6 Model 140 Stepping 1, GenuineIntel` | OS: `Windows-11-10.0.26300-SP0` | Python: `3.13.5`

| System | p50 (ms) | p95 (ms) |
|---|---|---|
| keyword | 0.1 | 0.1 |
| presidio_default | 6.4 | 10.0 |
| presidio_all_stock | 5.9 | 8.5 |
| veilguard_type_based | 7.4 | 12.7 |
| veilguard_full | 15.1 | 26.4 |

## Ablation: veilguard_type_based vs veilguard_full

| Metric | type_based | full | Delta |
|---|---|---|---|
| Entity F1 | 43.4% | 71.1% | +27.7% |
| Flagged F1 | 70.3% | 71.8% | +1.5% |
| Combo Recall | 0.0% | 12.0% | +12.0% |
| Required Retained | 94.0% | 94.0% | +0.0% |

## Where VeilGuard Did Not Win

Categories where a baseline matched or beat VeilGuard Full on Entity F1:

- **direct_pii**: `keyword` F1=65.7% vs VeilGuard Full F1=54.8%
- **financial**: `keyword` F1=65.7% vs VeilGuard Full F1=10.3%
- **india_ids**: `keyword` F1=80.9% vs VeilGuard Full F1=65.8%
- **secrets**: `keyword` F1=95.4% vs VeilGuard Full F1=63.2%
- **direct_pii**: `veilguard_type_based` F1=60.6% vs VeilGuard Full F1=54.8%
- **financial**: `veilguard_type_based` F1=13.3% vs VeilGuard Full F1=10.3%
- **india_ids**: `veilguard_type_based` F1=79.1% vs VeilGuard Full F1=65.8%
- **secrets**: `veilguard_type_based` F1=75.9% vs VeilGuard Full F1=63.2%

## Per-Category Entity Metrics (Entity F1)

| Category | N | keyword F1 | presidio_default F1 | presidio_all_stock F1 | veilguard_type_based F1 | veilguard_full F1 |
|---|---|---|---|---|---|---|
| direct_pii | 23 | 65.7% | 42.3% | 42.3% | 60.6% | 54.8% | 
| financial | 24 | 65.7% | 6.3% | 6.3% | 13.3% | 10.3% | 
| hard_negatives | 35 | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 
| india_ids | 53 | 80.9% | 0.0% | 0.0% | 79.1% | 65.8% | 
| indirect_combo | 26 | 0.0% | 0.0% | 0.0% | 0.0% | 77.0% | 
| medical | 20 | 96.2% | 8.9% | 8.9% | 9.3% | 98.8% | 
| secrets | 31 | 95.4% | 0.0% | 0.0% | 75.9% | 63.2% | 
| utility_tasks | 21 | 0.0% | 0.0% | 0.0% | 0.0% | 100.0% | 

*\* low confidence (n < 20)*

## Limitations

- **Synthetic dataset**: all items were authored by the same team writing the engine.
- **Same-team authorship**: the no-peek rule cannot be technically enforced.
- **Small N**: per-category counts are small; CIs are wide.
- **Rule-based components**: task inference is lexical and English-only.
- **Expert-guess weights**: re-identification weights are heuristic estimates, not probabilities.
- **Medical lexicon**: non-exhaustive; medical detection is best-effort.
- **`may_change_result` unvalidated**: not tested with a real AI model.
- **NER limitations**: `en_core_web_sm` misses some Indian names (documented xfail).
