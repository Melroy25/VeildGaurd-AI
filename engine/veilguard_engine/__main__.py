"""Main entry point to run VeilGuard AI Engine via `python -m veilguard_engine`."""

import uvicorn
from veilguard_engine.config import HOST, PORT


def main() -> None:
    """Run uvicorn server bound strictly to loopback."""
    uvicorn.run("veilguard_engine.server:app", host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
