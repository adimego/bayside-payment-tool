-- Staff profiles, saved quotes, and public share RPC for the Bayside payment tool.
-- Helpers live in the unexposed `private` schema (SECURITY DEFINER, fixed search_path)
-- so RLS policies can check admin/approved status without recursion.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  role text not null default 'staff' check (role in ('staff', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  staff_id uuid not null references public.profiles (id) on delete cascade,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  stock text,
  vehicle jsonb not null default '{}'::jsonb,
  deal jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_status_idx on public.profiles (status);
create index profiles_approved_by_idx on public.profiles (approved_by);
create index quotes_staff_id_idx on public.quotes (staff_id);

comment on table public.profiles is 'Dealership staff accounts. Role and status live here, never in user_metadata.';
comment on table public.quotes is 'Saved staff quotes. The public reads a safe subset only via get_shared_quote(slug).';

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER, empty search_path — no RLS recursion)
-- ---------------------------------------------------------------------------

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and status = 'approved'
  );
$$;

create or replace function private.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and status = 'approved'
  );
$$;

revoke all on function private.is_admin() from public, anon;
revoke all on function private.is_approved() from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_approved() to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: new auth user → pending profile; protect role/status; slugs
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, phone, role, status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), 'Staff member'),
    coalesce(new.email, ''),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    'staff',
    'pending'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    new.role := old.role;
    new.status := old.status;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_privileges
  before update on public.profiles
  for each row execute function private.protect_profile_privileges();

create or replace function private.generate_quote_slug()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
  tries int := 0;
begin
  loop
    tries := tries + 1;
    candidate := substr(
      rtrim(translate(encode(extensions.gen_random_bytes(8), 'base64'), '+/', '-_'), '='),
      1, 10
    );
    exit when candidate is not null
      and length(candidate) = 10
      and not exists (select 1 from public.quotes q where q.slug = candidate);
    if tries > 20 then
      raise exception 'Could not generate a unique quote slug';
    end if;
  end loop;
  return candidate;
end;
$$;

create or replace function private.set_quote_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := private.generate_quote_slug();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger quotes_set_defaults
  before insert or update on public.quotes
  for each row execute function private.set_quote_defaults();

-- ---------------------------------------------------------------------------
-- Public share RPC: customer-safe fields only, no direct table access
-- ---------------------------------------------------------------------------

create or replace function public.get_shared_quote(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rec public.quotes%rowtype;
  first_name text;
begin
  if p_slug is null or btrim(p_slug) = '' then
    return null;
  end if;

  select * into rec
  from public.quotes
  where slug = btrim(p_slug);

  if not found then
    return null;
  end if;

  first_name := split_part(btrim(rec.customer_name), ' ', 1);

  return jsonb_build_object(
    'slug', rec.slug,
    'customer_first_name', first_name,
    'stock', rec.stock,
    'vehicle', rec.vehicle,
    'results', rec.results,
    'public_deal', jsonb_build_object(
      'down', rec.deal -> 'down',
      'tier', rec.deal -> 'tier',
      'term', rec.deal -> 'term',
      'military', rec.deal -> 'military'
    ),
    'created_at', rec.created_at
  );
end;
$$;

revoke all on function public.get_shared_quote(text) from public;
grant execute on function public.get_shared_quote(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.quotes enable row level security;

revoke all on table public.profiles from public, anon;
revoke all on table public.quotes from public, anon;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.quotes to authenticated;

-- Profiles: anyone signed in can read their own row (including pending/denied).
-- Admins can read every profile (staff list + approvals).
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

-- Users may update their own name/phone/email; the protect trigger blocks
-- role/status changes unless the caller is an admin.
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- Quotes: approved staff CRUD only their own rows.
create policy quotes_select_own_or_admin
  on public.quotes
  for select
  to authenticated
  using (
    ((select private.is_approved()) and staff_id = (select auth.uid()))
    or (select private.is_admin())
  );

create policy quotes_insert_own
  on public.quotes
  for insert
  to authenticated
  with check (
    (select private.is_approved())
    and staff_id = (select auth.uid())
  );

create policy quotes_update_own
  on public.quotes
  for update
  to authenticated
  using ((select private.is_approved()) and staff_id = (select auth.uid()))
  with check ((select private.is_approved()) and staff_id = (select auth.uid()));

create policy quotes_delete_own_or_admin
  on public.quotes
  for delete
  to authenticated
  using (
    ((select private.is_approved()) and staff_id = (select auth.uid()))
    or (select private.is_admin())
  );
