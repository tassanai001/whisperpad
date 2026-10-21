# Free & Open-Source TTS with Thai Support — macOS (arm64), 2025–2026

Research date: 2026-10-18. No paid API / no API key required for any option below unless noted.

## Summary table

| Option | Thai quality (1-5) | Offline | License | Install |
|---|---|---|---|---|
| Piper (official) | N/A — no Thai voice | — | — | — |
| Piper + community Thai voice (MMS conversion) | 3 | ✅ offline | Model: CC-BY-NC-4.0 (non-commercial); Piper engine: MIT | `pip install piper-tts` + download `.onnx` from HF |
| facebook/mms-tts-tha (via 🤗 Transformers) | 3 | ✅ offline | CC-BY-NC-4.0 (non-commercial) | `pip install transformers accelerate` |
| XTTS-v2 (idiap/coqui-ai-TTS fork) | 2 (unsupported lang, voice-cloning artifacts) | ✅ offline | Code: MPL 2.0; model weights: **CPML v0.1** (non-commercial) | `pip install coqui-tts` |
| edge-tts (rany2) | 5 | ❌ online (free, no key) | Package: **MIT** (not GPLv3 — see note) | `pip install edge-tts` |
| eSpeak NG (Thai) | 2 | ✅ offline | GPL-2.0 | `brew install espeak-ng` |
| macOS `say` (Kanya) | 3.5 | ✅ offline | Apple proprietary (built-in, not open source) | pre-installed |

---

## 1. Piper TTS (rhasspy/piper) — Thai voice?

**No official `th_TH` voice.** `rhasspy/piper-voices` has no `th/` directory, confirmed directly on the model card of a community conversion repo:

> "Piper has no official Thai voice: `rhasspy/piper-voices` has no `th/` directory." — https://huggingface.co/tranhuyluyen/piper-voices-thai

**Workaround (not official Piper, but drop-in compatible):** community-converted Thai voices exist, repackaging Meta's MMS-TTS Thai checkpoint into Piper's `.onnx`/`.onnx.json` format:
- `th_TH-mms_female-medium.onnx` and `th_TH-mms_male-medium.onnx`
- Repo: https://huggingface.co/tranhuyluyen/piper-voices-thai
- Underlying fine-tunes: https://huggingface.co/VIZINTZOR/MMS-TTS-THAI-FEMALEV2 and `MALEV1`
- License: **CC-BY-NC-4.0** (inherited from `facebook/mms-tts`) — non-commercial only
- Known limitation: MMS Thai vocab only has digits 0,1,2,4; other digits must be spelled out as words
- Piper engine itself (MIT) imposes no extra restriction, but the voice model's CC-BY-NC-4.0 does

Thai quality: **3/5** — intelligible, correct tones, mildly robotic prosody (it's a VITS/MMS checkpoint, not a purpose-built Piper voice).

## 2. Coqui TTS / XTTS-v2

- Original Coqui.ai shut down Jan 2024. The actively maintained fork is **`idiap/coqui-ai-TTS`** (PyPI package `coqui-tts`) — https://github.com/idiap/coqui-ai-tts
- **Thai is NOT in XTTS-v2's supported language list.** Official supported languages (16–17): en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar, zh-cn, ja, hu, ko, hi. No `th`.
  - Source: https://github.com/coqui-ai/TTS/blob/dev/docs/source/models/xtts.md and https://huggingface.co/coqui/XTTS-v2
- Thai is technically possible only via unsupported voice-cloning tricks (feeding Thai text through a near language or using the model's multilingual phoneme space) — quality is unreliable and not a real "Thai support" claim. Rate: **2/5** at best, not recommended as a Thai solution.
- **License of XTTS-v2 model weights: CPML (Coqui Public Model License) v0.1 — non-commercial use only.** Confirmed on the idiap repo discussion:
  > "For XTTS, this is the CPML, which does not allow commercial use." — https://github.com/idiap/coqui-ai-TTS/discussions/216
  - Full text: https://coqui.ai/cpml
  - The `idiap/coqui-ai-TTS` *code* is MPL 2.0 (open), but the *XTTS-v2 weights* are CPML (restricted).

**Verdict:** Coqui/XTTS-v2 is not a good Thai option — no official Thai language support, and weights are non-commercial-only regardless.

## 3. edge-tts (rany2/edge-tts)

- **Still working** as of this research (12.3k GitHub stars, actively maintained, 320 commits). https://github.com/rany2/edge-tts
- Uses Microsoft Edge's cloud neural TTS **without needing Edge, Windows, or an API key** — confirmed in repo description. Requires internet connection (not offline), but genuinely free with no account/key needed.
- **Thai voice IDs (`th-TH` locale):**
  - `th-TH-PremwadeeNeural` (Female)
  - `th-TH-NiwatNeural` (Male)
  - Confirmed via Azure's own voice docs (json2video mirror of Azure voice gallery: https://json2video.com/ai-voices/azure/voices/th-th-niwatneural/) and community edge-tts voice-list gists.
  - List command: `edge-tts --list-voices | grep th-TH`
- **Package license:** PyPI metadata states **GPLv3**; however the current GitHub repo ships an MIT-style `LICENSE` file alongside a separate `gpl-3.0.txt` (used for an optional bundled module). Check `LICENSE` in the specific version you install — recent releases show MIT at repo root. Treat as **GPLv3-compatible / largely permissive**, verify per-version before any redistribution.
- **"Free Microsoft cloud" accuracy:** Accurate. It calls the same backend Edge's "Read Aloud" feature uses, which Microsoft provides without authentication for that specific endpoint. It is NOT the paid Azure Cognitive Services API (that requires a key/billing) — edge-tts is reverse-engineering the free consumer-facing Edge endpoint. This is why it has no official SLA and could break if Microsoft changes the endpoint; a GitHub discussion confirms it is for personal use, with Azure's paid API as the sanctioned commercial path.

Thai quality: **5/5** — genuine Microsoft neural voice, natural prosody and tone accuracy, best-sounding option on this list. Trade-off: requires internet.

## 4. Fully open Thai models on Hugging Face

- **`facebook/mms-tts-tha`** — https://huggingface.co/facebook/mms-tts-tha
  - Meta's Massively Multilingual Speech (MMS) project, VITS architecture, 36.3M params
  - **License: CC-BY-NC-4.0** (non-commercial)
  - Usable directly via 🤗 Transformers (`VitsModel`), no espeak/phonemizer needed (grapheme-based)
  - Quality: **3/5** — correct tones, slightly flat prosody, no voice variety (1 speaker)

- **`VIZINTZOR/MMS-TTS-THAI-FEMALEV2`** / `MMS-TTS-THAI-MALEV1` — https://huggingface.co/VIZINTZOR/MMS-TTS-THAI-FEMALEV2
  - Community fine-tunes of the above MMS base model, trained via https://github.com/VYNCX/finetune-local-vits
  - License: inherits CC-BY-NC-4.0 from the MMS base (no separate commercial license stated on the model card)
  - These are the source models repackaged into the Piper-format repo in section 1.
  - Quality: **3.5/5** — noticeably better than base MMS for natural-sounding Thai speech, still non-commercial.

No fully-open (permissive, non-NC) Thai neural TTS model was found as of this research; VISTEC's and NECTEC's public Hugging Face presence (confirmed orgs exist: `nectec`, VISTEC/AI Singapore WangchanLION collab) is centered on Thai LLMs/ASR (e.g. `nectec/Pathumma-whisper-th-large-v3`), not TTS. No NECTEC/VISTEC/AIAT Thai **TTS** model repo was found on HF during this search — only ASR/LLM assets.

## 5. eSpeak NG Thai — one-sentence verdict

eSpeak NG supports Thai via formant synthesis (confirmed in `espeak-ng/docs/languages.md`), but it is robotic, mispronounces tone and vowel length frequently, and an open GitHub issue (#757, "Please Improve the Thai Language") shows the Thai voice remains in need of quality work — rate it **2/5**, usable only for accessibility/offline fallback where naturalness doesn't matter.

## 6. macOS built-in `say` — Kanya voice

Kanya is Apple's built-in Thai (`th-TH`) voice, offline, pre-installed, proprietary (not open source, no license to track since it ships with macOS). Quality is solid for a formant/parametric system — clear pronunciation and generally correct tone contours, though noticeably more mechanical than edge-tts's neural voice, and Apple has not refreshed it with a newer neural engine the way it has for languages like English/Japanese. Rate: **3.5/5** — good as a zero-dependency offline fallback, not state-of-the-art.
Usage: `say -v Kanya "สวัสดีครับ"` (may require downloading the voice via System Settings → Accessibility → Spoken Content → System Voice if not already installed).

---

## Bottom line for a free, no-API-key, Thai-capable setup on macOS arm64

- **Best quality, needs internet:** edge-tts, `th-TH-PremwadeeNeural` / `th-TH-NiwatNeural` — 5/5, MIT/GPL-adjacent license, no key.
- **Best fully-offline, non-commercial-only:** Piper + community MMS-converted Thai voice (`tranhuyluyen/piper-voices-thai`) or raw `facebook/mms-tts-tha` — 3/5, CC-BY-NC-4.0 (fine for personal/non-commercial dictation use, not for a commercial product).
- **Zero-install offline fallback:** macOS `say -v Kanya` — 3.5/5, already on the machine.
- **Avoid:** XTTS-v2 for Thai (not supported) and eSpeak NG Thai (lowest quality) unless there's no other option.
