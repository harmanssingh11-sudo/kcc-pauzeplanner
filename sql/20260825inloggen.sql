-- KCC Pauzeplanner - migratie voor het inlogsysteem (planners + collega's, zelf wachtwoord kiezen).
-- Voer dit één keer uit in Supabase SQL Editor.
create table if not exists public.kcc_allowed_emails (
  email text primary key,
  role text not null check (role in ('planner', 'medewerker')),
  profile_id uuid references public.kcc_work_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.kcc_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('planner', 'medewerker')),
  profile_id uuid references public.kcc_work_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create or replace function public.kcc_is_planner()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.kcc_user_roles where user_id = auth.uid() and role = 'planner');
$$;
alter table public.kcc_allowed_emails enable row level security;
alter table public.kcc_user_roles enable row level security;
drop policy if exists kcc_allowed_emails_planner_all on public.kcc_allowed_emails;
create policy kcc_allowed_emails_planner_all on public.kcc_allowed_emails
  for all using (public.kcc_is_planner()) with check (public.kcc_is_planner());
drop policy if exists kcc_user_roles_select on public.kcc_user_roles;
create policy kcc_user_roles_select on public.kcc_user_roles
  for select using (user_id = auth.uid() or public.kcc_is_planner());
create or replace function public.kcc_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare allowed record;
begin
  select * into allowed from public.kcc_allowed_emails where lower(email) = lower(new.email);
  if allowed is null then raise exception 'Dit e-mailadres staat niet op de toegestane lijst. Vraag de planner om toegang.'; end if;
  insert into public.kcc_user_roles (user_id, email, role, profile_id)
  values (new.id, new.email, allowed.role, allowed.profile_id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_kcc_handle_new_user on auth.users;
create trigger trg_kcc_handle_new_user after insert on auth.users for each row execute function public.kcc_handle_new_user();

-- Seed minimaal één planner handmatig, bijvoorbeeld:
-- insert into public.kcc_allowed_emails (email, role) values ('jouw.email@voorbeeld.nl', 'planner')
-- on conflict (email) do update set role = excluded.role;