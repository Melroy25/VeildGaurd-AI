"""Configuration settings for VeilGuard local privacy engine.

Enforces security invariant: Engine binds strictly to loopback (127.0.0.1).
"""

HOST: str = "127.0.0.1"
PORT: int = 8765
VERSION: str = "0.0.1"
DEBUG: bool = False
