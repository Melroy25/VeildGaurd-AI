# VeilGuard AI: Benchmark Methodology & Evaluation

This document outlines the benchmark methodology, evaluation criteria, baseline definitions, sealed-test procedure, and official results for VeilGuard AI.

> [!IMPORTANT]
> All evaluation data is strictly synthetic. Per Project Rule 1 and Rule 10, no real personal data was collected or evaluated. Benchmark metrics reflect relative behavior on this synthetic corpus and must not be interpreted as absolute real-world accuracy guarantees or formal privacy certificates.

---

## 1. Methodology & Dataset Design

The evaluation corpus was constructed according to the specifications in `bench/data/handwritten.yaml` and is split into two disjoint sets:

1. **Development Split (`dev.jsonl`)**: 233 records. Used exclusively for iterative heuristic tuning, error analysis, and regression testing during development.
2. **Test Split (`test.jsonl`)**: 286 records. Sealed upon creation; no code tuning or threshold adjustment was performed against the test split.

### Corpus Composition

| Category | Description | Dev | Test |
|:---|:---|:---|:---|
| `direct_pii` | Names, emails, phone numbers in diverse sentence structures | 23 | 52 |
| `financial` | Bank account numbers, IFSC codes, cards, UPI IDs | 24 | 19 ⚠ |
| `hard_negatives` | Harmless public text, benign numbers, model numbers, dates | 35 | 34 |
| `india_ids` | Aadhaar (Verhoeff), PAN, GSTIN with checksums and false formats | 53 | 56 |
| `indirect_combo` | Quasi-identifier combinations (age, role, location, org, event) | 26 | 47 |
| `medical` | Health terms, procedures, diagnoses paired with/without identity | 20 | 30 |
| `secrets` | High-entropy tokens, AWS keys, GitHub tokens, generic secrets | 31 | 30 |
| `utility_tasks` | Task-driven prompts testing required detail retention | 21 | 18 ⚠ |
| **Total** | | **233** | **286** |

*(⚠ indicates fewer than 20 test records, resulting in wider confidence intervals).*

---

## 2. Evaluation Metrics

### Entity-Level Metrics
- **Span Overlap (Micro-F1)**: A prediction is counted as a True Positive if its span overlaps with an expected entity span by at least 50% Intersection over Union (IoU) and matches the entity group.
- **Strict Exact-Boundary**: A prediction is counted as a True Positive only if start and end character offsets match the expected span exactly.
- **Confidence Intervals**: 95% confidence intervals are computed using the Wilson score interval for binomial proportions.

### Flagged-Item Metrics
- Evaluates whether the system appropriately flagged non-benign submissions (`decision != "allow"`):
  - **Flagged Precision, Recall, and F1**
  - **False Positive Rate (FPR)** on benign hard-negative prompts
  - **Combination-Risk Recall**: Detection rate on prompts containing indirect quasi-identifier combinations without direct identifiers.

### Utility Preservation
- **Required Retained Rate**: Fraction of task-essential spans preserved in sanitized text.
- **Sensitive Removed Rate**: Fraction of sensitive spans successfully removed or pseudonymized.

### Latency Measurement
- In-process execution latency (scan, policy, sanitize) measured across 3 timed passes after 5 warmup calls, reporting p50 and p95 in milliseconds.

---

## 3. Evaluated Systems & Baselines

1. **`keyword`**: Standard regex and keyword filter covering mobile numbers, emails, 12-digit numbers, PAN formats, cards, secret prefixes, and confidential watchlist words (Rules R01–R11 in `bench/baselines/keyword.py`).
2. **`presidio_default`**: Microsoft Presidio `AnalyzerEngine()` running stock default recognizers with `en_core_web_sm`.
3. **`presidio_all_stock`**: Microsoft Presidio with all stock predefined recognizers enabled.
4. **`veilguard_type_based`**: VeilGuard Phase 3a pipeline (checksum validators, regex detectors, secrets scanner, spaCy NER, deterministic policy) with all Phase 5 context intelligence flags disabled.
5. **`veilguard_full`**: Complete VeilGuard system with Phase 5 Context Intelligence enabled (lexical task classification, necessity matrix, role-based placeholders, heuristic quasi-identifier re-ID scoring & reduction, medical term detector).

---

## 4. Sealed-Test Protocol & Execution Log

To ensure experimental integrity and prevent test-set contamination:
- The test dataset was sealed and frozen prior to Part C feature development.
- The SHA-256 checksums were recorded in `bench/data/MANIFEST.json`:
  - `dev.jsonl`: `716bf6bc80310eeea602406d275d679e5a583f2b422bfe2e5856fc79ef804572`
  - `test.jsonl`: `335a7ad7739b86f71c062fc51ff43fdc239d9a4d198302c7700138ee3e28242d`
- The runner enforces:
  1. Manifest hash verification before loading.
  2. Clean git working tree requirement (`_git_is_clean()`).
  3. Explicit `--confirm-frozen` flag confirmation.
  4. Automatic append-only logging to `bench/results/test_run_log.jsonl`.

### Test Split Run Log

| Run # | Timestamp (UTC) | Git Commit | Systems Evaluated | Records |
|:---|:---|:---|:---|:---|
| **1** | 2026-10-17 16:43:53 | `41b9fc1` | `keyword`, `presidio_default`, `presidio_all_stock`, `veilguard_type_based`, `veilguard_full` | 286 |

---

## 5. Official Test Split Results

Generated directly from `bench/results/benchmark_test.json`:

### Top-Line Summary

| System | Entity F1 (50% IoU) | Strict Entity F1 | Flagged Recall | Combo Risk Recall | FPR | p50 Latency |
|:---|:---|:---|:---|:---|:---|:---|
| **keyword** | 56.3% | 51.4% | 79.2% | 17.1% | 3.9% | 0.1 ms |
| **presidio_default** | 22.6% | 22.3% | 72.7% | 97.1% | 84.5% | 6.2 ms |
| **presidio_all_stock** | 22.6% | 22.3% | 72.7% | 97.1% | 84.5% | 6.1 ms |
| **veilguard_type_based** | 43.4% | 41.3% | 56.8% | 0.0% | 0.0% | 6.5 ms |
| **veilguard_full** | **73.2%** | **65.3%** | **84.2%** | **80.0%** | **0.0%** | 19.3 ms |

### Ablation: Type-Based vs Full Intelligence

| Metric | Type-Based (Phase 3a) | Full (Phase 5) | Absolute Delta |
|:---|:---|:---|:---|
| **Entity F1** | 43.4% | 73.2% | **+29.8%** |
| **Flagged F1** | 72.5% | 91.4% | **+18.9%** |
| **Flagged Recall** | 56.8% | 84.2% | **+27.4%** |
| **Combination Recall** | 0.0% | 80.0% | **+80.0%** |
| **False Positive Rate** | 0.0% | 0.0% | 0.0% |
| **Required Span Retained** | 100.0% | 100.0% | 0.0% |

---

## 6. Where VeilGuard Did Not Win (Failures & Baselines)

In accordance with our Honesty rules (Rule 1 & Rule 3), we publish all areas where baselines matched or exceeded VeilGuard:

1. **Direct PII Entity F1**:
   - `keyword` achieved 72.3% vs VeilGuard Full's 60.4% and Type-Based's 65.2%.
   - *Reason*: `keyword` regexes match phone numbers and emails with minimal boundary fuzziness, whereas small statistical NER (`en_core_web_sm`) occasionally misidentifies person names or extracts partial entity spans.
2. **Financial Entity F1**:
   - `keyword` achieved 66.7% vs VeilGuard Full's 37.5%.
   - *Reason*: Strict multi-token financial spans (IFSC codes alongside bank names) and small test set size ($n=19$) penalize partial overlaps.
3. **India IDs Entity F1**:
   - `keyword` achieved 65.6% vs VeilGuard Full's 46.2% and Type-Based's 61.0%.
   - *Reason*: Keyword baseline flags any 12-digit number as a potential ID regardless of Verhoeff checksum. VeilGuard validates Verhoeff and Luhn checksums; while this dramatically reduces false positives on benign numbers, subtle OCR or synthetic test variations without valid checksums are rejected by design.
4. **Secrets Entity F1**:
   - `veilguard_type_based` achieved 95.1% vs `veilguard_full`'s 92.1%.
   - *Reason*: In full mode, overlapping quasi-identifier tokens in code snippets slightly affected boundary arbitration on generic key assignments.

---

## 7. Known Limitations

1. **Synthetic Dataset**: All 519 prompts (233 dev + 286 test) were synthetically authored by the engineering team.
2. **Same-Team Authorship**: Benchmarking against internal data carries intrinsic inductive bias.
3. **Small Sample Size ($N=286$)**: Per-category counts range from 18 to 56 items; Wilson 95% confidence intervals are relatively wide.
4. **Lexical Task Inference**: Task classification relies on English grammatical cues and verbs; it does not support multilingual prompts or non-standard syntax.
5. **Heuristic Re-ID Scoring**: Weights in `reid/weights.yaml` are expert heuristics, not empirical re-identification probabilities.
6. **Non-Exhaustive Medical Lexicon**: Medical term detection is dictionary-based (`data/medical_terms.txt`, 252 terms) and best-effort.
7. **Utility Heuristic**: `may_change_result` indicates heuristic risk of semantic drift, not verified against a downstream LLM generation.
8. **Statistical NER Limitations**: Standard `en_core_web_sm` requires proper capitalization to recognize personal names and lacks deep coverage for non-Western or transliterated names.
