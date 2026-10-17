#!/usr/bin/env bash
# VeilGuard AI: Automated One-Command Setup Script for POSIX (Linux, macOS, WSL)
set -euo pipefail

echo "===================================================="
echo "  VeilGuard AI: Automated One-Command Setup"
echo "===================================================="

# Determine project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# 1. Verify Prerequisites
echo ""
echo "[1/6] Checking system prerequisites..."

if command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
    PYTHON_CMD="python"
else
    echo "Error: Python 3.10+ is required but neither python3 nor python was found." >&2
    exit 1
fi

PY_VER=$($PYTHON_CMD -c "import sys; print('.'.join(map(str, sys.version_info[:3])))")
echo "  Found Python: ${PY_VER} (${PYTHON_CMD})"

if ! command -v node &>/dev/null; then
    echo "Error: Node.js (v18+) is required but node was not found." >&2
    exit 1
fi
if ! command -v npm &>/dev/null; then
    echo "Error: npm is required but npm was not found." >&2
    exit 1
fi

NODE_VER=$(node -v)
NPM_VER=$(npm -v)
echo "  Found Node: ${NODE_VER}, npm: ${NPM_VER}"

# 2. Virtual Environment Setup
echo ""
echo "[2/6] Configuring Python virtual environment..."
VENV_DIR="${ROOT_DIR}/.venv"
if [ ! -d "${VENV_DIR}" ]; then
    echo "  Creating virtual environment at .venv..."
    $PYTHON_CMD -m venv "${VENV_DIR}"
else
    echo "  Existing .venv detected."
fi

VENV_PYTHON="${VENV_DIR}/bin/python"
VENV_PIP="${VENV_DIR}/bin/pip"
VENV_PYTEST="${VENV_DIR}/bin/pytest"

# On Windows Git Bash compatibility
if [ ! -f "${VENV_PYTHON}" ] && [ -f "${VENV_DIR}/Scripts/python.exe" ]; then
    VENV_PYTHON="${VENV_DIR}/Scripts/python.exe"
    VENV_PIP="${VENV_DIR}/Scripts/pip.exe"
    VENV_PYTEST="${VENV_DIR}/Scripts/pytest.exe"
fi

# 3. Python Dependencies
echo ""
echo "[3/6] Installing Python engine dependencies..."
"${VENV_PYTHON}" -m pip install --upgrade pip --quiet
"${VENV_PIP}" install -r engine/requirements.txt -r engine/requirements-dev.txt --quiet
echo "  Installing spaCy language model (en_core_web_sm)..."
"${VENV_PYTHON}" -m spacy download en_core_web_sm --quiet

# 4. Node Dependencies
echo ""
echo "[4/6] Installing Node dependencies..."
npm install --silent

# 5. Extension Build
echo ""
echo "[5/6] Building Chrome extension..."
npm run build

# 6. Sanity Smoke Test
echo ""
echo "[6/6] Verifying engine installation with smoke test..."
"${VENV_PYTEST}" -q tests/engine/test_smoke.py

echo ""
echo "===================================================="
echo "  VeilGuard AI setup completed successfully!"
echo "===================================================="
echo ""
echo "Quick Start Guide:"
echo "  1. Start the local engine:"
echo "     source .venv/bin/activate && python -m veilguard_engine.server"
echo "  2. Start the mock AI chat testbed:"
echo "     npm run mock-site"
echo "  3. Load the unpacked extension in Google Chrome:"
echo "     Navigate to chrome://extensions, enable 'Developer mode', and 'Load unpacked' from: extension/dist"
echo "  4. Visit the mock site: http://127.0.0.1:4310"
echo "===================================================="
