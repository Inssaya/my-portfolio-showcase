-- =============================================================================
-- SECURITY HOTFIX — restrict admin data to the single admin account.
--
-- WHY: the CV builder enabled public sign-up (anyone can create a Supabase
-- auth account at /cv-builder/signup). The original policies granted blanket
-- access to the `authenticated` role, which used to mean "the admin" but now
-- means "any visitor who signed up". That let any CV user read the contact
-- inbox and edit/delete all portfolio content directly through the anon key,
-- without ever touching the admin UI.
--
-- WHAT: every admin-only policy is re-keyed on is_admin(), which checks the
-- email claim in the caller's signed JWT. CV users keep access to their OWN
-- cv_sessions / cv_messages (those policies were already correct) and nothing
-- else. The public keeps read access to portfolio content and insert access
-- to the contact form.
--
-- HOW TO APPLY: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Idempotent: safe to re-run. After running, verify with the SELECT at the
-- bottom that no policy still references the bare `authenticated` role with a
-- `true` qualifier.
-- =============================================================================


-- The single source of truth for "is this request the site owner?".
-- STABLE + fixed search_path so it's safe to call from within RLS policies.
-- Keyed on the email claim: a user cannot forge it (the JWT is signed by
-- Supabase Auth) and cannot change their email to the admin's without
-- controlling the admin's inbox (Supabase requires confirming a new email).
create or replace function public.is_admin() returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'yassinsinif4@gmail.com';
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;


-- ---------------------------------------------------- content tables --------
-- Public read stays; writes become admin-only. Drop BOTH the old and new
-- policy names so this is safe whether or not the hotfix ran before.
do $$
declare
  content_table text;
begin
  foreach content_table in array array[
    'projects', 'about_cards', 'education', 'experience',
    'skill_categories', 'certificates', 'hero', 'social_links'
  ] loop
    execute format('drop policy if exists "auth write" on public.%I', content_table);
    execute format('drop policy if exists "admin write" on public.%I', content_table);
    execute format('drop policy if exists "public read" on public.%I', content_table);

    execute format(
      'create policy "public read" on public.%I for select using (true)',
      content_table
    );
    execute format(
      'create policy "admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      content_table
    );
  end loop;
end $$;


-- ---------------------------------------------------------- messages --------
-- Insert stays open (the public contact form). Read/update/delete become
-- admin-only — this closes the contact-inbox PII leak.
drop policy if exists "anyone can send"      on public.messages;
drop policy if exists "auth read messages"   on public.messages;
drop policy if exists "auth update messages" on public.messages;
drop policy if exists "auth delete messages" on public.messages;
drop policy if exists "admin read messages"   on public.messages;
drop policy if exists "admin update messages" on public.messages;
drop policy if exists "admin delete messages" on public.messages;

create policy "anyone can send" on public.messages
  for insert to anon, authenticated with check (true);

create policy "admin read messages" on public.messages
  for select to authenticated using (public.is_admin());

create policy "admin update messages" on public.messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admin delete messages" on public.messages
  for delete to authenticated using (public.is_admin());


-- ----------------------------------------------------- storage bucket -------
-- Public read (so <img> works), admin-only writes. Prevents any CV user from
-- uploading arbitrary files to a bucket served from the owner's domain.
drop policy if exists "public read images"  on storage.objects;
drop policy if exists "auth upload images"  on storage.objects;
drop policy if exists "auth update images"  on storage.objects;
drop policy if exists "auth delete images"  on storage.objects;
drop policy if exists "admin upload images" on storage.objects;
drop policy if exists "admin update images" on storage.objects;
drop policy if exists "admin delete images" on storage.objects;

create policy "public read images" on storage.objects
  for select using (bucket_id = 'images');

create policy "admin upload images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'images' and public.is_admin());

create policy "admin update images" on storage.objects
  for update to authenticated
  using (bucket_id = 'images' and public.is_admin())
  with check (bucket_id = 'images' and public.is_admin());

create policy "admin delete images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'images' and public.is_admin());


-- ------------------------------------------------------------ verify --------
-- Should return ZERO rows. Any row means a table still grants write/read to
-- every authenticated user with a `true` qualifier — i.e. still exploitable.
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
  and roles::text[] @> array['authenticated']
  and cmd <> 'SELECT'
  and coalesce(qual, 'true') = 'true'
  and policyname not in ('anyone can send');
