-- =============================================================================
-- UPLOADED-FILE STORAGE (admin review).
--
-- Keeps the original file a visitor uploaded to the CV builder, so the admin
-- can download exactly what was sent and judge chatbot quality against it.
-- Bytes are base64 in a text column (files are capped at 5MB and volume is
-- low) — no separate storage bucket to manage.
--
-- Access: the owner may INSERT their own uploads (the cv-service writes with
-- the visitor's token); only the admin may read them, and downloads go through
-- the SECURITY DEFINER RPCs below. Requires is_admin() (from setup.sql).
--
-- Run: Supabase SQL Editor → paste → Run. Idempotent.
-- =============================================================================

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

-- Owner inserts their own; admin reads all. No owner-select (admin-only review)
-- and no update/delete for anyone but the cascade.
drop policy if exists "own uploads insert" on public.cv_uploads;
create policy "own uploads insert" on public.cv_uploads
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "admin read uploads" on public.cv_uploads;
create policy "admin read uploads" on public.cv_uploads
  for select to authenticated using (public.is_admin());


-- List a session's uploads (metadata only — no bytes, so the listing stays light).
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
  from public.cv_uploads u
  where u.session_id = sid
  order by u.created_at asc;
end;
$$;
revoke all on function public.admin_list_session_uploads(uuid) from public;
grant execute on function public.admin_list_session_uploads(uuid) to authenticated;


-- Fetch one upload's bytes (base64) for download.
create or replace function public.admin_get_upload(upload_id uuid)
returns table (filename text, content_type text, content_base64 text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
  select u.filename, u.content_type, u.content_base64
  from public.cv_uploads u
  where u.id = upload_id;
end;
$$;
revoke all on function public.admin_get_upload(uuid) from public;
grant execute on function public.admin_get_upload(uuid) to authenticated;
