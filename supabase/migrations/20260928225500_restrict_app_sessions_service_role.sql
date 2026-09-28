begin;

revoke all privileges on table public.app_sessions from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.app_sessions to service_role;

commit;
