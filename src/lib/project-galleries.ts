export interface GalleryShot {
  src: string;
  alt: string;
  caption: string;
  span?: "wide" | "tall";
}

export interface ProjectGallery {
  intro?: string;
  sections: Array<{
    title: string;
    body?: string;
    shots: GalleryShot[];
  }>;
}

const aptivBase = "/tour/projects/aptiv-maintenance-platform";

export const PROJECT_GALLERIES: Record<string, ProjectGallery> = {
  "aptiv-maintenance-platform": {
    intro:
      "The maintenance department was tracking every breakdown and every repair by hand in a shared Excel workbook — the single source of truth for the team's KPIs. The screens below are what replaces it. The interface offers a light and a dark appearance chosen by each user, which is why the views don't share a single background.",
    sections: [
      {
        title: "For the technician",
        body:
          "Recording a repair is the one thing a technician has to do, and it's designed to be done with one hand, on a phone, next to the machine. The timer runs on the server — a reload or a flat battery can never distort the recorded duration.",
        shots: [
          {
            src: `${aptivBase}/01-repair-tech.jpeg`,
            alt: "Repair screen, technician view",
            caption: "The repair screen — start, hand-over, finish. Elapsed time is a live server value, not a browser stopwatch.",
          },
          {
            src: `${aptivBase}/02-mobile-profile.jpeg`,
            alt: "Technician profile on mobile",
            caption: "The same application on a phone — one-handed use, next to the machine.",
          },
        ],
      },
      {
        title: "For the supervisor",
        body:
          "Every indicator on these screens is derived from the technicians' records. Nothing is entered by hand. Downtime and repair time are recomputed from timestamps every time they're displayed, so they can never silently disagree with the underlying record.",
        shots: [
          {
            src: `${aptivBase}/03-dashboard-kpis.png`,
            alt: "Headline KPIs — interventions, availability, MTTR, MTBF",
            caption: "Headline indicators for the selected period and scope: interventions, availability, MTTR and MTBF.",
            span: "wide",
          },
          {
            src: `${aptivBase}/04-dashboard-charts.png`,
            alt: "Dashboard charts — Pareto and weekly trend",
            caption: "Machines costing the most downtime, most frequent failure categories, weekly trend.",
            span: "wide",
          },
          {
            src: `${aptivBase}/05-intervention-list.png`,
            alt: "Filterable intervention history",
            caption: "The full intervention history — filterable by period, project, line, machine and technician.",
            span: "wide",
          },
        ],
      },
      {
        title: "Failure risk — where the value is",
        body:
          "This page is the only part of the platform that acts on the future. Each machine is scored nightly for its risk of failing within a defined horizon. Level 1 is a Weibull survival model (classical reliability, fully transparent); Level 2 is a logistic-regression / random-forest classifier trained on one row per machine per week. Which one runs is decided by a rolling backtest — the ML model only wins in production if it beats the statistical model on the department's own history. On a 24-month simulated dataset, statistical reaches ~2.2x lift and ML ~2.4x.",
        shots: [
          {
            src: `${aptivBase}/07-risk-list.png`,
            alt: "Machines ranked by failure risk",
            caption: "Machines ranked by their risk of failing within the horizon.",
          },
          {
            src: `${aptivBase}/08-risk-detail.png`,
            alt: "One machine's risk detail — score, factors, failure history",
            caption: "One machine in detail — its score, the factors behind it, and its failure history.",
          },
        ],
      },
      {
        title: "Assistant and reporting",
        body:
          "The assistant doesn't answer from general knowledge. It's given a fixed set of tools onto the department's own database (KPIs, Pareto and failure-type breakdowns, spare-part consumption, past-case retrieval with the action that fixed each, per-machine clustering) and may answer only from what those tools return. Every answer is traceable to recorded data.",
        shots: [
          {
            src: `${aptivBase}/09-assistant.png`,
            alt: "In-app assistant answering from recorded history",
            caption: "The assistant, answering from the department's own recorded history.",
          },
          {
            src: `${aptivBase}/10-weekly-report-pdf.png`,
            alt: "Weekly report PDF",
            caption: "The weekly report the platform generates as a downloadable PDF.",
          },
        ],
      },
      {
        title: "Administration",
        body:
          "The department's existing Excel workbook imports as-is, so the platform starts with the history already accumulated rather than empty. Corrections are traceable — every change is attributed and kept, so the history stays both accurate and auditable.",
        shots: [
          {
            src: `${aptivBase}/11-data-import.png`,
            alt: "Excel import with import/export audit trail",
            caption: "Importing the existing Excel workbook — with a dated trace of every import and export.",
          },
          {
            src: `${aptivBase}/06-correction-audit.png`,
            alt: "Correction audit trail",
            caption: "Correcting a recorded intervention — every change is attributed and kept.",
          },
        ],
      },
      {
        title: "Analysis and design",
        body:
          "The design artefacts, reproduced unchanged. Nine entities in the data model, of which one carries the whole design — a work segment — which is what makes a shift hand-over representable without splitting the breakdown in two. The platform is packaged as three containers behind a single origin: the application (which also serves the interface), the database, and the nightly backup — installed with one command, schema migrations applied automatically at startup.",
        shots: [
          {
            src: `${aptivBase}/13-usecase-technician.png`,
            alt: "Use-case diagram — technician",
            caption: "Use cases — technician actor.",
          },
          {
            src: `${aptivBase}/14-usecase-admin.png`,
            alt: "Use-case diagram — supervisor",
            caption: "Use cases — supervisor actor.",
          },
          {
            src: `${aptivBase}/15-class-diagram.png`,
            alt: "Design class diagram",
            caption: "Design class diagram — an intervention is a sequence of work segments.",
            span: "wide",
          },
          {
            src: `${aptivBase}/12-architecture.png`,
            alt: "Deployment architecture",
            caption: "Deployment architecture — three containers behind a single origin.",
            span: "wide",
          },
        ],
      },
    ],
  },
};
