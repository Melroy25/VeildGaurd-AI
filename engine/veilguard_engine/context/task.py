"""Task inference module for VeilGuard context intelligence (Phase 5).

Infers user task type from prompt text using deterministic, ordered lexical rules.

Design & Constraints:
- Inference is strictly lexical, deterministic, and English-only.
- Closed set of 11 valid task types.
- Two independent cues -> confidence 'high'.
- One cue -> confidence 'medium'.
- Zero cues or tie between tasks -> task 'unknown', confidence 'low'.
- Output evidence list contains rule IDs ONLY, never prompt or sensitive text.
- Optional task_hint explicitly overrides inference with confidence 'high' and evidence ['USER_HINT'].
"""

from __future__ import annotations

import re
from typing import List, Literal, Optional, Tuple, Pattern
from pydantic import BaseModel, Field

# ─── Closed set of valid task types ──────────────────────────────────────────

VALID_TASKS = {
    "analyze_data",
    "summarize",
    "draft_document",
    "draft_message",
    "rewrite_edit",
    "debug_code",
    "verify_identifier",
    "lookup_contact",
    "translate",
    "general_qa",
    "unknown",
}


class TaskProfile(BaseModel):
    """Inferred or specified task profile for a prompt."""

    type: str = Field(description="Task type from the closed set of 11 valid types")
    confidence: Literal["high", "medium", "low"] = Field(
        description="Confidence level based on number of independent cues"
    )
    evidence: List[str] = Field(
        default_factory=list,
        description="List of matching rule IDs or ['USER_HINT']. NEVER raw text.",
    )


# ─── Ordered, ID'd Lexical Rules ──────────────────────────────────────────────

TASK_RULES: dict[str, list[Tuple[str, Pattern[str]]]] = {
    "analyze_data": [
        ("T_ANALYZE_01", re.compile(r"\b(analy[zs]e|analysis|identif(?:y|ying)\s+patterns|evaluat(?:e|ing)\s+trends|find\s+correlations|extract\s+insights|assess\s+spending)\b")),
        ("T_ANALYZE_02", re.compile(r"\b(spending\s+patterns?|metrics|correlations?|trends?|breakdown\s+of|dataset|transaction\s+history|customer\s+data|purchase\s+history|financial\s+data|quarterly\s+expenses|transactions\s+for)\b")),
    ],
    "summarize": [
        ("T_SUMMARIZE_01", re.compile(r"\b(summari[zs](?:e|ing)|give\s+(?:a\s+)?summary|provide\s+(?:an?\s+)?(?:abstract\s+)?summary|recap|abstract\s+summary)\b")),
        ("T_SUMMARIZE_02", re.compile(r"\b(tl;?dr|key\s+takeaways?|executive\s+summary|brief\s+overview|in\s+short|research\s+paper)\b")),
    ],
    "draft_document": [
        ("T_DRAFT_DOC_01", re.compile(r"\b(draft|write\s+(?:an?\s+)?(?:appraisal|support\s+letter|memo|report|proposal|contract|agreement|offer\s+letter|bio)|prepare\s+(?:a\s+)?(?:memo|proposal|contract|document|report)|generate\s+(?:a\s+)?(?:medical\s+)?(?:discharge\s+)?(?:summary|report|record)|update\s+(?:her|his|the)?\s+designation)\b")),
        ("T_DRAFT_DOC_02", re.compile(r"\b(performance\s+review|annual\s+review|appraisal|support\s+letter|offer\s+letter|vendor\s+master|registration\s+update|employee\s+record|clinical\s+note|diagnosed\s+with)\b")),
    ],
    "draft_message": [
        ("T_DRAFT_MSG_01", re.compile(r"\b(send(?:\s+the|\s+it\s+to)?\s+(?:weekly\s+report|message|email|slack|update)|write\b.*\b(?:email|message|reply|congratulations)|draft\b.*\b(?:email|message|reply|note)|compose\b.*\b(?:email|message))\b")),
        ("T_DRAFT_MSG_02", re.compile(r"\b(please\s+pay\s+via|slack\s+bot|slack\s+token|join\s+room|subject:|dear\s+[a-z]+|reply\s+to\s+[a-z]+|meeting\s+is\s+at)\b")),
    ],
    "rewrite_edit": [
        ("T_REWRITE_01", re.compile(r"\b(rewrite|paraphrase|edit(?:\s+this)?|proofread|polish)\b")),
        ("T_REWRITE_02", re.compile(r"\b(to\s+be\s+more\s+concise|make\s+this\s+(?:sound\s+)?(?:more\s+)?(?:formal|professional|polite)|correct\s+grammar|improve\s+phrasing|rephrase)\b")),
    ],
    "debug_code": [
        ("T_DEBUG_01", re.compile(r"\b(debug(?:\s+this)?|fix\s+this\s+(?:error|bug|issue|exception|snippet)|troubleshoot)\b")),
        ("T_DEBUG_02", re.compile(r"\b(snippet:|import\s+[a-z0-9_]+|boto3|aws_access_key|traceback|syntaxerror|typeerror|is\s+[a-z0-9_=-]+\s+valid|push\s+to\s+main)\b")),
    ],
    "verify_identifier": [
        ("T_VERIFY_ID_01", re.compile(r"\b(verify|validate|check\s+validity|check\s+if\s+valid|is\s+an?\s+invalid)\b")),
        ("T_VERIFY_ID_02", re.compile(r"\b(for\s+kyc|aadhaar|pan|gstin|passport|checksum|voter\s+id|ifsc)\b")),
    ],
    "lookup_contact": [
        ("T_LOOKUP_01", re.compile(r"\b(look\s*up|find(?:\s+the)?\s+(?:contact|phone|email)|search\s+for|get|fetch)\b")),
        ("T_LOOKUP_02", re.compile(r"\b(contact(?:\s+details|\s+info)?|phone\s+number|email\s+(?:address)?|directory|customer\'s\s+full\s+name)\b")),
    ],
    "translate": [
        ("T_TRANSLATE_01", re.compile(r"\b(translate|translation)\b")),
        ("T_TRANSLATE_02", re.compile(r"\b((?:into|to|in)\s+(?:spanish|french|german|hindi|japanese|chinese|english|italian|portuguese|russian))\b")),
    ],
    "general_qa": [
        ("T_QA_01", re.compile(r"\b(what\s+(?:is|are|were|was)|how\s+(?:do|can|to|does|is)|why\s+(?:is|does|are|do)|explain|tell\s+me\s+about|who\s+(?:is|was)|where\s+(?:is|can)|when\s+(?:did|is)|can\s+we\s+use|track\s+via|does\s+not\s+match)\b")),
        ("T_QA_02", re.compile(r"\b(can\s+you\s+(?:help|answer|explain)|team-building|my\s+name\s+is|order\s+#|product\s+code)\b")),
    ],
}


def infer_task(text: str, task_hint: Optional[str] = None) -> TaskProfile:
    """Infer task profile from text or honor task_hint.

    Parameters:
        text: Prompt text to analyze.
        task_hint: Optional caller-provided hint from VALID_TASKS.

    Returns:
        TaskProfile with type, confidence, and rule ID evidence list.
    """
    if task_hint is not None and task_hint.strip():
        hint = task_hint.strip()
        if hint in VALID_TASKS:
            return TaskProfile(type=hint, confidence="high", evidence=["USER_HINT"])

    text_lower = text.lower()
    matches: dict[str, list[str]] = {}

    for task, rules in TASK_RULES.items():
        matched_rules = [rid for rid, pat in rules if pat.search(text_lower)]
        if matched_rules:
            matches[task] = matched_rules

    if not matches:
        return TaskProfile(type="unknown", confidence="low", evidence=[])

    # If specialized tasks matched, prioritize them over general_qa unless general_qa has more cues
    specialized = {k: v for k, v in matches.items() if k != "general_qa"}
    target_pool = specialized if specialized else matches

    sorted_tasks = sorted(target_pool.items(), key=lambda kv: len(kv[1]), reverse=True)
    top_task, top_rules = sorted_tasks[0]
    top_count = len(top_rules)

    # Check for tie among top candidates
    if len(sorted_tasks) > 1 and len(sorted_tasks[1][1]) == top_count:
        return TaskProfile(type="unknown", confidence="low", evidence=[])

    conf: Literal["high", "medium", "low"] = "high" if top_count >= 2 else "medium"
    return TaskProfile(type=top_task, confidence=conf, evidence=top_rules)
