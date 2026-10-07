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

drop policy if exists "members upload photos" on storage.objects;
create policy "members upload photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'journal-photos' and public.is_trip_member_text((storage.foldername(name))[1]));

drop policy if exists "members delete photos" on storage.objects;
create policy "members delete photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'journal-photos' and public.is_trip_member_text((storage.foldername(name))[1]));

-- ------------------------------------------------------------------ migration
-- Only needed if you ran an older version of this file (one photo per entry) before.
-- Safe to run again.
alter table public.entries add column if not exists photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3);
