"""Configuration settings for VeilGuard local privacy engine.

Enforces security invariant: Engine binds strictly to loopback (127.0.0.1).
"""

import os
from pathlib import Path

HOST: str = "127.0.0.1"
PORT: int = 8765
VERSION: str = "0.0.1"
DEBUG: bool = False

# NLP / spaCy configuration (overridable via VEILGUARD_SPACY_MODEL)
SPACY_MODEL: str = os.getenv("VEILGUARD_SPACY_MODEL", "en_core_web_sm")

# Watchlist configuration path
WATCHLIST_PATH: str = os.getenv("VEILGUARD_WATCHLIST", "policies/watchlist.yaml")

# Authentication token configuration
TOKEN_ENV_VAR: str = "VEILGUARD_TOKEN"
TOKEN_FILE_PATH: str = os.getenv("VEILGUARD_TOKEN_FILE", ".veilguard/token")
