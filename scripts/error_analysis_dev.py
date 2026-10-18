"""Detailed error analysis of VeilGuard Full vs Keyword on DEV split."""

import json
from bench.baselines.veilguard_baselines import VeilGuardFull
from bench.baselines.keyword import KeywordBaseline
from bench.run_benchmark import _get_system_predictions, _normalize_group
from bench.metrics import span_overlap, compute_entity_metrics

def analyze():
    with open("bench/data/dev.jsonl", encoding="utf-8") as f:
        records = [json.loads(line) for line in f if line.strip()]

    vg = VeilGuardFull()
    kw = KeywordBaseline()

    target_cats = ["direct_pii", "financial", "india_ids"]

    with open("docs/error_analysis_dev.txt", "w", encoding="utf-8") as out:
        for cat in target_cats:
            out.write("=" * 80 + "\n")
            out.write(f"CATEGORY: {cat}\n")
            out.write("=" * 80 + "\n")
            cat_recs = [r for r in records if r.get("category") == cat]
            out.write(f"Total items in {cat}: {len(cat_recs)}\n\n")

            # Per-record analysis
            for rec in cat_recs:
                text = rec["text"]
                gt = rec.get("expected_entities", [])
                vg_preds = _get_system_predictions(vg, rec)
                kw_preds = _get_system_predictions(kw, rec)

                # Matching
                vg_m = compute_entity_metrics(vg_preds, gt)
                kw_m = compute_entity_metrics(kw_preds, gt)

                if vg_m["fn"] > 0 or vg_m["fp"] > 0 or kw_m["fn"] > 0 or kw_m["fp"] > 0:
                    out.write(f"--- Item {rec.get('id')} ({rec.get('family')}) ---\n")
                    out.write(f"Text: {text}\n")
                    out.write(f"Gold Entities:      {gt}\n")
                    out.write(f"VG Preds (TP={vg_m['tp']}, FP={vg_m['fp']}, FN={vg_m['fn']}): {vg_preds}\n")
                    out.write(f"KW Preds (TP={kw_m['tp']}, FP={kw_m['fp']}, FN={kw_m['fn']}): {kw_preds}\n\n")

            # Also compute overall category metrics using harness method
            all_vg_preds = [p for r in cat_recs for p in _get_system_predictions(vg, r)]
            all_kw_preds = [p for r in cat_recs for p in _get_system_predictions(kw, r)]
            all_gold = [e for r in cat_recs for e in r.get("expected_entities", [])]

            vg_cat_metrics = compute_entity_metrics(all_vg_preds, all_gold)
            kw_cat_metrics = compute_entity_metrics(all_kw_preds, all_gold)

            out.write(f"OVERALL {cat} METRICS:\n")
            out.write(f"  VeilGuard Full: TP={vg_cat_metrics['tp']}, FP={vg_cat_metrics['fp']}, FN={vg_cat_metrics['fn']}, P={vg_cat_metrics['precision']:.4f}, R={vg_cat_metrics['recall']:.4f}, F1={vg_cat_metrics['f1']:.4f}\n")
            out.write(f"  Keyword:        TP={kw_cat_metrics['tp']}, FP={kw_cat_metrics['fp']}, FN={kw_cat_metrics['fn']}, P={kw_cat_metrics['precision']:.4f}, R={kw_cat_metrics['recall']:.4f}, F1={kw_cat_metrics['f1']:.4f}\n\n")

if __name__ == "__main__":
    analyze()
