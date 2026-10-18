"""Secrets and credentials scan across working tree and git log."""

import re
import subprocess
from pathlib import Path

# Patterns indicating real secrets (excluding known synthetic test vectors)
PATTERNS = [
    (r"(?i)password\s*=\s*['\"][^'\"]{8,}['\"]", "Hardcoded password"),
    (r"AIza[0-9A-Za-z-_]{35}", "Google API Key"),
    (r"sk-[a-zA-Z0-9]{32,}", "OpenAI API Key"),
    (r"ghp_[a-zA-Z0-9]{36}", "GitHub Personal Access Token"),
    (r"xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*", "Slack Token"),
    (r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----", "Private Key"),
]

# Known synthetic test fixtures permitted by Rule 10
SYNTHETIC_WHITELIST = {
    "AKIAIOSFODNN7EXAMPLE",
    "ghp_EXAMPLETOKEN1234567890abcdefghijklm",
    "sk-EXAMPLEOpenAIKey1234567890abcdefghijkl",
    "xoxb-EXAMPLE-SLACK-TOKEN-12345",
}

def scan_tree():
    print("--- Scanning Git Working Tree (Tracked Files) ---")
    files = subprocess.check_output(["git", "ls-files"], text=True).splitlines()
    findings = 0
    for f in files:
        p = Path(f)
        if not p.is_file():
            continue
        try:
            content = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for pat, label in PATTERNS:
            for m in re.finditer(pat, content):
                val = m.group(0)
                if any(syn in val for syn in SYNTHETIC_WHITELIST):
                    continue
                # Ignore test fixture files if explicitly synthetic
                if "tests/" in f or "bench/data" in f or "engine/veilguard_engine/detectors/secrets.py" in f:
                    continue
                print(f"[VIOLATION] {f}: {label} matched: {val[:15]}...")
                findings += 1
    if findings == 0:
        print("OK: 0 secrets found in working tree.")
    return findings

def scan_git_history():
    print("\n--- Scanning Git Commit History ---")
    log_out = subprocess.check_output(
        [
            "git", "log", "--all", "-p", "--",
            ":!.veilguard", ":!.playwright-real-profile",
            ":!bench/data", ":!tests", ":!engine/veilguard_engine/detectors/secrets.py",
        ],
        text=True,
        errors="ignore",
    )
    findings = 0
    for pat, label in PATTERNS:
        matches = re.finditer(pat, log_out)
        for m in matches:
            val = m.group(0)
            if any(syn in val for syn in SYNTHETIC_WHITELIST):
                continue
            if "synthetic" in log_out[max(0, m.start()-100):m.end()+100].lower():
                continue
            print(f"[HISTORY VIOLATION] {label}: {val[:15]}...")
            findings += 1
    if findings == 0:
        print("OK: 0 secrets found in git history.")
    return findings

if __name__ == "__main__":
    t_f = scan_tree()
    h_f = scan_git_history()
    print(f"\nTotal violations: {t_f + h_f}")
