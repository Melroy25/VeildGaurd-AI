"""Unit tests for task profile inference (Phase 5 Part C1).

Validates:
- Lexical rule matching and confidence assignment (high for 2+ cues, medium for 1 cue, low for unknown/tie).
- Evidence array contains ONLY rule IDs or ['USER_HINT'], NEVER prompt text.
- task_hint override behavior.
- Evaluation over >= 40 dev prompts from bench/data/dev.jsonl.
"""

import json
from pathlib import Path
import pytest

from veilguard_engine.context.task import (
    TaskProfile,
    infer_task,
    VALID_TASKS,
    TASK_RULES,
)


def test_valid_tasks_closed_set():
    assert len(VALID_TASKS) == 11
    assert "analyze_data" in VALID_TASKS
    assert "unknown" in VALID_TASKS
    assert "general_qa" in VALID_TASKS


def test_task_hint_override():
    res = infer_task("Analyze these financial transactions", task_hint="summarize")
    assert res.type == "summarize"
    assert res.confidence == "high"
    assert res.evidence == ["USER_HINT"]


def test_invalid_task_hint_falls_back():
    res = infer_task("Analyze these financial transactions", task_hint="make_coffee")
    assert res.type == "analyze_data"
    assert res.confidence in ("high", "medium")
    assert res.evidence != ["USER_HINT"]


def test_evidence_never_contains_raw_text():
    sample_texts = [
        "Analyze customer Rahul Sharma's account 9876543210 and transaction history.",
        "Debug this snippet: aws_access_key_id = AKIAIOSFODNN7EXAMPLE",
        "Verify Aadhaar 4057 7563 3082 for KYC.",
        "Draft a performance review for the HR manager.",
    ]
    all_rule_ids = {rid for rules in TASK_RULES.values() for rid, _ in rules} | {"USER_HINT"}
    for text in sample_texts:
        res = infer_task(text)
        for ev in res.evidence:
            assert ev in all_rule_ids, f"Evidence {ev} is not a valid rule ID!"
            assert ev not in text, f"Evidence {ev} leaked text from prompt!"


def test_unknown_on_no_match():
    res = infer_task("The quick brown fox jumps over the lazy dog.")
    assert res.type == "unknown"
    assert res.confidence == "low"
    assert res.evidence == []


def test_two_cues_give_high_confidence():
    # 'analyze' (verb T_ANALYZE_01) and 'spending patterns' (object T_ANALYZE_02)
    res = infer_task("Analyze the spending patterns of our top customers.")
    assert res.type == "analyze_data"
    assert res.confidence == "high"
    assert len(res.evidence) >= 2


def test_single_cue_gives_medium_confidence():
    # Only 'analyze' verb
    res = infer_task("Analyze this scenario carefully.")
    assert res.type == "analyze_data"
    assert res.confidence == "medium"
    assert len(res.evidence) == 1


def test_verify_identifier_kyc():
    res = infer_task("Verify Aadhaar 4057 7563 3082 for KYC.")
    assert res.type == "verify_identifier"
    assert res.confidence == "high"


def test_debug_code_snippet():
    res = infer_task("Debug this snippet: import boto3; client = boto3.client('s3')")
    assert res.type == "debug_code"
    assert res.confidence == "high"


def test_draft_message_email():
    res = infer_task("Send the weekly report to Aarav Shukla at aarav.shukla@globex.example please.")
    assert res.type == "draft_message"
    assert res.confidence in ("high", "medium")


def test_rewrite_edit_concise():
    res = infer_task("Rewrite this paragraph to be more concise and polish the style.")
    assert res.type == "rewrite_edit"
    assert res.confidence == "high"


def test_summarize_tldr():
    res = infer_task("Summarize the meeting notes. TL;DR is required.")
    assert res.type == "summarize"
    assert res.confidence == "high"


def test_dev_prompts_corpus():
    """Verify inference on at least 40 prompts from bench/data/dev.jsonl."""
    dev_path = Path(__file__).resolve().parent.parent.parent / "bench" / "data" / "dev.jsonl"
    assert dev_path.exists(), "dev.jsonl must exist"

    items = []
    with open(dev_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                items.append(json.loads(line))

    assert len(items) >= 40, f"Expected at least 40 dev items, got {len(items)}"

    # Evaluate the first 60 dev items
    test_subset = items[:60]
    matched_count = 0
    for item in test_subset:
        res = infer_task(item["text"])
        assert res.type in VALID_TASKS
        assert res.confidence in ("high", "medium", "low")
        for ev in res.evidence:
            assert ev.startswith("T_") or ev == "USER_HINT"

        if res.type == item["task_type"]:
            matched_count += 1

    # Dev accuracy over subset should be at least 70%
    accuracy = matched_count / len(test_subset)
    assert accuracy >= 0.70, f"Expected >= 70% accuracy on dev subset, got {accuracy:.1%}"
