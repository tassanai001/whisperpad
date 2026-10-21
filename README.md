# whisperpad

A tiny voice-dictation pad for macOS. Press a hotkey, speak (Thai / English), and the text is copied to your clipboard when you stop. Paste anywhere with ⌘V.

- Engine: Chrome Web Speech API (free, no API key). Falls back automatically to local [whisper.cpp](https://github.com/ggml-org/whisper.cpp) if Google's engine dies silently.
- Minimal 440×150 window docked bottom-right, grows with long text, Siri-style level bars while listening.
- Bonus: `POST /speak` text-to-speech endpoint (edge-tts).

## Files

| File | Purpose |
|---|---|
| `dictation-pad.html` | The pad UI (served by the server — Chrome blocks the mic on `file://`) |
| `stt-push-server.js` | Local server on `127.0.0.1:8917`: serves the pad, `/focus` (single-window), `/stt` (whisper), `/speak` (TTS) |
| `scripts/launcher.sh` | Opens/focuses the pad window — bind it to a hotkey (e.g. Raycast ⌥D) |
| `scripts/com.whisperpad.server.plist` | LaunchAgent to keep the server running |

## Setup

```bash
brew install node whisper-cpp ffmpeg
pip install edge-tts                      # optional, for /speak

# whisper model (~574 MB), only needed for the offline fallback
mkdir -p models && curl -L -o models/ggml-large-v3-turbo-q5_0.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin

# run the server at login
sed "s#__REPO__#$PWD#" scripts/com.whisperpad.server.plist > ~/Library/LaunchAgents/com.whisperpad.server.plist
launchctl load ~/Library/LaunchAgents/com.whisperpad.server.plist

./scripts/launcher.sh                     # open the pad
```

Allow microphone access for `localhost:8917` in Chrome on first use.
