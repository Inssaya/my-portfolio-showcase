-- =============================================================================
-- ADMIN READ ACCESS to CV sessions/messages.
--
-- CV users can already read only their OWN cv_sessions/cv_messages (the "own
-- sessions"/"own messages" policies). This ADDS a second, read-only path for
-- the admin, so:
--   * the cv-service /admin/resume/{id}.pdf endpoint can load any user's draft
--     with the admin's own JWT (no service_role key needed), and
--   * the admin panel can read transcripts directly if ever needed.
--
-- SELECT only — the admin never writes to a user's CV. Gated on is_admin(),
-- so a normal CV user is unaffected. Requires is_admin() to already exist
-- (from setup.sql / harden-rls.sql).
--
-- Run: Supabase SQL Editor → paste → Run. Idempotent.
-- =============================================================================

drop policy if exists "admin read sessions" on public.cv_sessions;
create policy "admin read sessions" on public.cv_sessions
  for select to authenticated using (public.is_admin());

drop policy if exists "admin read cv messages" on public.cv_messages;
create policy "admin read cv messages" on public.cv_messages
  for select to authenticated using (public.is_admin());
