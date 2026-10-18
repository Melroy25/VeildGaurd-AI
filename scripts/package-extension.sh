#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=== VeilGuard AI: Extension Packaging Pipeline ==="

# 1. Build Extension
echo "Building extension dist..."
npm run build

# 2. Prepare Release Directory
mkdir -p "$ROOT_DIR/release"
DIST_DIR="$ROOT_DIR/extension/dist"
VERSION=$(node -p "require('./extension/dist/manifest.json').version")
ZIP_NAME="veilguard-extension-${VERSION}.zip"
ZIP_PATH="$ROOT_DIR/release/$ZIP_NAME"
rm -f "$ZIP_PATH"

# 3. Create INSTALL.txt
cat << 'EOF' > "$DIST_DIR/INSTALL.txt"
VeilGuard AI: Browser Extension Installation Instructions

HOW TO INSTALL IN CHROMIUM BROWSERS (Brave, Chrome, Edge, Opera):
1. Open your browser and navigate to:
   - Brave: brave://extensions
   - Chrome: chrome://extensions
   - Edge:   edge://extensions
2. Enable "Developer mode" toggle (usually in top-right corner).
3. Extract this zip file into a permanent directory on your computer.
4. Click "Load unpacked" button.
5. Select the extracted folder containing manifest.json.
6. The VeilGuard AI shield icon will appear in your extensions toolbar.

CONNECTING TO THE LOCAL ENGINE:
1. Ensure the VeilGuard Python engine is running locally:
   python -m veilguard_engine.server
2. Open the extension popup or options dashboard to confirm:
   Status: Connected (GUARD ON)
EOF

# 4. Create Archive
echo "Creating archive: $ZIP_PATH"
(cd "$DIST_DIR" && zip -r "$ZIP_PATH" ./*)
rm -f "$DIST_DIR/INSTALL.txt"

# 5. Hygiene Audit
echo ""
echo "Auditing packaged release archive contents..."
unzip -l "$ZIP_PATH"

echo "SUCCESS: Package created cleanly at $ZIP_PATH"
