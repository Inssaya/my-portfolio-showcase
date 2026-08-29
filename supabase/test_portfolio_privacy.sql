-- Assertions for the published-portfolio surface.
--
-- WHY THIS FILE EXISTS. Everything else in this repo is covered by a test
-- suite; the schema was not, because it needs a database to run against. That
-- was tolerable while every policy said "your own rows only". It stopped being
-- tolerable when publishing arrived: this is the first thing in the project
-- that deliberately shows one person's data to strangers, and the rules that
-- keep it safe are written in SQL rather than in Python or TypeScript. A
-- privacy rule with no test is a privacy rule until somebody edits it.
--
-- HOW TO RUN. Against any Postgres that already has setup.sql applied:
--
--     psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/test_portfolio_privacy.sql
--
-- It creates its own fixtures inside a transaction and rolls back, so it
-- leaves nothing behind and is safe against a database with real rows in it.
-- Every check raises on failure, so a non-zero exit is a real failure.
--
-- Locally, without a Supabase project, `initdb` a throwaway cluster, create
-- the auth/storage stand-ins setup.sql expects, apply setup.sql, then run this.

begin;

do $$
declare
  member_id uuid := '11111111-1111-1111-1111-111111111111';
  guest_id  uuid := '22222222-2222-2222-2222-222222222222';
  live_id   uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  guest_cv  uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  got       text;
  ok        boolean;
begin
  -- ---------------------------------------------------------- fixtures ----
  insert into auth.users (id, email, is_anonymous)
  values (member_id, 'member@example.test', false),
         (guest_id,  null,                  true);

  insert into public.cv_sessions (id, user_id, draft, published)
  values
    (live_id, member_id, jsonb_build_object(
        'full_name', 'Test Person',
        'contact', E'Casablanca, Morocco\n+212 6 23 84 25 35\nperson@example.test\ngithub.com/example\n2022-2027'
     ), false),
    (guest_cv, guest_id, jsonb_build_object('full_name', 'Guest Person'), false);

  -- ------------------------------------------- an unpublished draft is ----
  --                                              not readable at all
  if exists (select 1 from public.public_portfolio(live_id)) then
    raise exception 'FAIL: an unpublished draft was returned to the public';
  end if;

  -- ------------------------------------------------ the owner publishes ---
  perform set_config('request.jwt.claim.sub', member_id::text, true);
  if not public.set_portfolio_published(live_id, true, 'rosewood', null) then
    raise exception 'FAIL: the owner could not publish their own portfolio';
  end if;

  select theme into got from public.public_portfolio(live_id);
  if got is distinct from 'rosewood' then
    raise exception 'FAIL: theme not applied, got %', got;
  end if;

  -- ------------------------------------------------- the privacy rule -----
  -- The phone goes; the city, the email, the link and a year range all stay.
  -- The year range matters: a scrub that also eats "2022-2027" would quietly
  -- delete a line the visitor meant to publish.
  select contact into got from public.public_portfolio(live_id);
  if got like '%+212%' then
    raise exception 'FAIL: the phone number was published without opt-in: %', got;
  end if;
  if got not like '%Casablanca%' or got not like '%example.test%'
     or got not like '%github.com%' or got not like '%2022-2027%' then
    raise exception 'FAIL: the phone scrub removed something else too: %', got;
  end if;

  -- Opting in publishes it, and nothing else changes.
  perform public.set_portfolio_published(live_id, true, null, true);
  select contact into got from public.public_portfolio(live_id);
  if got not like '%+212%' then
    raise exception 'FAIL: opting in did not publish the phone number';
  end if;
  perform public.set_portfolio_published(live_id, true, null, false);

  -- ------------------------------------------------------- ownership ------
  -- Somebody else's session is not theirs to publish, unpublish or restyle.
  perform set_config('request.jwt.claim.sub', guest_id::text, true);
  if public.set_portfolio_published(live_id, false, null, null) then
    raise exception 'FAIL: a stranger modified a portfolio they do not own';
  end if;
  if not exists (select 1 from public.public_portfolio(live_id)) then
    raise exception 'FAIL: a stranger managed to unpublish someone else''s page';
  end if;

  -- ----------------------------------------------------- guests cannot ----
  -- Not a preference: purge_stale_guest_accounts() deletes idle guest
  -- accounts and cascades to cv_sessions, so a guest's public URL is
  -- guaranteed to break later. Refusing up front is what makes a published
  -- link mean something.
  begin
    perform public.set_portfolio_published(guest_cv, true, null, null);
    raise exception 'FAIL: a guest published a portfolio';
  exception
    when insufficient_privilege then null;  -- expected
  end;

  select published into ok from public.cv_sessions where id = guest_cv;
  if ok then
    raise exception 'FAIL: the guest row was published despite the refusal';
  end if;

  -- ------------------------------- the conversion window ------------------
  -- Someone who has just signed up: an email is attached but is_anonymous
  -- has not flipped yet. purge_stale_guest_accounts() would never delete
  -- them — it requires email is null — so publishing must be allowed. When
  -- the refusal tested only is_anonymous, this visitor signed up, was
  -- refused, and was shown the sign-up form again.
  insert into auth.users (id, email, is_anonymous)
  values ('33333333-3333-3333-3333-333333333333', 'converted@example.test', true);
  insert into public.cv_sessions (id, user_id, draft)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
          '33333333-3333-3333-3333-333333333333', '{}'::jsonb);

  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  if not public.set_portfolio_published('cccccccc-cccc-cccc-cccc-cccccccccccc',
                                        true, null, null) then
    raise exception 'FAIL: a just-converted account was refused; the publish '
      'check and the purge it cites now disagree';
  end if;

  -- ------------------------------------------- no identity at all ---------
  -- An unauthenticated caller must be refused rather than defaulting to
  -- "not a guest" and slipping through.
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.set_portfolio_published(live_id, true, null, null);
    raise exception 'FAIL: publishing succeeded with no authenticated user';
  exception
    when insufficient_privilege then null;  -- expected
  end;

  raise notice 'portfolio privacy: all checks passed';
end $$;

-- Every shape of telephone number this has to catch, and every line it must
-- leave alone. This block is the reason contact_is_phone() is a named
-- function rather than an expression buried in a subquery: it is the entire
-- privacy guarantee, and its first version silently published five of the
-- formats below.
do $$
declare
  leaked   text;
  removed  text;
begin
  -- Must be stripped. Each of these was published by the original pattern
  -- unless marked otherwise.
  select string_agg(line, ' | ') into leaked from (values
      ('+212 6 23 84 25 35'),          -- caught before
      ('Phone: 0612345678'),
      ('Tel: 06 12 34 56 78'),
      -- A documented shape of this field: Session.set_field splits a
      -- pipe-delimited contact block, and _build_classic reads "kind | text".
      ('phone | 0612345678'),
      ('(020) 7946 0958'),
      ('0612345678 (WhatsApp)'),
      ('(415) 555-2671'),
      ('415-555-2671'),
      ('212.555.0147'),
      ('9876543210'),
      ('Mobile: +44 7700 900123'),
      ('Tél. 06.12.34.56.78'),
      ('WhatsApp 06 12 34 56 78'),
      ('Yassine · me@x.com · 0612345678 · Casablanca')
    ) as t(line)
    where not public.contact_is_phone(line);

  if leaked is not null then
    raise exception 'FAIL: these telephone numbers would be published: %', leaked;
  end if;

  -- Must survive. A privacy rule that eats the address or the dates is a
  -- different bug, not a safer one.
  select string_agg(line, ' | ') into removed from (values
      ('Casablanca, Morocco'),
      ('yassinsinif4@gmail.com'),
      ('github.com/Inssaya'),
      ('sinif-yassine.vercel.app'),
      ('2022-2027'),
      ('01 Rue de la Paix, 20000 Casablanca'),
      ('06000 Nice, France'),
      ('Casablanca 20000'),
      ('Permis B, 2018-2020'),
      ('Bac +5, promotion 2020-2024'),
      ('Jun 2026 - Present'),
      ('AWS Certified 2024'),
      ('London, UK')
    ) as t(line)
    where public.contact_is_phone(line);

  if removed is not null then
    raise exception 'FAIL: these lines are not phone numbers and would be deleted: %', removed;
  end if;

  raise notice 'contact_is_phone: 14 formats caught, 13 lines preserved';
end $$;

-- The raw table must stay unreachable for anonymous callers. This is the
-- check that actually matters: the whole design rests on cv_sessions being
-- owner-only, with the function as the only public door. If a future policy
-- opens the table itself, everything above still passes while the phone
-- number is readable by anyone who queries it directly.
do $$
declare
  leaky text;
begin
  select string_agg(policyname, ', ') into leaky
  from pg_policies
  where schemaname = 'public'
    and tablename = 'cv_sessions'
    and roles::text[] && array['anon', 'public'];

  if leaky is not null then
    raise exception
      'FAIL: cv_sessions is exposed to anonymous callers by policy(s): %. '
      'The row holds the phone number, the address and user_id; only '
      'public_portfolio() may face the public.', leaky;
  end if;
end $$;

rollback;
