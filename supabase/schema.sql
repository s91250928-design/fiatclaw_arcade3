-- FiatClaw / ClawArcade — full V1 schema
-- Run once in Supabase SQL Editor.
-- RLS on; client (anon) cannot write money/games state. Service-role only.

-- ── users ──────────────────────────────────────────────────────────────
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  wallet        text not null unique,
  available_plays integer not null default 0 check (available_plays >= 0),
  claw_balance  numeric not null default 0 check (claw_balance >= 0),
  staked_claw   numeric not null default 0 check (staked_claw >= 0),
  total_plays   integer not null default 0,
  wins          integer not null default 0,
  losses        integer not null default 0,
  sol_won_lamports numeric not null default 0,
  claw_won      numeric not null default 0,
  biggest_win_lamports numeric not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists users_wallet_idx on public.users (wallet);

-- ── consumed_signatures ────────────────────────────────────────────────
create table if not exists public.consumed_signatures (
  signature     text primary key,
  wallet        text not null,
  consumed_at   timestamptz not null default now()
);

create index if not exists consumed_signatures_wallet_idx
  on public.consumed_signatures (wallet);

-- ── plays ──────────────────────────────────────────────────────────────
create table if not exists public.plays (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.users(id),
  wallet            text not null,
  signature         text unique,
  price_lamports    numeric not null default 0,
  cluster           text not null default 'devnet',
  status            text not null default 'armed'
                    check (status in ('paid','armed','resolved','completed','refunded')),
  outcome           text check (outcome is null or outcome in ('win','lose')),
  prize_id          uuid,
  prize_code        text,
  prize_kind        text,
  prize_title       text,
  prize_value_lamports numeric,
  awarded_claw      numeric default 0,
  is_jackpot        boolean not null default false,
  message           text,
  vrf_request_id    text,
  completed_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists plays_user_id_idx on public.plays (user_id);
create index if not exists plays_wallet_idx on public.plays (wallet);
create index if not exists plays_status_idx on public.plays (status);
create index if not exists plays_created_at_idx on public.plays (created_at desc);

-- ── prizes ─────────────────────────────────────────────────────────────
create table if not exists public.prizes (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  kind              text not null
                    check (kind in ('sol','claw','nft','mystery','jackpot')),
  title             text not null,
  value_lamports    numeric not null default 0,
  claw_amount       numeric not null default 0,
  weight            integer not null default 1 check (weight >= 0),
  max_multiplier_cap numeric not null default 2.5,
  active            boolean not null default true,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── jackpot_state (single-row progressive pot) ─────────────────────────
create table if not exists public.jackpot_state (
  id                    int primary key default 1 check (id = 1),
  balance_lamports      numeric not null,
  base_lamports         numeric not null,
  contribution_lamports numeric not null,
  last_won_at           timestamptz,
  last_winner_wallet    text,
  updated_at            timestamptz not null default now()
);

-- ── game_config (single-row) ───────────────────────────────────────────
create table if not exists public.game_config (
  id                    int primary key default 1 check (id = 1),
  price_lamports        numeric not null default 50000000,
  claw_price            numeric not null default 500,
  max_win_multiplier    numeric not null default 2.5,
  jackpot_base_lamports numeric not null default 230000000,
  jackpot_contribution_lamports numeric not null default 2500000,
  machine_enabled       boolean not null default true,
  updated_at            timestamptz not null default now()
);

-- ── machines ───────────────────────────────────────────────────────────
create table if not exists public.machines (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  title         text not null,
  enabled       boolean not null default true,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

insert into public.machines (code, title, enabled)
values ('main', 'ClawArcade Main', true)
on conflict (code) do nothing;

-- ── winnings ───────────────────────────────────────────────────────────
create table if not exists public.winnings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.users(id),
  wallet            text not null,
  play_id           uuid references public.plays(id),
  asset             text not null,
  amount            numeric not null,
  status            text not null default 'available'
                    check (status in ('available','pending_withdrawal','withdrawn','cancelled')),
  created_at        timestamptz not null default now()
);

create index if not exists winnings_wallet_idx on public.winnings (wallet);
create index if not exists winnings_status_idx on public.winnings (status);

-- ── transactions (audit log) ───────────────────────────────────────────
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  wallet        text not null,
  type          text not null,
  amount        numeric not null default 0,
  asset         text not null,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists transactions_wallet_idx on public.transactions (wallet);
create index if not exists transactions_created_at_idx on public.transactions (created_at desc);

-- ── withdrawals ────────────────────────────────────────────────────────
create table if not exists public.withdrawals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.users(id),
  wallet            text not null,
  asset             text not null,
  amount            numeric not null,
  status            text not null default 'requested'
                    check (status in ('requested','approved','rejected','paid')),
  admin_note        text,
  paid_tx_signature text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.users                 enable row level security;
alter table public.consumed_signatures   enable row level security;
alter table public.plays                 enable row level security;
alter table public.prizes                enable row level security;
alter table public.jackpot_state         enable row level security;
alter table public.game_config           enable row level security;
alter table public.machines              enable row level security;
alter table public.winnings              enable row level security;
alter table public.transactions          enable row level security;
alter table public.withdrawals           enable row level security;

-- Optional public read for active prizes / live jackpot display
-- create policy "prizes_public_read" on public.prizes for select using (active = true);
