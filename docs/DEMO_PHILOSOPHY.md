# SceneOS — Demo Philosophy

> 2-3 minute demo video for LA Hacks 2026 Devpost submission.
> Last updated: 2026-04-25.

---

## 1. The core principle

> **The demo is itself a cinematic.** Don't film a screencast. Film a trailer for SceneOS *using* SceneOS where you can.

If we can take judges from "what is this?" to "I want to make one" inside 30 seconds, the rest of the video can be a victory lap.

---

## 2. Demo arc (2:30 target, hard cap 3:00)

| Time | Beat | What's on screen | What's said / sounds |
|---|---|---|---|
| 0:00–0:08 | **Cold open hook** | Three rapid cuts: a $50K film set; a frustrated solo creator at a laptop; a Higgsfield render bar. Cut to black. | No narration. Heavy ambient cinematic riser. |
| 0:08–0:25 | **Problem statement** | Display serif italic on black: *"Cinematic videos cost $10K–$100K per finished minute."* Cut. *"And the bottleneck isn't generation."* Cut. *"It's direction."* | Single voice, calm, low. "Models can render anything. Almost no one knows how to direct them." |
| 0:25–0:35 | **Title card** | SceneOS logotype materializes from particle dust, ember glow. Tagline below: *"Direct your idea into a cinematic."* | Sound: faint analog hum + glass-tap. |
| 0:35–1:00 | **Live walkthrough — landing & canvas** | Real screen capture: paste a master prompt ("a lone astronaut on Mars"), hit submit, page-crumples away, R3F canvas reveals 5 glowing nodes. | "Pizza-ordering simplicity. One prompt. Five beats. The canvas is the product." |
| 1:00–1:25 | **Live walkthrough — agent + generation** | Click "Hook" node, drawer slides in, 2 quick agent questions, sufficiency hits, click "Generate." Cut to clip preview emerging. | "An agent encodes cinematography knowledge into the questionnaire. It stops asking when it has enough." |
| 1:25–1:45 | **Live walkthrough — stitch tray** | Top-right tray opens. Show the live-built Cloudinary `fl_splice` URL appearing letter-by-letter as clips approve. | "The final cinematic is a single Cloudinary URL. No render farm. No waiting. The post-production pipeline collapses into a transformation." |
| 1:45–2:00 | **Final reveal** | Click "Render final cinematic." The final 30-second video plays full-screen. | (Let the cinematic speak. No narration.) |
| 2:00–2:15 | **CutOS handoff (if shipping)** | Click "Open in CutOS." Brief glimpse of the CutOS timeline with our beats already loaded. Quick edit gesture. | "Power users continue in CutOS — multi-track timeline, dubbing in 29 languages, semantic search across every clip." |
| 2:15–2:30 | **Vision close** | Wide shot of the SceneOS canvas, ember nodes pulsing. Display-serif: *"Anyone can direct now."* | Final voice: "SceneOS. Anyone can direct now." |

---

## 3. Production notes

### Screen capture
- **macOS:** ScreenStudio or built-in QuickTime + 4K monitor. Cursor at 2x, smooth.
- **Windows:** OBS Studio, 60fps capture, hardware cursor magnification on.
- Capture at 4K, edit at 1080p — gives you scaling headroom.
- Hide the dock / taskbar. Full-screen browser, no tabs visible.

### Audio
- Voice-over: single take, calm, slightly low. No fake enthusiasm.
- Background bed: a license-cleared cinematic riser. Recommended: **Epidemic Sound — "Adagio"** or similar. Avoid generic stock-music swell.
- Foley layer: glass-tap on each click, faint film-projector whir under canvas scenes.

### Color
- Grade the demo video itself — slight crushed-blacks, ember-warm midtones, magenta-tinted highlights. Even the screen capture goes through this LUT.

### Cuts
- Hard cuts only. No fades, no whip-pans, no stock transitions.
- Average shot length: 1.5–2.5s. Faster than feels natural — keeps tension.
- Music drops are exactly on cuts. Sync audibly.

---

## 4. Backup plans

### If Higgsfield is down on demo day
- We have **3 pre-rendered "demo project" cinematics** stored in Cloudinary already (see `frontend/src/lib/demo-fallbacks.ts`).
- The product still works end-to-end with mock data; we narrate the same script.
- Don't admit it on camera. Live demo first; if it fails, replay the recording.

### If 3D canvas drops frames during recording
- Pre-record the canvas walkthrough at 60fps in a controlled environment, then voice-over later.

### If the page-crumple isn't ready
- Replace with a CSS-only film-burn dissolve. The crumple is the showpiece, not the substance.

---

## 5. The judge's takeaway

After watching, the judge should be able to say back to us in one breath:

> *"You took the page-crumple → 3D canvas → cinematography agent → Cloudinary-stitched URL. Anyone can direct now."*

If they can't, we re-cut.

---

## 6. Submission requirements

- 2:00–3:00 long
- 1080p minimum, 24 or 30 fps
- MP4 container, H.264 codec
- Captions / subtitles preferred (Descript or Whisper auto-generate)
- Hosted on YouTube (unlisted is fine), Vimeo, or Devpost-uploaded
- Embedded in the Devpost project page

---

## 7. Demo day prep

The **in-person judging phase** is mandatory at Pauley Pavilion. Plan a 3-minute live walk-through that mirrors the video, plus a 2-minute Q&A buffer.

- Pre-warm the dev server, log into Cloudinary, run a sanity-check demo project on the laptop being used.
- Have the demo video queued up in a separate browser tab as a fallback.
- Bring a portable hotspot — Pauley Wi-Fi cannot be trusted.
- Slack pinned: support contacts for Higgsfield + Cloudinary in case of credentials issues.
- One teammate runs the demo, one teammate handles questions, one teammate watches the timer.
