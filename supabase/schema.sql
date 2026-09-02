-- Hörbar schema.
--
-- Optional. Without it the app reads data/catalog/*.json from the bundle and
-- keeps the vocabulary vault in localStorage. Add it when you want curators to
-- publish episodes without a redeploy, or learners to sync a vault across
-- devices.

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- catalog
-- --------------------------------------------------------------------------

create table if not exists public.episodes (
  id            text primary key,
  slug          text not null unique,
  title         text not null,
  publisher     text not null,
  cefr          text not null check (cefr in ('A1','A2','B1','B2','C1','C2')),
  sdm           integer not null default 0 check (sdm between 0 and 100),
  duration_sec  numeric not null default 0,
  -- The whole precomputed Episode payload: transcript, word timings, glossary,
  -- metrics, quiz, drills. One row is one page load; the client never joins.
  payload       jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists episodes_cefr_idx on public.episodes (cefr, sdm);
create index if not exists episodes_topics_idx on public.episodes using gin ((payload -> 'topics'));

alter table public.episodes enable row level security;

-- The catalog is public reading material.
drop policy if exists "episodes are readable by everyone" on public.episodes;
create policy "episodes are readable by everyone"
  on public.episodes for select
  using (true);

-- Writes come from the ingest worker with the service role key, which bypasses
-- RLS, so no insert or update policy is granted to anon or authenticated.

-- --------------------------------------------------------------------------
-- vocabulary vault (only needed for cross-device sync)
-- --------------------------------------------------------------------------

create table if not exists public.vault_entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  -- Stable key so the same word from the same episode never duplicates.
  entry_key      text not null,
  surface        text not null,
  lemma          text not null,
  pos            text,
  article        text check (article in ('der','die','das')),
  plural         text,
  translations   jsonb not null default '{"en":[],"vi":[]}'::jsonb,
  context        jsonb not null,
  -- SM-2 state, mirrored from the client so review history survives a reinstall.
  ease           numeric not null default 2.5,
  interval_days  integer not null default 0,
  repetitions    integer not null default 0,
  lapses         integer not null default 0,
  due_at         timestamptz not null default now(),
  last_reviewed  timestamptz,
  history        jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  unique (user_id, entry_key)
);

create index if not exists vault_due_idx on public.vault_entries (user_id, due_at);

alter table public.vault_entries enable row level security;

drop policy if exists "learners read their own vault" on public.vault_entries;
create policy "learners read their own vault"
  on public.vault_entries for select
  using (auth.uid() = user_id);

drop policy if exists "learners write their own vault" on public.vault_entries;
create policy "learners write their own vault"
  on public.vault_entries for insert
  with check (auth.uid() = user_id);

drop policy if exists "learners update their own vault" on public.vault_entries;
create policy "learners update their own vault"
  on public.vault_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "learners delete their own vault" on public.vault_entries;
create policy "learners delete their own vault"
  on public.vault_entries for delete
  using (auth.uid() = user_id);

-- --------------------------------------------------------------------------
-- keep updated_at honest
-- --------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists episodes_touch_updated_at on public.episodes;
create trigger episodes_touch_updated_at
  before update on public.episodes
  for each row execute function public.touch_updated_at();
