# FiatClaw — Фаза 1: денежный рельс

Фундамент: **подключение кошелька → оплата SOL на казну → серверная проверка on-chain → создание игры**.

Исход (VRF), 3D-клешня, призы и вывод — следующие фазы.

## Железные правила безопасности

1. **Пока нет лицензии — только `devnet`.**  
   Mainnet не запустится, пока не выставлены **оба** флага `ALLOW_MAINNET=true` и `COMPLIANCE_CLEARED=true`.

2. **Клиенту не верим.**  
   Факт оплаты и исход игры решает только сервер. Браузер только платит и показывает результат.

3. **Секреты только на сервере.**  
   `SUPABASE_SERVICE_ROLE_KEY` и приватный ключ казны **никогда** не попадают в `NEXT_PUBLIC_*` и в браузер.

4. **Одна оплата = одна игра.**  
   Подпись транзакции пишется в `consumed_signatures` как UNIQUE. Двойное зачисление невозможно даже при гонке.

5. **Только `finalized`.**  
   Игру создаём только после финализации транзакции.

6. **Максимальный выигрыш = 250% ставки** (`MAX_WIN_MULTIPLIER = 2.5` в `lib/config.ts`).

## Структура

```
fiatclaw/
├── app/
│   ├── layout.tsx              # SolanaProvider
│   ├── page.tsx                # тестовая страница (Connect + Play)
│   └── api/play/start/route.ts # серверная проверка оплаты
├── components/
│   ├── SolanaProvider.tsx      # официальный wallet-adapter
│   ├── WalletConnectButton.tsx
│   └── PlayButton.tsx
├── lib/
│   ├── config.ts               # конфиг + предохранитель mainnet
│   ├── server.ts               # Connection + service-role Supabase
│   └── pay.ts                  # клиентский платёж (без секретов)
├── supabase/
│   └── schema.sql              # users, plays, consumed_signatures, prizes…
├── .env.example
├── package.json
└── tsconfig.json
```

## Деплой (по шагам)

### 1. Supabase
1. Создай проект.
2. SQL Editor → выполни `supabase/schema.sql`.
3. Скопируй: Project URL, `service_role` key, `anon` key.

### 2. Казна
- Создай **отдельный** кошелёк-казну (Phantom / Solflare).
- Публичный адрес → в `TREASURY_ADDRESS` и `NEXT_PUBLIC_TREASURY_ADDRESS`.
- Приватный ключ **нигде** в этом проекте не хранится (выплаты — отдельный сервис в Фазе 4).

### 3. Env
Скопируй `.env.example` → `.env.local` и заполни.  
На Vercel: Project Settings → Environment Variables — те же значения.  
`SOLANA_CLUSTER=devnet`.

### 4. Локально
```bash
cd fiatclaw
npm install
npm run dev
```
Открой http://localhost:3000 → Connect Wallet (Phantom в режиме Devnet) → ИГРАТЬ.

### 5. Тест на devnet
1. Получи devnet-SOL: https://faucet.solana.com
2. Подключи Phantom (Devnet).
3. Нажми «ИГРАТЬ» → подтверди перевод.
4. В ответе должно быть `ok: true` + `playId`.
5. В Supabase таблице `plays` появится запись `status = 'paid'`.
6. В `consumed_signatures` — подпись транзакции.

### 6. Vercel
Импортируй репозиторий, Framework = Next.js, привяжи домен.

## Что проверяет `/api/play/start`

| Проверка | Что делает |
|----------|------------|
| Существование + finalized | `getTransaction(..., commitment: "finalized")` |
| Без ошибки | `meta.err == null` |
| Получатель = казна | дельта баланса казны |
| Сумма ≥ цены | `received >= PRICE_LAMPORTS` |
| Плательщик = игрок | `feePayer === wallet` |
| Свежесть | `blockTime` не старше `MAX_TX_AGE_SEC` |
| Антиповтор | UNIQUE в `consumed_signatures` |

Все сценарии жульничества (повтор, чужой плательщик, недоплата, не та казна, старая tx) отсекаются.

## Дорожная карта

| Фаза | Что | Статус |
|------|-----|--------|
| 1 | Денежный рельс (этот код) | ✅ готов к деплою + тесту |
| 2 | Честный исход (Switchboard VRF + таблица вероятностей) | следующий |
| 3 | Полноэкранная 3D-клешня | после 2 |
| 4 | Инвентарь, баланс выигрышей, вывод | |
| 5 | Аудит, пентест, антифрод | |
| 6 | Запуск (после лицензии) | |

## Важно про лицензию

Принимать реальные ставки до лицензии — риск заморозки счетов и закрытия.  
Технику готовим и тестируем на **devnet**. Рубильник mainnet включаем только когда юрист скажет «можно».

## Что нужно от тебя сейчас

1. Создать Supabase-проект и выполнить `schema.sql`.
2. Создать кошелёк-казну и прописать адреса в env.
3. Заполнить `.env.local` / Vercel env.
4. `npm install && npm run dev` → протестировать оплату на devnet.
5. Когда подтвердишь, что `playId` создаётся — идём в **Фазу 2** (VRF + вероятности + 250% cap).
