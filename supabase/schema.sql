-- =============================================================================
-- Portfolio schema for Supabase.
--
-- One-time bootstrap. Paste into Supabase Dashboard → SQL Editor → New query
-- → Run. Idempotent enough to re-run for tweaks: every CREATE uses IF NOT
-- EXISTS, every policy is DROP'd before it's recreated.
--
-- What this sets up:
--   - All tables the frontend needs (projects, hero, social, about, education,
--     experience, skills, certificates, messages)
--   - Row-Level Security policies: the public reads portfolio content and can
--     submit contact messages; only the ADMIN (checked by email in the JWT via
--     is_admin()) can edit content, read the inbox, or delete anything
--   - A public "images" storage bucket with the same rule shape — anyone can
--     view, only the admin can upload/delete
--
-- Auth model: this project DOES allow public sign-up (the CV builder at
-- /cv-builder/signup), so `authenticated` no longer means "the admin" — it
-- means "any visitor with an account". Every admin-only policy is therefore
-- keyed on is_admin(), NOT on the bare `authenticated` role. Do not add a
-- policy that grants write/inbox access to `authenticated` with a `true`
-- qualifier — that is the exact bug harden-rls.sql exists to fix.
-- =============================================================================


-- --------------------------------------------------------------- helpers ----

-- Keep updated_at fresh on every UPDATE without touching route code.
create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- "Is this request the site owner?" — the single source of truth for every
-- admin-only policy below. Keyed on the email claim in the caller's signed
-- JWT, which a user cannot forge or change to the admin's without controlling
-- the admin's inbox. Keep this email in sync with src/lib/adminRole.ts.
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

-- Projects: the list on the landing page and the detail routes.
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

-- About cards on the home page.
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

-- Contact form submissions. Public insert, admin read.
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

-- Hero singleton: enforced single row via a CHECK constraint on id.
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
-- Same shape for every public-content table: public reads, authenticated
-- writes. Drop-then-create so re-running this file is safe.

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
    -- Admin-only writes. NOT `to authenticated using (true)` — that would let
    -- any signed-up CV user edit the whole site.
    execute format(
      'create policy "admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      content_table
    );
  end loop;
end $$;


-- ---------------------------------------------------- policies (messages) --
-- Inverted from content: the public can INSERT (contact form) but can't read
-- anything. Only authenticated users can list the inbox, mark as read, delete.

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
-- Bucket for project screenshots and any admin-uploaded images. Public
-- read (so <img src> works from the browser without a token), admin-only
-- writes.

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
-- One row per CV conversation, plus every turn kept verbatim. cv-service
-- (Python/FastAPI, deployed separately to Render) is the only thing that
-- talks to these — always with the visitor's own access token, never
-- service_role, so RLS below is what actually enforces "only your own CVs",
-- not application code. See cv-service/app/db.py.
--
-- Photo and generated-PDF bytes are deliberately NOT stored here: the photo
-- is re-uploadable and the PDF is regenerable from `draft` in one request, so
-- keeping bytea out of this path keeps every save a small JSON write instead
-- of shipping a whole file on every turn. Losing them across a restart is an
-- acceptable, documented trade — losing the draft itself is not.

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

-- Every turn, kept verbatim: the training corpus, and what lets a session
-- restored on a new device or after a restart show its own history rather
-- than just the current draft.
create table if not exists public.cv_messages (
  id bigserial primary key,
  session_id uuid not null references public.cv_sessions(id) on delete cascade,
  role text not null,               -- user | assistant | tool | system
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

-- cv_messages carries no user_id of its own — ownership is checked through
-- the parent session, the standard shape for a policy scoped by foreign key.
drop policy if exists "own messages" on public.cv_messages;
create policy "own messages" on public.cv_messages
  for all to authenticated using (
    exists (select 1 from public.cv_sessions s where s.id = session_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.cv_sessions s where s.id = session_id and s.user_id = auth.uid())
  );
