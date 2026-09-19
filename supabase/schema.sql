-- phennellopy.ia — Supabase schema for memory sync
-- Run once in the Supabase SQL editor (Project → SQL Editor → New query)
-- before enabling sync in the app.

create table if not exists public.memories (
  id text primary key,
  question_text text not null,
  question_voice text not null,
  answer_text text not null,
  answer_voice text not null,
  embeddings jsonb,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security: enabled by default on new Supabase projects.
-- This app currently syncs with the anon key and no per-user auth, so the
-- simplest safe policy is "open to the anon key" — tighten this (e.g. add a
-- user_id column + auth.uid() check) before shipping to more than one user.
alter table public.memories enable row level security;

drop policy if exists "memories_anon_all" on public.memories;
create policy "memories_anon_all"
  on public.memories
  for all
  to anon
  using (true)
  with check (true);

-- Keep updated_at fresh on every upsert from the client.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists memories_set_updated_at on public.memories;
create trigger memories_set_updated_at
  before update on public.memories
  for each row
  execute function public.set_updated_at();
