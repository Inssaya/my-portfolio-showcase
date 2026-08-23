import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hydrateFromSupabase } from "./lib/admin-data";
import { warmUpResumeService } from "./lib/resume/api";

// Kick off the Supabase hydrate before mount, but don't await it — if the
// network is slow we still want the app on screen with cached content
// immediately. When hydrate finishes it overwrites localStorage; components
// pick up the fresh data on their next mount or route change.
void hydrateFromSupabase();

// Same idea for the CV builder's backend: ping it now, on every full page
// load, regardless of which page the visitor actually landed on. The
// frontend never waits on this — see warmUpResumeService's own comment — it
// just means a Render free-tier cold start has a head start against the
// moment the visitor actually reaches the CV builder and sends something.
warmUpResumeService();

createRoot(document.getElementById("root")!).render(<App />);
