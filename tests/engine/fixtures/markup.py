"""Helper for parsing synthetic markup fixtures into clean text and exact character spans.

Allows authoring test fixtures with inline annotations such as:
    "Customer [[PERSON|Rahul Sharma]] with mobile [[IN_MOBILE|9876543210]] called."
Yields:
    clean_text: "Customer Rahul Sharma with mobile 9876543210 called."
    expected_spans: [
        ExpectedSpan(entity_type="PERSON", start=9, end=21, value="Rahul Sharma"),
        ExpectedSpan(entity_type="IN_MOBILE", start=34, end=44, value="9876543210")
    ]
Eliminates manual hand-counting of character offsets.
"""

import re
from dataclasses import dataclass
from typing import List, Tuple

MARKUP_REGEX = re.compile(r"\[\[([A-Z0-9_]+)\|([^\]]+)\]\]")


@dataclass
class ExpectedSpan:
    entity_type: str
    start: int
    end: int
    value: str


def parse_markup(annotated_text: str) -> Tuple[str, List[ExpectedSpan]]:
    """Parse annotated text into plain text and expected entity spans."""
    clean_chunks: List[str] = []
    spans: List[ExpectedSpan] = []
    current_offset = 0
    last_end = 0

    for match in MARKUP_REGEX.finditer(annotated_text):
        # Text preceding the markup tag
        preceding = annotated_text[last_end : match.start()]
        clean_chunks.append(preceding)
        current_offset += len(preceding)

        entity_type = match.group(1)
        value = match.group(2)

        span_start = current_offset
        span_end = current_offset + len(value)
        spans.append(
            ExpectedSpan(
                entity_type=entity_type,
                start=span_start,
                end=span_end,
                value=value,
            )
        )

        clean_chunks.append(value)
        current_offset += len(value)
        last_end = match.end()

    # Remaining trailing text
    trailing = annotated_text[last_end:]
    clean_chunks.append(trailing)

    clean_text = "".join(clean_chunks)
    return clean_text, spans
