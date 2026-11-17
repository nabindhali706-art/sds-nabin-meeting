-- SDS NABIN MEETING: initial database schema
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  preferred_language text not null default 'en' check (preferred_language in ('en','bn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled meeting',
  room_name text not null unique,
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists meetings_host_created_idx
  on public.meetings(host_id, created_at desc);

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  role text not null default 'participant' check (role in ('host','participant')),
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

create index if not exists meeting_participants_meeting_idx
  on public.meeting_participants(meeting_id, joined_at desc);

create table if not exists public.meeting_messages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists meeting_messages_meeting_created_idx
  on public.meeting_messages(meeting_id, created_at asc);

-- Create a profile automatically for each new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.meeting_messages enable row level security;

-- Profiles: users can read their own profile and update their own profile.
create policy "Profiles are readable by owner"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "Profiles are insertable by owner"
on public.profiles for insert to authenticated
with check (id = (select auth.uid()));

create policy "Profiles are updateable by owner"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Meetings: authenticated users can create rooms and read rooms they host.
-- A later iteration can add invite-based access for non-host users.
create policy "Hosts can create meetings"
on public.meetings for insert to authenticated
with check (host_id = (select auth.uid()));

create policy "Authenticated users can read meeting metadata"
on public.meetings for select to authenticated
using (true);

create policy "Hosts can update their meetings"
on public.meetings for update to authenticated
using (host_id = (select auth.uid()))
with check (host_id = (select auth.uid()));

create policy "Hosts can delete their meetings"
on public.meetings for delete to authenticated
using (host_id = (select auth.uid()));

-- Participant and message policies are intentionally restrictive in MVP.
-- Writes are added through trusted Edge Functions in the next iteration.
create policy "Authenticated users can read participants"
on public.meeting_participants for select to authenticated
using (true);

create policy "Authenticated users can read meeting messages"
on public.meeting_messages for select to authenticated
using (true);
