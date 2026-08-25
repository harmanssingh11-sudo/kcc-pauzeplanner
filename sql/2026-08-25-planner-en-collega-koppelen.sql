-- KCC Pauzeplanner - migratie: een account (planner of collega) alsnog aan een profiel koppelen,
-- óók als dat account al eerder is aangemaakt.
--
-- Waarom nodig: kcc_user_roles wordt gevuld op het moment dat iemand zich voor het eerst
-- registreert (via de trigger uit sql/2026-08-25-inloggen.sql). Wijzig je daarna de koppeling in
-- kcc_allowed_emails (bv. een planner alsnog aan een eigen werkprofiel koppelen), dan werd dat
-- vóór deze migratie niet doorgezet naar een account dat al bestond. Deze trigger houdt ze
-- voortaan automatisch gelijk, in beide richtingen (nieuw én bestaand account).
--
-- Voer dit één keer uit in Supabase -> SQL Editor, ná de vorige twee migraties. Idempotent.

create or replace function public.kcc_sync_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.kcc_user_roles
  set role = new.role, profile_id = new.profile_id
  where lower(email) = lower(new.email);
  return new;
end;
$$;

drop trigger if exists trg_kcc_sync_user_role on public.kcc_allowed_emails;
create trigger trg_kcc_sync_user_role
  after insert or update on public.kcc_allowed_emails
  for each row
  execute function public.kcc_sync_user_role();
