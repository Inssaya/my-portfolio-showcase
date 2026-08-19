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
--     submit contact messages; only authenticated users (i.e. you) can edit
--     content, read the inbox, or delete anything
--   - A public "images" storage bucket with the same rule shape — anyone can
--     view, only you can upload/delete
--
-- Auth model: Supabase doesn't allow anonymous sign-up on this project, so
-- "authenticated" == "an admin you created in the dashboard". If you ever
-- enable public sign-up, tighten these policies to check a specific email or
-- role in auth.jwt().
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
    execute format(
      'create policy "public read" on public.%I for select using (true)',
      content_table
    );
    execute format(
      'create policy "auth write" on public.%I for all to authenticated using (true) with check (true)',
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

create policy "anyone can send" on public.messages
  for insert to anon, authenticated with check (true);

create policy "auth read messages" on public.messages
  for select to authenticated using (true);

create policy "auth update messages" on public.messages
  for update to authenticated using (true) with check (true);

create policy "auth delete messages" on public.messages
  for delete to authenticated using (true);


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

create policy "public read images" on storage.objects
  for select using (bucket_id = 'images');

create policy "auth upload images" on storage.objects
  for insert to authenticated with check (bucket_id = 'images');

create policy "auth update images" on storage.objects
  for update to authenticated using (bucket_id = 'images') with check (bucket_id = 'images');

create policy "auth delete images" on storage.objects
  for delete to authenticated using (bucket_id = 'images');
