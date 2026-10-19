# VeilGuard AI: Windows Desktop Application & Sidebar

The VeilGuard AI Windows Desktop Suite provides system-level privacy protection across desktop AI apps, browser windows, and clipboard transfers.

---

## 1. Overview & Architecture

While the Chrome extension safeguards in-browser AI interactions, the Windows application extends protection to native desktop clients (e.g., ChatGPT desktop app, Slack, Microsoft Copilot, Discord, and terminal prompts).

### Core Modules
- `desktop/app_main.py`: Main desktop orchestrator, system tray icon integration, and configuration window.
- `desktop/sidebar_guard.py`: A frameless, slide-out sidebar that docks cleanly to the edge of the screen for rapid prompt sanitization and live policy switching.
- `desktop/guard_core.py`: Background worker that monitors clipboard operations and active foreground windows, detecting sensitive data in transit before it is pasted into AI applications.

---

## 2. Desktop Sidebar Features

- **Edge-Docked Workspace**: Automatically positions itself at the right boundary of the primary display (`width: 380px`), staying out of the way of your active workflow.
- **Global Hotkey Toggle**: Toggle the sidebar into view instantly using `Win + Alt + V` (or customizable shortcut).
- **Interactive Prompt Sanitizer**:
  - Paste any raw text or code block.
  - View real-time entity detections and risk level indicators (Low, Medium, High).
  - Inspect sanitized diff with synthetic pseudonyms.
  - One-click copy sanitized prompt back to clipboard.
- **Active Policy Switcher**: Quickly switch between `Balanced`, `Strict`, and `Developer` profiles directly from the sidebar.

---

## 3. System Tray & Background Service

- **Minimal Footprint**: Runs unobtrusively in the Windows Notification Area (System Tray).
- **Engine Status Indicator**: The tray icon reflects the health of the local VeilGuard engine (Green = Connected, Yellow = Connecting, Red = Offline / Fail-Closed).
- **Background Launchers**:
  - `Launch-VeilGuard-Desktop.bat`: Launches the desktop app directly.
  - `Start-VeilGuard-Background.bat`: Starts both the local engine and desktop sidebar concurrently in background mode.
  - `Stop-VeilGuard.bat`: Gracefully terminates all background VeilGuard processes.
  - `Enable-AutoStart.bat`: Configures VeilGuard to run quietly at user login via the Windows Startup folder.

---

## 4. Building from Source & Packaging

The desktop application can be built into a standalone Windows executable using PyInstaller:

```powershell
# In the repository root with virtual environment activated:
.\.venv\Scripts\pyinstaller VeilGuard.spec
```

The resulting executable is generated in `dist/VeilGuard/VeilGuard.exe`.

### Windows SmartScreen & Code Signing Note
Because this is an open-source research and hackathon release, the standalone executable binary is not signed with a commercial EV code signing certificate.
- Windows Defender / SmartScreen may display an "Unrecognized app" prompt when running the binary for the first time.
- Users can click **"More info" -> "Run anyway"**, or run the application directly from source using Python (`python desktop/app_main.py`).
- Exact SHA-256 checksums are published with every GitHub Release for cryptographic verification.
