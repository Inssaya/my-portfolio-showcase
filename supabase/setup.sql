-- =============================================================================
-- PORTFOLIO — COMPLETE ONE-SHOT SETUP
--
-- THE one file. Run it and it does everything:
--   1. All tables (portfolio content, messages, CV builder, uploads)
--   2. The is_admin() gate + all hardened RLS policies
--   3. The public "images" storage bucket + policies
--   4. Every admin function (user management, CV/chat/upload review, and the
--      purge for abandoned guest accounts)
--   5. The admin login account (only if you set a password below)
--   6. Verifies nothing is left wide open
--
-- HOW: Supabase Dashboard → SQL Editor → New query → paste ALL of this → Run.
-- Idempotent: safe to re-run any time (nothing is duplicated or overwritten).
--
-- ADMIN PASSWORD: to create the login the first time, set admin_password in
-- the ADMIN ACCOUNT block near the bottom (search CHANGE_ME). If the admin
-- already exists, that block leaves it untouched — so re-running is always
-- safe, and you never have to keep a real password in this file.
--
-- Auth model: this project allows public sign-up (the CV builder), so the
-- `authenticated` role means "any visitor with an account", NOT "the admin".
-- Every admin-only policy is keyed on is_admin() (your email in the signed
-- JWT). Never grant write/inbox access to bare `authenticated` with `true`.
-- Keep the admin email in sync with src/lib/adminRole.ts.
-- =============================================================================


-- --------------------------------------------------------------- helpers ----

create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- "Is this request the site owner?" — single source of truth for every
-- admin-only policy. A user cannot forge the email claim (JWT is signed by
-- Supabase Auth) nor change it to the admin's without controlling that inbox.
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


-- --------------------------------------------------------------- tables -----

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text not null,
  long_description text,
  tech text[] not null default '{}',
  status text not null check (status in ('En cours', 'Terminé')),
  category text not null check (category in ('Personnel', 'Académique', 'Internship')),
  image text,
  demo_url text,
  github_url text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_position_idx on public.projects(position);
drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table if not exists public.about_cards (
  id uuid primary key default gen_random_uuid(),
  icon text not null check (icon in ('Briefcase', 'Globe', 'Award')),
  title text not null,
  content text not null,
  position integer not null default 0
);
create index if not exists about_cards_position_idx on public.about_cards(position);

create table if not exists public.education (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  title text not null,
  institution text not null,
  description text not null default '',
  position integer not null default 0
);
create index if not exists education_position_idx on public.education(position);

create table if not exists public.experience (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  title text not null,
  company text not null,
  location text not null default '',
  bullets text[] not null default '{}',
  position integer not null default 0
);
create index if not exists experience_position_idx on public.experience(position);

create table if not exists public.skill_categories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  skills text[] not null default '{}',
  position integer not null default 0
);
create index if not exists skill_categories_position_idx on public.skill_categories(position);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  issuer text not null,
  position integer not null default 0
);
create index if not exists certificates_position_idx on public.certificates(position);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text not null default '',
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_created_at_idx on public.messages(created_at desc);
create index if not exists messages_read_idx on public.messages(read);

create table if not exists public.hero (
  id integer primary key default 1 check (id = 1),
  subtitle text not null,
  title text not null,
  title_highlight text not null,
  description text not null
);

create table if not exists public.social_links (
  id integer primary key default 1 check (id = 1),
  github text not null default '',
  linkedin text not null default '',
  email text not null default '',
  phone text not null default '',
  location text not null default ''
);


-- ------------------------------------------------------------ enable RLS ----

alter table public.projects enable row level security;
alter table public.about_cards enable row level security;
alter table public.education enable row level security;
alter table public.experience enable row level security;
alter table public.skill_categories enable row level security;
alter table public.certificates enable row level security;
alter table public.messages enable row level security;
alter table public.hero enable row level security;
alter table public.social_links enable row level security;


-- ----------------------------------------------------- policies (content) ---
-- Public reads; admin-only writes.

do $$
declare
  content_table text;
begin
  foreach content_table in array array[
    'projects', 'about_cards', 'education', 'experience',
    'skill_categories', 'certificates', 'hero', 'social_links'
  ] loop
    execute format('drop policy if exists "public read" on public.%I', content_table);
    execute format('drop policy if exists "auth write" on public.%I', content_table);
    execute format('drop policy if exists "admin write" on public.%I', content_table);
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


-- ---------------------------------------------------- policies (messages) --
-- Public can INSERT (contact form) but not read. Admin-only read/update/delete.

drop policy if exists "anyone can send" on public.messages;
drop policy if exists "auth read messages" on public.messages;
drop policy if exists "auth update messages" on public.messages;
drop policy if exists "auth delete messages" on public.messages;
drop policy if exists "admin read messages" on public.messages;
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


-- ------------------------------------------------------- storage bucket ----
-- Public read (so <img src> works), admin-only writes.

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

drop policy if exists "public read images" on storage.objects;
drop policy if exists "auth upload images" on storage.objects;
drop policy if exists "auth update images" on storage.objects;
drop policy if exists "auth delete images" on storage.objects;
drop policy if exists "admin upload images" on storage.objects;
drop policy if exists "admin update images" on storage.objects;
drop policy if exists "admin delete images" on storage.objects;

create policy "public read images" on storage.objects
  for select using (bucket_id = 'images');

create policy "admin upload images" on storage.objects
  for insert to authenticated with check (bucket_id = 'images' and public.is_admin());

create policy "admin update images" on storage.objects
  for update to authenticated using (bucket_id = 'images' and public.is_admin()) with check (bucket_id = 'images' and public.is_admin());

create policy "admin delete images" on storage.objects
  for delete to authenticated using (bucket_id = 'images' and public.is_admin());


-- ------------------------------------------------------- CV builder tables --
-- Each CV user sees only their OWN sessions/messages (auth.uid() = user_id).

create table if not exists public.cv_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft jsonb not null default '{}'::jsonb,
  style text not null default 'modern',
  language text not null default 'en',
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  pdf_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cv_sessions_user_idx on public.cv_sessions(user_id, updated_at desc);
drop trigger if exists cv_sessions_updated_at on public.cv_sessions;
create trigger cv_sessions_updated_at before update on public.cv_sessions
  for each row execute function public.set_updated_at();

create table if not exists public.cv_messages (
  id bigserial primary key,
  session_id uuid not null references public.cv_sessions(id) on delete cascade,
  role text not null,
  content text not null default '',
  tool_name text,
  tool_arguments jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cv_messages_session_idx on public.cv_messages(session_id, id);

alter table public.cv_sessions enable row level security;
alter table public.cv_messages enable row level security;

drop policy if exists "own sessions" on public.cv_sessions;
create policy "own sessions" on public.cv_sessions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own messages" on public.cv_messages;
create policy "own messages" on public.cv_messages
  for all to authenticated using (
    exists (select 1 from public.cv_sessions s where s.id = session_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.cv_sessions s where s.id = session_id and s.user_id = auth.uid())
  );

-- Admin read-only access (for the admin panel + /admin/resume PDF endpoint).
-- SELECT only, gated on is_admin(); normal CV users are unaffected.
drop policy if exists "admin read sessions" on public.cv_sessions;
create policy "admin read sessions" on public.cv_sessions
  for select to authenticated using (public.is_admin());

drop policy if exists "admin read cv messages" on public.cv_messages;
create policy "admin read cv messages" on public.cv_messages
  for select to authenticated using (public.is_admin());

-- Uploaded files kept for admin review (admin-only review of uploaded files).
create table if not exists public.cv_uploads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cv_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  content_type text,
  byte_size integer not null default 0,
  content_base64 text not null,
  created_at timestamptz not null default now()
);
create index if not exists cv_uploads_session_idx on public.cv_uploads(session_id, created_at);
alter table public.cv_uploads enable row level security;

drop policy if exists "own uploads insert" on public.cv_uploads;
create policy "own uploads insert" on public.cv_uploads
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "admin read uploads" on public.cv_uploads;
create policy "admin read uploads" on public.cv_uploads
  for select to authenticated using (public.is_admin());

create or replace function public.admin_list_session_uploads(sid uuid)
returns table (
  id uuid, filename text, content_type text, byte_size integer, created_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
  select u.id, u.filename, u.content_type, u.byte_size, u.created_at
  from public.cv_uploads u where u.session_id = sid order by u.created_at asc;
end;
$$;
revoke all on function public.admin_list_session_uploads(uuid) from public;
grant execute on function public.admin_list_session_uploads(uuid) to authenticated;

create or replace function public.admin_get_upload(upload_id uuid)
returns table (filename text, content_type text, content_base64 text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
  select u.filename, u.content_type, u.content_base64
  from public.cv_uploads u where u.id = upload_id;
end;
$$;
revoke all on function public.admin_get_upload(uuid) from public;
grant execute on function public.admin_get_upload(uuid) to authenticated;


-- ----------------------------------------- admin user-management functions --
-- Admin-only, SECURITY DEFINER reads of auth.users + CV activity for the
-- User Management page. Never return passwords. See this file above
-- for the full commentary.

-- The return type gained is_guest, and `create or replace` cannot change a
-- function's signature — so drop first. Still re-run safe: the definition
-- follows immediately, and the grants are re-applied below.
drop function if exists public.admin_list_users();

create or replace function public.admin_list_users()
returns table (
  id uuid, email text, full_name text, created_at timestamptz,
  last_sign_in_at timestamptz, cv_count bigint, total_tokens bigint,
  is_guest boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
  select u.id, u.email::text,
    nullif(trim(coalesce(u.raw_user_meta_data->>'first_name','') || ' ' ||
                coalesce(u.raw_user_meta_data->>'last_name','')), '') as full_name,
    u.created_at, u.last_sign_in_at,
    coalesce(s.cv_count, 0), coalesce(s.total_tokens, 0),
    -- Guests (anonymous sign-in) are real rows in auth.users with no email,
    -- so without this the User Management table shows them as blank-email
    -- accounts and reads like corrupted data.
    --
    -- Read through to_jsonb rather than naming u.is_anonymous directly: the
    -- column only exists on GoTrue versions that support anonymous sign-in,
    -- and a missing key here yields NULL and falls back to the email test
    -- instead of making this whole file fail to run on an older project.
    coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, u.email is null)
  from auth.users u
  left join (
    select user_id, count(*) as cv_count,
           sum(prompt_tokens + completion_tokens) as total_tokens
    from public.cv_sessions group by user_id
  ) s on s.user_id = u.id
  order by u.created_at desc;
end;
$$;
revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

create or replace function public.admin_list_user_sessions(uid uuid)
returns table (
  id uuid, style text, language text, pdf_version int, total_tokens int,
  created_at timestamptz, updated_at timestamptz, message_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
  select cs.id, cs.style, cs.language, cs.pdf_version,
    (cs.prompt_tokens + cs.completion_tokens),
    cs.created_at, cs.updated_at,
    (select count(*) from public.cv_messages m where m.session_id = cs.id)
  from public.cv_sessions cs where cs.user_id = uid
  order by cs.created_at desc;
end;
$$;
revoke all on function public.admin_list_user_sessions(uuid) from public;
grant execute on function public.admin_list_user_sessions(uuid) to authenticated;

create or replace function public.admin_get_session_messages(sid uuid)
returns table (
  id bigint, role text, content text, tool_name text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
  select m.id, m.role, m.content, m.tool_name, m.created_at
  from public.cv_messages m where m.session_id = sid order by m.id asc;
end;
$$;
revoke all on function public.admin_get_session_messages(uuid) from public;
grant execute on function public.admin_get_session_messages(uuid) to authenticated;


-- ------------------------------------------------------ guest account purge --
-- Anonymous sign-in creates one auth.users row per visitor who starts a CV
-- without an account. Most never convert, so this table grows with every
-- visit and nothing in Supabase clears it automatically. Left alone it is a
-- slow leak — of rows, and of whatever those visitors typed into a draft.
--
-- Two deliberate constraints:
--
--   * Only ever *anonymous* accounts, and only ones that never converted.
--     `is_anonymous` flips to false the moment an email is attached, so a
--     visitor who signed up is out of scope permanently, no matter how long
--     ago they started. The email test is the same version-safe fallback used
--     in admin_list_users above.
--   * Only ones that have been idle for the whole retention window, measured
--     from their last CV activity and not just from signup — someone who has
--     been building for two weeks still has work in progress.
--
-- The delete cascades: cv_sessions, cv_messages and cv_uploads all reference
-- auth.users(id) on delete cascade, so removing the account removes the
-- drafts, transcripts and uploaded files with it. That is the point.
--
-- Run it from the SQL editor, or schedule it with pg_cron if that extension
-- is enabled on the project:
--     select cron.schedule('purge-guests', '0 4 * * *',
--                          $$select public.purge_stale_guest_accounts()$$);
create or replace function public.purge_stale_guest_accounts(
  retain interval default interval '30 days'
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  removed integer;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  with stale as (
    select u.id
    from auth.users u
    where coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, u.email is null)
      and u.email is null                     -- never converted
      and u.created_at < now() - retain
      and coalesce(u.last_sign_in_at, u.created_at) < now() - retain
      and not exists (
        select 1 from public.cv_sessions s
        where s.user_id = u.id and s.updated_at >= now() - retain
      )
  )
  delete from auth.users u using stale where u.id = stale.id;

  get diagnostics removed = row_count;
  raise notice 'purged % stale guest account(s)', removed;
  return removed;
end;
$$;
revoke all on function public.purge_stale_guest_accounts(interval) from public;
grant execute on function public.purge_stale_guest_accounts(interval) to authenticated;


-- ---------------------------------------------------------- admin account ---
-- Creates the admin login on a fresh project. Re-run-safe: if the account
-- already exists it is left completely untouched (no password change), so this
-- never blocks a re-run and no real password needs to live in this file.
-- The password is bcrypt-hashed (pgcrypto), never stored as plaintext.
do $$
declare
  admin_email    text := 'yassinsinif4@gmail.com';
  admin_password text := 'CHANGE_ME';   -- ◄◄ set this ONCE to create the login
  existing_id    uuid;
begin
  select id into existing_id from auth.users where email = admin_email;

  if existing_id is not null then
    raise notice 'Admin already exists for % — left unchanged.', admin_email;
  elsif admin_password = 'CHANGE_ME' then
    raise notice 'Admin NOT created: set admin_password (still CHANGE_ME) to create it.';
  else
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated', admin_email,
      crypt(admin_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    )
    returning id into existing_id;

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), existing_id::text, existing_id,
      jsonb_build_object('sub', existing_id::text, 'email', admin_email, 'email_verified', true),
      'email', now(), now(), now()
    );
    raise notice 'Admin created for %', admin_email;
  end if;
end $$;


-- ------------------------------------------------------------ verify --------
-- Should return ZERO rows. Any row = a table still grants write/inbox access
-- to every authenticated user with no admin gate — i.e. still exploitable.
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
  and roles::text[] @> array['authenticated']
  and cmd <> 'SELECT'
  and coalesce(qual, 'true') = 'true'
  and coalesce(with_check, 'true') = 'true'
  and policyname not in ('anyone can send');
