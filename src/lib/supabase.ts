import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Single Supabase client for the whole app.
 *
 * The URL and anon key are safe to ship to the browser — Supabase enforces
 * everything through Row-Level Security policies on the database itself, not
 * through key secrecy. The service_role key is a different story and must
 * never appear in this bundle.
 *
 * If the env vars aren't set, `supabase` is null and the data-access layer
 * falls back to the previous localStorage behaviour — so a build without
 * Supabase configured still runs (useful for local UI work, previews, and
 * anyone forking the repo without setting up their own project).
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Reads the ?access_token=... hash Supabase drops back after an OAuth
          // or magic-link redirect, then rewrites the URL to hide the token
          // from history — irrelevant for password login but free to keep on.
          detectSessionInUrl: true,
        },
      })
    : null;

/** True when the frontend has real Supabase credentials — the data layer
 *  uses this to decide between remote reads/writes and the localStorage
 *  fallback. */
export const supabaseEnabled = supabase !== null;
