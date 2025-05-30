# 🎥 AI-Powered Screen Recording Feature

Welcome to the **AI-powered Screen Recording** module for Codebro (strawberry-test).  
This document explains what the feature does, how to set it up, how to use it, and how you can extend or debug it.

---

## 1. Feature Overview

| Capability | Details |
|------------|---------|
| **Scope of capture** | Records the *entire Codebro window* (webview, toolbar, side-panels) – nothing outside the app. |
| **Duration** | Up to **5 minutes** per session (auto-stops at limit). |
| **Action tracking** | Logs clicks, navigation, typing, form submissions, copy/paste, and key shortcuts. |
| **AI analysis** | Video + action log are sent to **Google Gemini 2.0 Flash**. Gemini returns a **numbered, human-readable step list** that exactly reproduces the workflow. |
| **Zero-retention** | Recording is stored in the OS temp dir only while processing, then securely deleted. |
| **UI integration** | Record / Stop buttons, live timer, status LED, results side-panel, toast notifications. |
| **Theme support** | Fully respects light / dark themes. |
| **Security** | API key stored with `electron-store`; no key → no recording. |

---

## 2. Setup – Gemini API Key

1. Launch Codebro.  
2. Click **⚙️** in the recording toolbar **or** try to start recording – the *API Key Modal* appears.  
3. Paste your **Google Gemini API key**.  
4. Press **Save**.  
   - Key is saved globally in `browser-settings.json` (`geminiApiKey`).
5. You’re ready to record!

_Update / remove the key anytime via ⚙️._

---

## 3. How to Use the Recorder

| Step | What to do |
|------|------------|
| **1. Start** | Click **🔴 Record**. If the key is valid, the button greys out and a red *Recording* status with live timer appears. |
| **2. Perform tasks** | Browse, type, copy, paste – up to 5 minutes. Actions are logged invisibly. |
| **3. Stop** | Click **⏹️ Stop** (or wait until 5 min). |
| **4. Processing** | A toast says “Processing recording with Gemini…”. Video is encoded → sent → temp file deleted. |
| **5. Results** | The right-hand *Results Panel* slides in, listing **numbered steps**. |
| **6. Copy** | Click **Copy All Steps** to clipboard for docs or tickets. |
| **7. Record again** | Simply hit **Record**; each session is independent. |

---

## 4. Implementation Details (High-Level)

### 4.1 Architecture

```
Renderer (recording.js)                Main (main.js)
┌──────────────┐  IPC invoke         ┌──────────────┐
│ MediaRecorder│──start-recording───▶│  Validate key│
│ Action Logger│                    │ set state    │
│ UI Controls  │                    └────┬─────────┘
│              │◀─recording-status──┘    │
│              │                        desktopCapturer
│ -- after stop─process-recording───▶│ Gemini upload │
└──────────────┘                    └───────────────┘
```

### 4.2 Key Components

| File | Responsibility |
|------|----------------|
| `render/recording.js` | UI controls, `MediaRecorder`, collects chunks, logs actions, sends IPC commands, displays results. |
| `preload.js` | Exposes whitelisted IPC channels + `desktopCapturer` to renderer. |
| `main.js` | Validates API key, tracks global recording state, receives video buffer, saves to temp, calls **@google/generative-ai**, deletes file, returns instructions. |
| `styles/styles.css` | Recording UI + notifications, responsive. |

### 4.3 Action Log

```json
{
  "type": "click",
  "details": "Clicked on button#submit \"Save\"",
  "timestamp": 1034
}
```
Logged via `ipcRenderer.send('log-action', {...})` only while recording.

### 4.4 Gemini Prompt Strategy

```
I have a screen recording ... with the following user actions:

1. [0.35s] navigation: Navigated to https://google.com
2. [3.20s] click: Clicked on input#search ...

Please provide detailed numbered steps a human can follow.
```

Multimodal request parts:

1. `text` – the prompt + actions  
2. `inlineData` – base64 video (`video/webm`)  

Model: `gemini-2.0-flash-exp`, temperature 0.2, 2048 tokens.

---

## 5. Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| **“Gemini API key not set”** toast | Click ⚙️ and save a valid key. |
| **Recording doesn’t start** | Another recording running; stop first. |
| **“Could not find browser window for recording”** | Rare multi-display edge case – move Codebro to primary display and retry. |
| **No steps generated** | Gemini quota exceeded or insufficient video context. Retry after quota reset. |
| **Processing timeout / network error** | Check internet, proxy/VPN rules, Gemini service status. |
| **App exits on `Running as root without --no-sandbox`** | Run Electron with `--no-sandbox` if testing as root, or use non-root user. |

---

## 6. Developer API Reference

### 6.1 IPC Channels (Renderer ⇄ Main)

| Channel | Type | Args | Description |
|---------|------|------|-------------|
| `start-recording` | invoke | – | Begins logging mode in main. |
| `stop-recording` | invoke | – | Ends logging mode. |
| `log-action` | send | `{type, details, time}` | Append to action log. |
| `process-recording` | invoke | `{buffer, mimeType}` | Send encoded video for Gemini processing. |
| `get-screen-sources` | invoke | – | Returns available DesktopCapturer sources. |
| `set-gemini-api-key` / `get-gemini-api-key` | invoke | `string` / – | Persist / retrieve API key. |
| `recording-status-changed` | on | `{isRecording}` | Async status push. |

### 6.2 Preload Exports (`window.electron.ipcRenderer`)

All above channels are exposed **only** if whitelisted.

### 6.3 Extensibility Tips

* Add extra action trackers (e.g., scroll events) in `setupActionTracking()`.
* Swap Gemini model by editing `main.js → processRecordingWithGemini()`.
* Hook custom post-processing by listening to `recording-processed`.

---

## 7. Performance Considerations

1. **Chunk size**: MediaRecorder emits 1-second chunks; lowers memory footprint.  
2. **Codec**: Uses `video/webm;codecs=vp9` – good compression vs quality.  
3. **Auto-stop**: Hard limit prevents runaway recordings.  
4. **Async processing**: UI thread free during upload; user can keep browsing.  
5. **Temp directory cleanup**: Ensures disk space stability.  
6. **Token usage**: Prompt is concise; action log trimmed to essentials to avoid hitting Gemini token limits.

---

## 8. Security & Privacy

| Aspect | Approach |
|--------|----------|
| **API Key Storage** | Saved via `electron-store` in OS-level app data, plaintext on disk; protect your user directory. |
| **Data Sent to Gemini** | Entire video + action text are uploaded *once* per session. Google retains data per its policy (typically ≤30 days). |
| **Local Artifacts** | Recording written to system temp dir, deleted immediately after processing (or on fatal error). |
| **Scope Isolation** | Only Codebro window is captured – OS desktop, other apps, password prompts are **not** recorded. |
| **IPC Whitelisting** | Preload exposes a minimal set of channels, mitigating arbitrary code execution from web content. |
| **No Persistent Logs** | Action log lives only in memory during session. |

---

## 9. Changelog

* **v1.0** – Initial release with Gemini-powered step extraction, 5 min limit, global key management, zero-retention storage.

---

## 10. FAQ Snippets

**Q: Does it record audio?**  
A: No. Only video of the Codebro window.

**Q: Can I export the video?**  
A: Currently the temp file is deleted; modify `process-recording` if you need to keep it.

**Q: Can I increase the 5 minute limit?**  
A: Change `MAX_RECORDING_TIME` in `main.js` (milliseconds).

---

*Happy documenting!* 🚀
