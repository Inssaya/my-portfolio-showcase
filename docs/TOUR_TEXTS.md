# Tour narration — the 18 clips to record

Generate an MP3 for each row. Name each file **exactly** as shown in the
Filename column, then drop the whole batch into `public/tour/audio/` and run:

```
node scripts/manifest-from-audio.mjs --voice="ElevenLabs / Rachel"
```

That script measures each clip, estimates per-character caption timings and
writes `public/tour/manifest.json`. The tour picks it up on the next load.

## Notes for the voice

- All clips are **one voice**, one delivery — no character switches.
- Speak like a confident, warm engineer showing their own work to someone
  they respect. Natural pace. Never salesy.
- The opening greeting is transliterated Arabic ("Marhaban") followed by
  English. Pronounce it *mar-ha-ban*. If the voice can't pronounce it
  naturally, ask me for an English-only replacement line.
- Every sentence stands alone — pauses between clips are fine, the tour
  chains them itself.

---

## The 18 clips

| # | Filename                 | Text                                                                                                                                                                                                                              |
|---|--------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1 | `greeting.mp3`           | Marhaban. Hello, and welcome.                                                                                                                                                                                                     |
| 2 | `intro-1.mp3`            | Let me introduce myself. I'm Yassine Sinif, a final-year engineering student in Artificial Intelligence and Data Science at EMSI Casablanca.                                                                                       |
| 3 | `intro-2.mp3`            | Right now I'm an AI Data Engineer intern at Aptiv, in Tangier, working inside the maintenance department of a wire-harness plant.                                                                                                 |
| 4 | `intro-3.mp3`            | And I'm looking for a six-month final-year internship starting February 2027, with the chance to stay on afterwards.                                                                                                              |
| 5 | `skills-1.mp3`           | What I actually do splits into three. I build data pipelines, I build machine learning and retrieval systems on top of them, and I ship the web applications that put both in front of real users.                                |
| 6 | `skills-2.mp3`           | Mostly in Python and TypeScript. Postgres, Kafka and Docker on the data side. LangChain, LangGraph and local models when the work involves language.                                                                              |
| 7 | `projects-intro.mp3`     | But descriptions are cheap. Let me show you what I've actually built.                                                                                                                                                             |
| 8 | `projects-list.mp3`      | These are the projects worth your time. Each one is real, running code — not a tutorial I followed.                                                                                                                               |
| 9 | `checkpoint.mp3`         | Pick the one that catches your curiosity, and I'll walk you through it.                                                                                                                                                           |
| 10 | `aptiv-intro.mp3`        | This one replaced a spreadsheet. The maintenance team at the plant was tracking every machine breakdown in Excel, by hand.                                                                                                        |
| 11 | `aptiv-slide-1.mp3`      | So I built them a platform. A technician anywhere on the plant network opens it on a phone or a PC and logs a breakdown as it happens.                                                                                            |
| 12 | `aptiv-slide-2.mp3`      | The detail I'm proudest of is the chronometer. When a technician starts a repair, the start time is written to the database on the server clock — never just held in the browser.                                                 |
| 13 | `aptiv-slide-3.mp3`      | So if their phone dies mid-repair, they log back in and the timer is still running from where it really started. And the database enforces that one technician can only have one repair open at a time.                          |
| 14 | `aptiv-slide-4.mp3`      | Supervisors get the numbers that matter, computed automatically. Mean time to repair, mean time between failures, availability, downtime rate, Pareto charts and trends.                                                          |
| 15 | `aptiv-slide-5.mp3`      | Repair time and downtime are always derived from timestamps, never typed in by hand. That's deliberate: a KPI you can edit is a KPI nobody trusts.                                                                                |
| 16 | `aptiv-slide-6.mp3`      | I also added a predictive module that ranks machines by failure risk, and an agentic assistant that searches past maintenance reports to surface similar cases and suggest likely causes.                                          |
| 17 | `aptiv-outro.mp3`        | FastAPI and PostgreSQL on the back, React and TypeScript on the front, all of it in Docker so it runs on one plant PC and survives a reboot. I validated the whole pipeline on synthetic data before it ever touched production — the real data stays on-premise. |
| 18 | `closing.mp3`            | That's the tour. If you'd like the details on paper, I can hand you my CV right now — just ask. And if you'd rather ask me something directly, the assistant in the corner knows everything I've just told you.                    |

---

## If you'd rather use ElevenLabs' UI

They let you paste text and pick a voice. Do it 18 times, name each download
after the Filename column, and that's it. Recommended voices for this tone:
**Rachel**, **Dorothy** or **Adam** (warm, conversational). Avoid the
"newscaster" voices — they sound too polished for a personal introduction.

## If you regenerate one line later

The manifest script keys the audio only by filename. Overwrite a single MP3
(same name), rerun `node scripts/manifest-from-audio.mjs`, done — the tour
picks it up on the next visit. Only that one clip changes.

## Total

- **18 clips**, roughly **2,600 characters**
- On ElevenLabs' pricing that runs about **$0.60** with `eleven_multilingual_v2`,
  well under the free tier's 10 000 characters per month.
