# SceneOS · 60-second demo video

The submission video. Shot list, voiceover script, recording notes. Drop the published URL at the bottom once it's live.

---

## Constraints

- **Length:** 60 seconds hard, 90 seconds absolute ceiling. Devpost judges scrub videos at 2x — a 90s video is still ~45s of attention.
- **Voiceover:** ElevenLabs, single voice, calm. No live narration, no on-camera presenter. The cinematic is the subject.
- **Resolution:** 1920×1080, 30fps. Screen capture via OBS or QuickTime.
- **Audio:** voiceover at -14 LUFS. Music bed under it at -28 LUFS.

---

## Shot list (with timing)

| t (s) | Shot | What's on screen |
|------:|------|------------------|
| 0.0 – 3.0 | Cold open — landing | Black fade-in to the landing page. Cinematic cursor visible. The prompt input is empty. |
| 3.0 – 7.0 | Type the prompt | Type live: `a 90s VHS recovery memory of the day my dog ran away`. Press Enter. |
| 7.0 – 11.0 | Crumple bridge | Page-curl transition fires. Brief, no narration over it. |
| 11.0 – 18.0 | Canvas | 3D planet system rotates in. Auto-arcs to the first beat after ~2s. Drawer opens automatically. |
| 18.0 – 28.0 | Beat 1 — director conversation | Agent question appears, three suggestion pills below. Click one. Stream-thinks for ~2s, agent responds with a refined question. Click "Lock it in" to fast-forward to the next beat. |
| 28.0 – 36.0 | Time-lapse 7 beats | Fast cuts. 1 beat per ~1s. Each beat: drawer opens, click "Roll camera" if needed, clip generates, approve. Real Cloudinary URLs hitting the canvas. |
| 36.0 – 42.0 | Stitch tray | "Stitch 7/7" pill turns ember. Click. Tray slides in. The live `fl_splice` URL types itself into the chrome strip. |
| 42.0 – 50.0 | /edit route | Hairline-bordered preview, scrubber + transport row. Click a clip on the timeline, drag the trim handle. The director chat suggests a refinement. Click "Apply edit". URL re-bakes. |
| 50.0 – 56.0 | /final route | Letterbox bars slide in. The cut autoplays. Mono URL line below. Click Download MP4. |
| 56.0 – 60.0 | End card | Fade to black. SceneOS wordmark + sceneos.us. |

---

## Voiceover script

Each line maps to a shot range. Keep delivery tight.

**(0–11s)**
"One idea. One creator. One cinematic."

**(11–28s)**
"SceneOS turns your prompt into a 7-beat dramatic arc. The director asks the questions a real cinematographer would. You answer in your own words."

**(28–42s)**
"Each beat generates as a real video clip. Approve a take, the cut stitches itself — no render server, no editing software. The whole thing is one Cloudinary URL that re-bakes on the CDN as you edit."

**(42–56s)**
"Refine on the timeline. Trim, transition, look — every change rewrites the URL. Ship the cut as a single MP4."

**(56–60s)**
"SceneOS. Filmmaking, reimagined for one."

---

## Recording notes

1. **Backend warm-up.** Run `pnpm dev` in two terminals 5 minutes before recording. Vertex Gemini cold-starts add ~10s; warm calls land in 2–4s. Hit `/edit` once before recording so `/api/editor/init` is cached.
2. **Use a real prompt, not a stock demo string.** The agent's clarification logic catches single-letter inputs, but a generic "a movie about robots" produces a generic-looking arc. The 90s VHS dog memory prompt above produces a specific tonal arc that demos well.
3. **Keep the cursor moving with intent.** Don't hover. The cinematic cursor tells the visual story; aimless hovering kills the cut.
4. **Audio mute the screen recording.** Mix the voiceover + music bed in post — system sounds (Cloudinary upload chime, sonner toast click) muddy the mix.
5. **No in-shot dev tools, no console, no localhost in the URL bar.** Use `https://sceneos.us` even if you're recording locally — quickest fix is `chrome --user-data-dir=/tmp/demo` with the production URL.

---

## Voiceover generation (ElevenLabs)

- Voice: `Brian` (calm, US, mid-range) or `Daniel` (UK, slightly warmer). Pick one and stick with it.
- Stability: 0.45 (a hair of natural variation).
- Similarity: 0.8.
- Style: 0.15 (low — calm narrator register, not animated).
- Speaker boost: on.

Generate each line separately, then assemble in the editor with -300ms breath gaps between lines. Trim leading/trailing silence to ~80ms.

---

## Music bed

Pick from Cloudinary's free music library or YouTube Audio Library:
- Genre: ambient cinematic / minimal piano / soft electronic.
- BPM: 70–90.
- Key: minor (warmer with the ember palette).
- Length: ≥75s so you don't run out before the end card.

Mix the bed at -28 LUFS — it should be felt, not heard. Drop it -3dB further when the voiceover starts and back up during the silent transition between sections.

---

## Publish + link

1. Upload to YouTube as **unlisted** first. Test the embed in the Devpost preview.
2. Once approved, flip to **public** so judges can play without auth.
3. Drop the URL here:

```
https://www.youtube.com/watch?v=__REPLACE_ME__
```

4. Mirror to Devpost video field, README "Demo" section, and the "Make another" CTA's hover state if there's time.
