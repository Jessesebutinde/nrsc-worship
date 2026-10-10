-- Lyric Slides: the shared song library (optional).
-- Run once in the Supabase SQL editor, then put the project URL and anon key in src/lyrics/config.js.
-- Remote <-> screen control uses Realtime broadcast on public channels named
-- "lyric-slides-<pairing code>", which needs no table.

create table if not exists lyric_team (
  email text primary key
);

-- Add the media team (they sign in with an emailed link):
-- insert into lyric_team (email) values ('someone@example.com');

create table if not exists lyric_songs (
  id text primary key,
  title text not null,
  language text not null default 'en' check (language in ('lg', 'en', 'mixed')),
  preset text not null default 'worship' check (preset in ('worship', 'praise', 'classic')),
  lyrics_raw text not null,
  slides jsonb not null,
  tags text[] not null default '{}',
  deleted boolean not null default false,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table lyric_songs enable row level security;
alter table lyric_team enable row level security;

create or replace function is_lyric_team() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from lyric_team where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

drop policy if exists "team reads songs" on lyric_songs;
create policy "team reads songs" on lyric_songs for select to authenticated using (is_lyric_team());
drop policy if exists "team adds songs" on lyric_songs;
create policy "team adds songs" on lyric_songs for insert to authenticated with check (is_lyric_team());
drop policy if exists "team edits songs" on lyric_songs;
create policy "team edits songs" on lyric_songs for update to authenticated using (is_lyric_team()) with check (is_lyric_team());
