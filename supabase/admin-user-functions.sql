-- =============================================================================
-- ADMIN USER-MANAGEMENT FUNCTIONS
--
-- The admin User Management page needs to read auth.users (Supabase's built-in
-- accounts table) and aggregate each user's CV activity. The browser cannot
-- query auth.users directly with the anon key — that schema isn't exposed to
-- PostgREST, and it must never be. Instead we expose three SECURITY DEFINER
-- functions that:
--   * run with elevated rights (so they CAN read auth.users), but
--   * refuse to return anything unless the caller is the admin (is_admin()).
--
-- Passwords are NEVER returned — auth.users stores only a bcrypt hash, and
-- exposing even that would be a mistake. The page shows activity, not secrets.
--
-- Run: Supabase SQL Editor → paste → Run. Idempotent (create or replace).
-- =============================================================================

-- 1) All users + their CV activity, newest first.
create or replace function public.admin_list_users()
returns table (
  id              uuid,
  email           text,
  full_name       text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  cv_count        bigint,
  total_tokens    bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    u.id,
    u.email::text,
    nullif(trim(
      coalesce(u.raw_user_meta_data->>'first_name', '') || ' ' ||
      coalesce(u.raw_user_meta_data->>'last_name', '')
    ), '') as full_name,
    u.created_at,
    u.last_sign_in_at,
    coalesce(s.cv_count, 0)     as cv_count,
    coalesce(s.total_tokens, 0) as total_tokens
  from auth.users u
  left join (
    select user_id,
           count(*)                                as cv_count,
           sum(prompt_tokens + completion_tokens)  as total_tokens
    from public.cv_sessions
    group by user_id
  ) s on s.user_id = u.id
  order by u.created_at desc;
end;
$$;
revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;


-- 2) One user's CV sessions (each session == one CV conversation).
create or replace function public.admin_list_user_sessions(uid uuid)
returns table (
  id            uuid,
  style         text,
  language      text,
  pdf_version   int,
  total_tokens  int,
  created_at    timestamptz,
  updated_at    timestamptz,
  message_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    cs.id, cs.style, cs.language, cs.pdf_version,
    (cs.prompt_tokens + cs.completion_tokens) as total_tokens,
    cs.created_at, cs.updated_at,
    (select count(*) from public.cv_messages m where m.session_id = cs.id) as message_count
  from public.cv_sessions cs
  where cs.user_id = uid
  order by cs.created_at desc;
end;
$$;
revoke all on function public.admin_list_user_sessions(uuid) from public;
grant execute on function public.admin_list_user_sessions(uuid) to authenticated;


-- 3) The full transcript of one session (the "open chat" view).
create or replace function public.admin_get_session_messages(sid uuid)
returns table (
  id         bigint,
  role       text,
  content    text,
  tool_name  text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select m.id, m.role, m.content, m.tool_name, m.created_at
  from public.cv_messages m
  where m.session_id = sid
  order by m.id asc;
end;
$$;
revoke all on function public.admin_get_session_messages(uuid) from public;
grant execute on function public.admin_get_session_messages(uuid) to authenticated;
