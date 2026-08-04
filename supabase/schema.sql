-- FiatClaw — схема Фазы 1 (+ заготовки под следующие фазы)
-- Выполнить один раз в Supabase SQL Editor.
-- RLS включён везде. Клиент (anon key) НЕ может писать деньги/игры.
-- Пишет только service-role с сервера.

-- ── users ──────────────────────────────────────────────────────────────
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  wallet        text not null unique,          -- base58
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists users_wallet_idx on public.users (wallet);

-- ── consumed_signatures ────────────────────────────────────────────────
-- Одна подпись транзакции = одна игра. UNIQUE защищает от двойного зачисления
-- даже при параллельных запросах (гонка).
create table if not exists public.consumed_signatures (
  signature     text primary key,              -- base58 tx signature
  wallet        text not null,
  consumed_at   timestamptz not null default now()
);

create index if not exists consumed_signatures_wallet_idx
  on public.consumed_signatures (wallet);

-- ── plays ──────────────────────────────────────────────────────────────
-- status:
--   paid      — оплата подтверждена on-chain, исход ещё не определён (Фаза 1)
--   resolved  — исход получен (Фаза 2)
--   completed — игра полностью отыграна (Фаза 3)
--   refunded  — редкий случай возврата
create table if not exists public.plays (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id),
  wallet            text not null,
  signature         text not null unique,      -- та же подпись, что в consumed_signatures
  price_lamports    numeric not null,          -- сколько заплатили (для отчётов)
  cluster           text not null,             -- devnet / mainnet-beta
  status            text not null default 'paid'
                    check (status in ('paid','resolved','completed','refunded')),
  -- Фаза 2 заполнит:
  outcome           text,                      -- 'win' | 'lose' | null
  prize_id          uuid,
  prize_value_lamports numeric,
  vrf_request_id    text,
  -- Фаза 3:
  completed_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists plays_user_id_idx on public.plays (user_id);
create index if not exists plays_wallet_idx on public.plays (wallet);
create index if not exists plays_status_idx on public.plays (status);
create index if not exists plays_created_at_idx on public.plays (created_at desc);

-- ── prizes (каталог, настраивается админом) ────────────────────────────
create table if not exists public.prizes (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,      -- 'sol_small', 'claw_nft_1', 'jackpot'...
  kind              text not null               -- 'sol' | 'claw' | 'nft' | 'mystery' | 'jackpot'
                    check (kind in ('sol','claw','nft','mystery','jackpot')),
  title             text not null,
  -- value_lamports — сколько SOL-эквивалента (для SOL-призов = реальная сумма)
  value_lamports    numeric not null default 0,
  -- weight — относительный вес в таблице вероятностей (сервер считает сам)
  weight            integer not null default 1 check (weight >= 0),
  -- max_multiplier_cap — не выдавать приз дороже MAX_WIN_MULTIPLIER * ставка
  max_multiplier_cap numeric not null default 2.5,
  active            boolean not null default true,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── winnings (баланс выигрышей игрока, off-chain) ──────────────────────
create table if not exists public.winnings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id),
  wallet            text not null,
  play_id           uuid references public.plays(id),
  asset             text not null,             -- 'SOL' | 'CLAW' | 'NFT' | ...
  amount            numeric not null,          -- в минимальных единицах (lamports / tokens)
  status            text not null default 'available'
                    check (status in ('available','pending_withdrawal','withdrawn','cancelled')),
  created_at        timestamptz not null default now()
);

create index if not exists winnings_wallet_idx on public.winnings (wallet);
create index if not exists winnings_status_idx on public.winnings (status);

-- ── withdrawals ────────────────────────────────────────────────────────
create table if not exists public.withdrawals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id),
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
alter table public.winnings              enable row level security;
alter table public.withdrawals           enable row level security;

-- Политики: anon/authenticated НИЧЕГО не пишут в денежные таблицы.
-- Чтение витрин (prizes) можно разрешить позже через отдельную политику.
-- Service-role обходит RLS полностью — именно так сервер и пишет.

-- Пример (опционально, для публичной витрины призов):
-- create policy "prizes_public_read" on public.prizes
--   for select using (active = true);

-- Никаких insert/update/delete политик для anon — по умолчанию запрещено.
