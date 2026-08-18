import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hydrateFromSupabase } from "./lib/admin-data";

// Kick off the Supabase hydrate before mount, but don't await it — if the
// network is slow we still want the app on screen with cached content
// immediately. When hydrate finishes it overwrites localStorage; components
// pick up the fresh data on their next mount or route change.
void hydrateFromSupabase();

createRoot(document.getElementById("root")!).render(<App />);
