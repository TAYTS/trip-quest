-- Trip Quest · Supabase schema
-- Run this once in Supabase → SQL Editor → New query → Run.
-- Then enable Authentication → Sign In / Providers → "Allow anonymous sign-ins".
--
-- Model: anonymous users (one per device) become members of a trip by creating
-- it or joining with its 6-character code. Row Level Security limits every
-- read/write to members of that trip.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ tables
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text not null unique,
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.trip_members (
  trip_id       uuid not null references public.trips(id) on delete cascade,
  user_id       uuid not null default auth.uid(),
  display_name  text,
  joined_at     timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table if not exists public.entries (
  trip_id        uuid not null references public.trips(id) on delete cascade,
  checkpoint_id  text not null,               -- e.g. 'd3-morning'
  choice_id      text not null,               -- option id from src/data/itinerary.ts
  custom_title   text,
  status         text not null check (status in ('done', 'skipped')),
  mood           smallint check (mood between 1 and 5),
  note           text check (char_length(note) <= 4000),
  dice           smallint check (dice between 1 and 6),
  chance_id      text,
  coins          integer not null default 0,
  photo_paths    text[] not null default '{}' check (cardinality(photo_paths) <= 3), -- paths inside the journal-photos bucket
  author         text,
  updated_by     uuid default auth.uid(),
  updated_at     timestamptz not null default now(),
  primary key (trip_id, checkpoint_id)
);

-- ------------------------------------------------------------------ helpers
create or replace function public.is_trip_member(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members where trip_id = p_trip and user_id = auth.uid()
  );
$$;

-- Same check but takes text (used by storage policies, where the folder name is text).
create or replace function public.is_trip_member_text(p_trip text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members where trip_id::text = p_trip and user_id = auth.uid()
  );
$$;

create or replace function public.new_join_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L confusion
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.trips where join_code = code);
  end loop;
  return code;
end;
$$;

-- ------------------------------------------------------------------ RPCs
create or replace function public.create_trip(p_name text, p_display_name text)
returns public.trips language plpgsql security definer set search_path = public as $$
declare
  t public.trips;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.trips (name, join_code, created_by)
    values (coalesce(nullif(trim(p_name), ''), 'Our trip'), public.new_join_code(), auth.uid())
    returning * into t;
  insert into public.trip_members (trip_id, user_id, display_name)
    values (t.id, auth.uid(), p_display_name);
  return t;
end;
$$;

create or replace function public.join_trip(p_code text, p_display_name text)
returns public.trips language plpgsql security definer set search_path = public as $$
declare
  t public.trips;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into t from public.trips where join_code = upper(trim(p_code));
  if not found then raise exception 'No trip found with that code'; end if;
  insert into public.trip_members (trip_id, user_id, display_name)
    values (t.id, auth.uid(), p_display_name)
    on conflict (trip_id, user_id) do update set display_name = excluded.display_name;
  return t;
end;
$$;

revoke all on function public.create_trip(text, text) from public, anon;
revoke all on function public.join_trip(text, text) from public, anon;
grant execute on function public.create_trip(text, text) to authenticated;
grant execute on function public.join_trip(text, text) to authenticated;

-- ------------------------------------------------------------------ RLS
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.entries enable row level security;

-- Trips and memberships are created only through the RPCs above.
drop policy if exists "members read trip" on public.trips;
create policy "members read trip" on public.trips
  for select to authenticated using (public.is_trip_member(id));

drop policy if exists "members read members" on public.trip_members;
create policy "members read members" on public.trip_members
  for select to authenticated using (public.is_trip_member(trip_id));

drop policy if exists "members read entries" on public.entries;
create policy "members read entries" on public.entries
  for select to authenticated using (public.is_trip_member(trip_id));

drop policy if exists "members insert entries" on public.entries;
create policy "members insert entries" on public.entries
  for insert to authenticated with check (public.is_trip_member(trip_id));

drop policy if exists "members update entries" on public.entries;
create policy "members update entries" on public.entries
  for update to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

drop policy if exists "members delete entries" on public.entries;
create policy "members delete entries" on public.entries
  for delete to authenticated using (public.is_trip_member(trip_id));

-- ------------------------------------------------------------------ realtime
-- Lets the other phone see new journal entries live.
do $$
begin
  alter publication supabase_realtime add table public.entries;
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------------ photo storage
-- Private bucket; files live at <trip_id>/<checkpoint_id>/<uuid>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('journal-photos', 'journal-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "members read photos" on storage.objects;
create policy "members read photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'journal-photos' and public.is_trip_member_text((storage.foldername(name))[1]));

-- Upload and delete policies are further down (under "trip recap"), because they also check
-- that the recap hasn't been made yet.

-- ------------------------------------------------------------------ AI guide quota
-- The ask-guide Edge Function calls use_guide_quota() before each Gemini request, so one trip
-- can only ask a limited number of questions ("wishes") per day (China time). Nobody can read or write
-- this table directly: row-level security is on and there are no policies.
create table if not exists public.guide_usage (
  trip_id uuid not null references public.trips(id) on delete cascade,
  day     date not null,
  count   integer not null default 0,
  primary key (trip_id, day)
);
alter table public.guide_usage enable row level security;

-- Counts one question for the trip and returns how many were used today.
-- Raises 'not a member of this trip' for outsiders and 'daily limit reached' once p_limit is hit.
create or replace function public.use_guide_quota(p_trip uuid, p_limit integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  used integer;
begin
  if not public.is_trip_member(p_trip) then
    raise exception 'not a member of this trip' using errcode = '42501';
  end if;
  insert into public.guide_usage (trip_id, day, count)
  values (p_trip, (now() at time zone 'Asia/Shanghai')::date, 1)
  on conflict (trip_id, day) do update set count = public.guide_usage.count + 1
    where public.guide_usage.count < p_limit
  returning count into used;
  if used is null then
    raise exception 'daily limit reached' using errcode = 'P0001';
  end if;
  return used;
end;
$$;

revoke all on function public.use_guide_quota(uuid, integer) from public, anon;
grant execute on function public.use_guide_quota(uuid, integer) to authenticated;

-- How many wishes (questions) the trip has used today. Read-only, so the game can show the counter.
create or replace function public.guide_quota_used(p_trip uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  used integer;
begin
  if not public.is_trip_member(p_trip) then
    raise exception 'not a member of this trip' using errcode = '42501';
  end if;
  select count into used from public.guide_usage
    where trip_id = p_trip and day = (now() at time zone 'Asia/Shanghai')::date;
  return coalesce(used, 0);
end;
$$;

-- Gives one wish back when the guide failed to answer (Google down, rate limit, ...).
create or replace function public.refund_guide_quota(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trip_member(p_trip) then
    raise exception 'not a member of this trip' using errcode = '42501';
  end if;
  update public.guide_usage set count = greatest(count - 1, 0)
    where trip_id = p_trip and day = (now() at time zone 'Asia/Shanghai')::date;
end;
$$;

revoke all on function public.guide_quota_used(uuid) from public, anon;
revoke all on function public.refund_guide_quota(uuid) from public, anon;
grant execute on function public.guide_quota_used(uuid) to authenticated;
grant execute on function public.refund_guide_quota(uuid) to authenticated;

-- ------------------------------------------------------------------ trip recap ("Trip Wrapped")
-- recap_moments: Gemini's reading of each checkpoint (note mood, feelings, best photo, caption).
--   Written once per checkpoint by the trip-recap Edge Function; never re-run.
-- recaps: the finished recap (stats, ranking, personality, closing note), one row per trip.
--   Once it exists, the journal is read-only (see block_after_recap below), so both phones
--   always see the same recap.
create table if not exists public.recap_moments (
  trip_id        uuid not null references public.trips(id) on delete cascade,
  checkpoint_id  text not null,
  analysis       jsonb not null,
  created_at     timestamptz not null default now(),
  primary key (trip_id, checkpoint_id)
);
create table if not exists public.recaps (
  trip_id     uuid primary key references public.trips(id) on delete cascade,
  data        jsonb not null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table public.recap_moments enable row level security;
alter table public.recaps enable row level security;

drop policy if exists "members read recap moments" on public.recap_moments;
create policy "members read recap moments" on public.recap_moments
  for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "members add recap moments" on public.recap_moments;
create policy "members add recap moments" on public.recap_moments
  for insert to authenticated with check (public.is_trip_member(trip_id));

drop policy if exists "members read recap" on public.recaps;
create policy "members read recap" on public.recaps
  for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "members add recap" on public.recaps;
create policy "members add recap" on public.recaps
  for insert to authenticated with check (public.is_trip_member(trip_id));
-- No update or delete policies: a recap is never changed. delete_recap() below is the only way to remove it.

-- Lets the other phone see the recap (and the journal lock) as soon as it is made.
do $$
begin
  alter publication supabase_realtime add table public.recaps;
exception when duplicate_object then null;
end $$;

create or replace function public.trip_has_recap(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.recaps where trip_id = p_trip);
$$;
create or replace function public.trip_has_recap_text(p_trip text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.recaps where trip_id::text = p_trip);
$$;

-- Once the recap is made, journal entries can't be added, changed or removed.
create or replace function public.block_after_recap()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t uuid;
begin
  if tg_op = 'DELETE' then t := old.trip_id; else t := new.trip_id; end if;
  -- Still allow the whole trip to be deleted (cascade).
  if public.trip_has_recap(t) and exists (select 1 from public.trips where id = t) then
    raise exception 'The trip recap is made, so the journal is read-only now.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists entries_locked_after_recap on public.entries;
create trigger entries_locked_after_recap
  before insert or update or delete on public.entries
  for each row execute function public.block_after_recap();

-- Photos: same rule (no new or removed photos after the recap).
drop policy if exists "members upload photos" on storage.objects;
create policy "members upload photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'journal-photos'
    and public.is_trip_member_text((storage.foldername(name))[1])
    and not public.trip_has_recap_text((storage.foldername(name))[1])
  );
drop policy if exists "members delete photos" on storage.objects;
create policy "members delete photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'journal-photos'
    and public.is_trip_member_text((storage.foldername(name))[1])
    and not public.trip_has_recap_text((storage.foldername(name))[1])
  );

-- For test runs: removes the recap and its saved analysis, which unlocks the journal again.
create or replace function public.delete_recap(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trip_member(p_trip) then
    raise exception 'not a member of this trip' using errcode = '42501';
  end if;
  delete from public.recaps where trip_id = p_trip;
  delete from public.recap_moments where trip_id = p_trip;
end;
$$;
revoke all on function public.delete_recap(uuid) from public, anon;
grant execute on function public.delete_recap(uuid) to authenticated;

-- ------------------------------------------------------------------ migration
-- Only needed if you ran an older version of this file (one photo per entry) before.
-- Safe to run again.
alter table public.entries add column if not exists photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3);
