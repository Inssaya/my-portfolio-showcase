-- =============================================================================
-- Create (or reset) the admin user.
--
-- Paste into Supabase Dashboard → SQL Editor → New query, replace
-- 'CHANGE_ME_TO_YOUR_PASSWORD' with what you actually want, hit Run.
--
-- Safe to re-run — updates the password if the account already exists,
-- creates it fresh if not. Never modifies anything else about the account.
--
-- Why this is safe to do in SQL: the Supabase SQL Editor runs as the postgres
-- superuser, so it can write to auth.users directly. The password is stored
-- as a bcrypt hash (via pgcrypto's crypt() + gen_salt('bf')), never as
-- plaintext — same hashing Supabase's own Auth service uses.
-- =============================================================================

do $$
declare
  admin_email text := 'yassinsinif4@gmail.com';
  admin_password text := 'CHANGE_ME_TO_YOUR_PASSWORD';
  existing_id uuid;
begin
  select id into existing_id from auth.users where email = admin_email;

  if existing_id is null then
    -- Fresh install: create the user + the matching identity row Supabase's
    -- own Auth service creates. `email_confirmed_at` is set now() so the
    -- account is usable immediately without email verification.
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      admin_email,
      crypt(admin_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    )
    returning id into existing_id;

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      existing_id::text,
      existing_id,
      jsonb_build_object('sub', existing_id::text, 'email', admin_email, 'email_verified', true),
      'email',
      now(), now(), now()
    );

    raise notice 'Admin created for %', admin_email;
  else
    -- Account already exists: just rotate the password. No other changes.
    update auth.users
    set encrypted_password = crypt(admin_password, gen_salt('bf')),
        updated_at = now()
    where id = existing_id;

    raise notice 'Admin password reset for %', admin_email;
  end if;
end $$;
