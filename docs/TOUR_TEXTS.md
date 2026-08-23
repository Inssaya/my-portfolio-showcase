# Tour narration — the 12 clips to record

Generate an MP3 for each row. Name each file **exactly** as shown in the
Filename column, then drop the whole batch into `public/tour/audio/` and run:

```
node scripts/manifest-from-audio.mjs --voice="ElevenLabs / Rachel"
```

That script measures each clip, estimates per-character caption timings and
writes `public/tour/manifest.json`. The tour picks it up on the next load.

## Notes for the voice

- All clips are **one voice**, one delivery — no character switches.
- **Male, English-only.** On ElevenLabs the best fits for this tone are
  **Adam**, **Josh** or **Brian** — natural, warm, unpolished. Avoid the
  "narrator" or "presenter" voices — they read too formally for something
  that's supposed to sound like the person himself talking.
- Deliver like a confident engineer showing his own work to someone he
  respects. Not selling, not narrating. Natural conversational pace.
- Every sentence stands alone — pauses between clips are fine, the tour
  chains them itself.
- Try segment 1 (`intro.mp3`) first. If the delivery feels right there,
  the same voice with the same settings will carry the rest.

---

## The 12 clips

| # | Filename                 | Text                                                                                                                                                                                                                              |
|---|--------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1 | `intro.mp3`              | Hey, I'm Yassine — a final-year engineering student in AI & Data Science. I like taking ideas and turning them into real-world projects that are stable, useful, and built to succeed in today's competitive world, and I'm looking for a 6-month PFE internship in Morocco or abroad, ideally with a company where I can grow, contribute, and hopefully continue working together after the internship, while also being open to freelance work. |
| 2 | `projects-list.mp3`      | These are the projects worth your time. Each one is real, running code — not a tutorial I followed.                                                                                                                               |
| 3 | `checkpoint.mp3`         | Pick the one that catches your curiosity, and I'll walk you through it.                                                                                                                                                           |
| 4 | `aptiv-intro.mp3`        | This one replaced a spreadsheet. The maintenance team at the plant was tracking every machine breakdown in Excel, by hand.                                                                                                        |
| 5 | `aptiv-slide-1.mp3`      | So I built them a platform. A technician anywhere on the plant network opens it on a phone or a PC and logs a breakdown as it happens.                                                                                            |
| 6 | `aptiv-slide-2.mp3`      | The detail I'm proudest of is the chronometer. When a technician starts a repair, the start time is written to the database on the server clock — never just held in the browser.                                                 |
| 7 | `aptiv-slide-3.mp3`      | So if their phone dies mid-repair, they log back in and the timer is still running from where it really started. And the database enforces that one technician can only have one repair open at a time.                          |
| 8 | `aptiv-slide-4.mp3`      | Supervisors get the numbers that matter, computed automatically. Mean time to repair, mean time between failures, availability, downtime rate, Pareto charts and trends.                                                          |
| 9 | `aptiv-slide-5.mp3`      | Repair time and downtime are always derived from timestamps, never typed in by hand. That's deliberate: a KPI you can edit is a KPI nobody trusts.                                                                                |
| 10 | `aptiv-slide-6.mp3`      | I also added a predictive module that ranks machines by failure risk, and an agentic assistant that searches past maintenance reports to surface similar cases and suggest likely causes.                                          |
| 11 | `aptiv-outro.mp3`        | FastAPI and PostgreSQL on the back, React and TypeScript on the front, all of it in Docker so it runs on one plant PC and survives a reboot. I validated the whole pipeline on synthetic data before it ever touched production — the real data stays on-premise. |
| 12 | `closing.mp3`            | That's the tour. If you'd like the details on paper, I can hand you my CV right now — just ask. And if you'd rather ask me something directly, the assistant in the corner knows everything I've just told you.                    |

---

## If you'd rather use ElevenLabs' UI

Paste each text, pick a voice, download, name it as shown. Do it 12 times.

**Voice:** male, English. Try **Adam**, **Josh** or **Brian**.
**Model:** `eleven_multilingual_v2` if available (better prosody),
otherwise `eleven_turbo_v2_5`.
**Settings:** stability around 0.4, similarity 0.75, style 0.15 —
lower stability lets the voice breathe; higher stability sounds like it's
reading a form.

Preview one segment (start with `checkpoint.mp3` — it's the shortest) before
committing to the voice.

## If you regenerate one line later

The manifest script keys the audio only by filename. Overwrite a single MP3
(same name), rerun `node scripts/manifest-from-audio.mjs`, done — the tour
picks it up on the next visit. Only that one clip changes.

## Total

- **12 clips**, roughly **2,400 characters**
- On ElevenLabs' pricing that runs about **$0.60** with `eleven_multilingual_v2`,
  well under the free tier's 10 000 characters per month.
