import { ScriptSegment } from "./types";

/**
 * The narration script for the guided tour.
 *
 * Every claim here traces back to real data — `src/lib/admin-data.ts` for the
 * profile, and the ANTIV-COMPANY-PROJECT README for the Aptiv platform. Nothing
 * is invented, because a recruiter may well ask about any sentence of it.
 *
 * Segments are short on purpose: 5–15 seconds each. That keeps the visuals
 * moving, makes regeneration cheap when one line changes, and lets a visitor
 * skip a beat without losing the thread.
 *
 * `cues` are authored against word positions, not timestamps. The pipeline
 * converts them using the real word timings, so this file never needs
 * retiming when the voice is regenerated.
 */
export const TOUR_SCRIPT: ScriptSegment[] = [
  // ------------------------------------------------------------- opening --
  // A single clip (ElevenLabs, voiced and dropped in by hand — see
  // scripts/manifest-from-audio.mjs), not synthesised like the rest of the
  // tour. `text` must stay byte-for-byte what the clip actually says: the
  // manifest's caption timing and word-anchored cues are both estimated from
  // this string's word positions, with no real transcription behind it for
  // this one segment (see that script's docstring on `timingSource`).
  {
    id: "intro",
    kind: "narration",
    text:
      "Hey, I'm Yassine — a final-year engineering student in AI & Data " +
      "Science. I like taking ideas and turning them into real-world " +
      "projects that are stable, useful, and built to succeed in today's " +
      "competitive world, and I'm looking for a 6-month PFE internship in " +
      "Morocco or abroad, ideally with a company where I can grow, " +
      "contribute, and hopefully continue working together after the " +
      "internship, while also being open to freelance work.",
    cues: [
      { afterWord: 3, type: "title", label: "Yassine Sinif" },
      { afterWord: 47, type: "fact", label: "PFE — Morocco or abroad" },
      { afterWord: 71, type: "fact", label: "Open to freelance work" },
    ],
    next: "skills-1",
  },

  // -------------------------------------------------------------- skills --
  {
    id: "skills-1",
    kind: "narration",
    text:
      "What I actually do splits into three. I build data pipelines, I build " +
      "machine learning and retrieval systems on top of them, and I ship the " +
      "web applications that put both in front of real users.",
    cues: [
      { afterWord: 8, type: "tech", label: "Data Engineering" },
      { afterWord: 14, type: "tech", label: "ML & RAG" },
      { afterWord: 24, type: "tech", label: "Full-Stack" },
    ],
    next: "skills-2",
  },
  {
    id: "skills-2",
    kind: "narration",
    text:
      "Mostly in Python and TypeScript. Postgres, Kafka and Docker on the " +
      "data side. LangChain, LangGraph and local models when the work " +
      "involves language.",
    next: "projects-intro",
  },

  // ------------------------------------------------------------ projects --
  {
    id: "projects-intro",
    kind: "narration",
    text:
      "But descriptions are cheap. Let me show you what I've actually built.",
    next: "projects-list",
  },
  {
    id: "projects-list",
    kind: "project-list",
    text:
      "These are the projects worth your time. Each one is real, running code " +
      "— not a tutorial I followed.",
    // The engine fills this cue from admin-data at runtime; the list is data,
    // not something to duplicate in the script.
    cues: [{ afterWord: 6, type: "list" }],
    next: "checkpoint",
  },
  {
    id: "checkpoint",
    kind: "checkpoint",
    text: "Pick the one that catches your curiosity, and I'll walk you through it.",
    next: null,
  },

  // ------------------------------------------- Aptiv maintenance platform --
  // Grounded in ANTIV-COMPANY-PROJECT/README.md. Screenshots live at
  // /tour/projects/aptiv-maintenance-platform/<name> — filenames match the
  // brief report's `report/brief/figures/` (see its README for the mapping
  // back to the sections they illustrate).
  {
    id: "aptiv-intro",
    kind: "project-intro",
    projectSlug: "aptiv-maintenance-platform",
    text:
      "This one replaced a spreadsheet. The maintenance team at the plant was " +
      "tracking every machine breakdown in Excel, by hand.",
    next: "aptiv-slide-1",
  },
  {
    id: "aptiv-slide-1",
    kind: "project-slide",
    projectSlug: "aptiv-maintenance-platform",
    text:
      "So I built them a platform. A technician anywhere on the plant network " +
      "opens it on a phone or a PC and logs a breakdown as it happens.",
    cues: [
      {
        afterWord: 1,
        type: "image",
        src: "/tour/projects/aptiv-maintenance-platform/01-repair-tech.jpeg",
        label: "Technician repair view",
      },
    ],
    next: "aptiv-slide-2",
  },
  {
    id: "aptiv-slide-2",
    kind: "project-slide",
    projectSlug: "aptiv-maintenance-platform",
    text:
      "The detail I'm proudest of is the chronometer. When a technician starts " +
      "a repair, the start time is written to the database on the server clock " +
      "— never just held in the browser.",
    cues: [
      {
        afterWord: 1,
        type: "image",
        src: "/tour/projects/aptiv-maintenance-platform/02-mobile-profile.jpeg",
        label: "Technician profile on mobile",
      },
    ],
    next: "aptiv-slide-3",
  },
  {
    id: "aptiv-slide-3",
    kind: "project-slide",
    projectSlug: "aptiv-maintenance-platform",
    text:
      "So if their phone dies mid-repair, they log back in and the timer is " +
      "still running from where it really started. And the database enforces " +
      "that one technician can only have one repair open at a time.",
    cues: [
      {
        afterWord: 1,
        type: "image",
        src: "/tour/projects/aptiv-maintenance-platform/06-correction-audit.png",
        label: "Correction audit trail",
      },
    ],
    next: "aptiv-slide-4",
  },
  {
    id: "aptiv-slide-4",
    kind: "project-slide",
    projectSlug: "aptiv-maintenance-platform",
    text:
      "Supervisors get the numbers that matter, computed automatically. Mean " +
      "time to repair, mean time between failures, availability, downtime " +
      "rate, Pareto charts and trends.",
    cues: [
      {
        afterWord: 1,
        type: "image",
        src: "/tour/projects/aptiv-maintenance-platform/03-dashboard-kpis.png",
        label: "KPI dashboard",
      },
      { afterWord: 9, type: "stat", label: "MTTR" },
      { afterWord: 13, type: "stat", label: "MTBF" },
      { afterWord: 19, type: "stat", label: "Availability" },
    ],
    next: "aptiv-slide-5",
  },
  {
    id: "aptiv-slide-5",
    kind: "project-slide",
    projectSlug: "aptiv-maintenance-platform",
    text:
      "Repair time and downtime are always derived from timestamps, never " +
      "typed in by hand. That's deliberate: a KPI you can edit is a KPI nobody " +
      "trusts.",
    cues: [
      {
        afterWord: 1,
        type: "image",
        src: "/tour/projects/aptiv-maintenance-platform/05-intervention-list.png",
        label: "Intervention list",
      },
    ],
    next: "aptiv-slide-6",
  },
  {
    id: "aptiv-slide-6",
    kind: "project-slide",
    projectSlug: "aptiv-maintenance-platform",
    text:
      "I also added a predictive module that ranks machines by failure risk, " +
      "and an agentic assistant that searches past maintenance reports to " +
      "surface similar cases and suggest likely causes.",
    cues: [
      {
        afterWord: 1,
        // Image swaps mid-segment: risk-list while talking about ranking,
        // assistant once the sentence turns to the agentic RAG helper.
        removeAfterWord: 12,
        type: "image",
        src: "/tour/projects/aptiv-maintenance-platform/07-risk-list.png",
        label: "Failure risk ranking",
      },
      {
        afterWord: 13,
        type: "image",
        src: "/tour/projects/aptiv-maintenance-platform/09-assistant.png",
        label: "Agentic RAG assistant",
      },
    ],
    next: "aptiv-outro",
  },
  {
    id: "aptiv-outro",
    kind: "project-outro",
    projectSlug: "aptiv-maintenance-platform",
    text:
      "FastAPI and PostgreSQL on the back, React and TypeScript on the front, " +
      "all of it in Docker so it runs on one plant PC and survives a reboot. " +
      "I validated the whole pipeline on synthetic data before it ever touched " +
      "production — the real data stays on-premise.",
    cues: [
      {
        afterWord: 1,
        type: "image",
        src: "/tour/projects/aptiv-maintenance-platform/12-architecture.png",
        label: "System architecture",
      },
      { afterWord: 1, type: "tech", label: "FastAPI" },
      { afterWord: 3, type: "tech", label: "PostgreSQL" },
      { afterWord: 8, type: "tech", label: "React + TypeScript" },
      { afterWord: 14, type: "tech", label: "Docker" },
    ],
    next: null, // returns to the checkpoint
  },

  // -------------------------------------------------------------- closing --
  {
    id: "closing",
    kind: "closing",
    text:
      "That's the tour. If you'd like the details on paper, I can hand you my " +
      "CV right now — just ask. And if you'd rather ask me something directly, " +
      "the assistant in the corner knows everything I've just told you.",
    next: null,
  },
];

/** Segments that make up each project's deep-dive, in order. */
export const PROJECT_CHAINS: Record<string, string[]> = {
  "aptiv-maintenance-platform": [
    "aptiv-intro",
    "aptiv-slide-1",
    "aptiv-slide-2",
    "aptiv-slide-3",
    "aptiv-slide-4",
    "aptiv-slide-5",
    "aptiv-slide-6",
    "aptiv-outro",
  ],
};
