# Design briefs for Claude Design

Copy-paste one brief per conversation. Each gives context, audience, and
constraints — the visual direction is Claude Design's call, not ours.

---

## Brief A — The entry gate

> I have a personal portfolio for Yassine Sinif, a final-year AI & Data
> Engineering student in Casablanca looking for a 6-month internship. Recruiters
> are the audience. The site is getting a second mode: alongside the normal
> scrollable portfolio, there will be a cinematic "guided tour" where a
> pre-generated AI voice introduces him while synchronized text reveals itself
> character by character and images appear in time with the narration.
>
> I need the **entry screen** where a visitor chooses between the two: the
> classic portfolio, or the guided experience. This is the first thing anyone
> sees, so it carries the whole first impression. The choice should feel
> genuinely tempting rather than like a settings dialog, and it must be
> immediately obvious what each option gives you — one is "read at your own
> pace", the other is "let me walk you through it, with sound".
>
> Constraints: the existing site is dark, uses a red accent, glass panels, and a
> subtle animated 3D point-cloud background. Clicking a door is what unlocks
> audio autoplay in the browser, so the click needs to feel deliberate. Needs a
> mobile and a desktop version, and a small persistent control for switching
> modes later. Implementable in React + Tailwind + shadcn/ui.

---

## Brief B — The guided tour experience

> Context: a voice-guided portfolio tour. A pre-generated AI voice narrates,
> text appears letter by letter exactly in sync with the audio, and visuals
> enter and leave in time with what is being said. It should feel like a live AI
> is presenting a candidate to a recruiter — even though every asset is
> pre-rendered. Audience: recruiters, who are impatient and often on mobile.
>
> I need designs for these states:
> 1. **The stage** — the canvas where narration text appears and visuals come and
>    go. It has to hold attention for several minutes without becoming static or
>    exhausting.
> 2. **The caption treatment** — how the character-synced text looks as it
>    reveals. This is the signature element of the whole experience.
> 3. **The project chooser** — a moment where the voice says "pick a project that
>    interests you" and a set of projects appears, each with one image, a title,
>    and a way to choose it. The pause should feel like an invitation.
> 4. **The project deep-dive** — the voice walks through one project image by
>    image, explaining how it was built and what is in it. Screenshots of app
>    interfaces are the main visual.
> 5. **Paused / interrupted state** — the visitor opened the chat to ask a
>    question, so narration has stopped and the tour is waiting.
>
> Constraints: dark theme, red accent, glass panels, existing 3D point-cloud
> background. Must work fully muted (captions have to carry it alone), must work
> on mobile, and needs an unobtrusive way to skip ahead. Implementable in React +
> Tailwind + framer-motion.

---

## Brief C — The AI assistant widget

> Context: the same portfolio has a floating AI assistant a visitor can open at
> any time, including in the middle of the voice-guided tour. Opening it stops
> the narration; the assistant receives a report of where the tour was and can
> answer recruiter questions about that project or about the candidate
> generally, grounded in his real profile data. It can also perform actions:
> send the CV as a PDF, open his GitHub, jump to a specific project, and resume
> the tour.
>
> I need: the closed floating state (it should hint that it is worth opening
> without nagging), the open conversation panel, how the tool actions appear when
> the assistant performs one (e.g. handing over a CV), and the "tour paused —
> ask me anything" state. Mobile and desktop.
>
> Constraints: dark theme, red accent, glass panels. Must not obscure the tour
> content behind it on mobile. Implementable in React + Tailwind + shadcn/ui.
