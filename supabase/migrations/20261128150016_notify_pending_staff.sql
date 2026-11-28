-- Instant email alert when a staff access request is pending.
-- The shared hook secret lives in Vault under the name
-- notify_pending_staff_secret (created out of band, never committed).
-- A missing secret or a failed HTTP call is logged and swallowed so
-- signup is never blocked.

create extension if not exists pg_net with schema extensions;

create or replace function private.notify_pending_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hook_secret text;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select dec.decrypted_secret
    into hook_secret
    from vault.decrypted_secrets as dec
   where dec.name = 'notify_pending_staff_secret'
   limit 1;

  if hook_secret is null or btrim(hook_secret) = '' then
    raise warning 'notify_pending_staff: vault secret notify_pending_staff_secret is missing';
    return new;
  end if;

  perform net.http_post(
    url := 'https://ilvebrdfrtlmvizwrgdy.supabase.co/functions/v1/notify-pending-staff',
    body := jsonb_build_object(
      'id', new.id,
      'full_name', new.full_name,
      'email', new.email,
      'phone', new.phone,
      'created_at', new.created_at
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', hook_secret
    ),
    timeout_milliseconds := 15000
  );

  return new;
exception
  when others then
    raise warning 'notify_pending_staff: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists profiles_notify_pending_staff on public.profiles;

create trigger profiles_notify_pending_staff
  after insert or update of status on public.profiles
  for each row
  execute function private.notify_pending_staff();

revoke all on function private.notify_pending_staff() from public, anon, authenticated;

comment on function private.notify_pending_staff() is
  'Queues an email alert for a new or reopened pending staff request. Failures never block the profile write.';
