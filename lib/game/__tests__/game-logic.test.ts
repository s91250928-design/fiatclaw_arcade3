/**
 * Unit tests against shipped pure game logic (no mocks of units under test).
 * Run: npx tsx lib/game/__tests__/game-logic.test.ts
 */

import assert from "node:assert/strict";
import {
  LOSE_MESSAGE,
  activePrizes,
  addPlays,
  applyPlayToPlayerStats,
  awardAndResetJackpot,
  clawCost,
  consumePlay,
  contributeJackpot,
  createDropGuard,
  createJackpotState,
  createTestStore,
  debitClaw,
  defaultPrizeCatalog,
  feeMultiplierForStake,
  isDropUiBusy,
  mulberry32,
  rankLeaderboard,
  resolveOutcome,
  selectWeightedPrize,
  simulateWinRate,
  solCostLamports,
  stakeClaw,
  tierForStake,
  unstakeClaw,
  WIN_PROBABILITY,
  buildPrizePileLayout,
  isMoneyPrizeKind,
  layoutFillsLowerBand,
  layoutHasRequiredKinds,
  winningPrizes,
  clawFingersOpen,
  clawOverlayText,
  clawPullSequence,
  clawShouldHoldPrize,
  clawStatusLabel,
  isClawBusyPhase,
  nextClawPhase,
  updateSlippedLatch,
  advancePullClick,
  canClickPull,
  canMoveClaw,
  pullClickStep,
  pullRecoverySequence,
  CLAW_FINGER_COUNT,
  type PrizeEntry,
  type ResolvedPlay,
} from "../index";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(e);
  }
}

console.log("\n=== ClawArcade game logic tests ===\n");

// ── (a) weighted prize selection ───────────────────────────────────────
console.log("(a) weighted selection & catalog");

test("active catalog entries only; never empty when weights exist", () => {
  const cat = defaultPrizeCatalog();
  const active = activePrizes(cat);
  assert.ok(active.length >= 5);
  assert.ok(active.every((p) => p.active && p.weight > 0));
  const kinds = new Set(active.map((p) => p.kind));
  for (const k of ["sol", "claw", "nft", "mystery", "jackpot"] as const) {
    assert.ok(kinds.has(k), `missing kind ${k}`);
  }
});

test("selectWeightedPrize respects weights (deterministic seed)", () => {
  const cat: PrizeEntry[] = [
    {
      id: "a",
      code: "a",
      kind: "sol",
      title: "A",
      valueLamports: 1,
      clawAmount: 0,
      weight: 1000,
      active: true,
      maxMultiplierCap: 2.5,
    },
    {
      id: "b",
      code: "b",
      kind: "sol",
      title: "B",
      valueLamports: 1,
      clawAmount: 0,
      weight: 1,
      active: true,
      maxMultiplierCap: 2.5,
    },
    {
      id: "off",
      code: "off",
      kind: "sol",
      title: "Off",
      valueLamports: 99,
      clawAmount: 0,
      weight: 9999,
      active: false,
      maxMultiplierCap: 2.5,
    },
  ];
  const rng = mulberry32(42);
  let aCount = 0;
  for (let i = 0; i < 200; i++) {
    const p = selectWeightedPrize(cat, rng);
    assert.ok(p && p.code !== "off");
    if (p!.code === "a") aCount++;
  }
  assert.ok(aCount > 180, `expected A-dominant, got ${aCount}/200`);
});

test("resolveOutcome never uses client won flag — only RNG + catalog", () => {
  const cat = defaultPrizeCatalog();
  // First rng() is win gate: ≥ WIN_PROBABILITY (0.2) → lose
  const loseRng = () => 0.5;
  const d = resolveOutcome(cat, {
    stakeLamports: 50_000_000,
    maxWinMultiplier: 2.5,
    jackpotBalanceLamports: 230_000_000,
    rng: loseRng,
  });
  assert.equal(d.outcome, "lose");
  assert.equal(d.message, LOSE_MESSAGE);
  assert.equal(d.message, "Better Luck Next Pull.");
});

test("resolveOutcome wins when gate roll is below WIN_PROBABILITY", () => {
  const cat = defaultPrizeCatalog();
  let calls = 0;
  const rng = () => {
    calls += 1;
    // first call: gate win (0.05 < 0.2); second: pick first prize
    return calls === 1 ? 0.05 : 0;
  };
  const d = resolveOutcome(cat, {
    stakeLamports: 50_000_000,
    maxWinMultiplier: 2.5,
    jackpotBalanceLamports: 230_000_000,
    rng,
  });
  assert.equal(d.outcome, "win");
  assert.ok(d.prize);
  assert.notEqual(d.message, LOSE_MESSAGE);
});

// ── (b) play credits ───────────────────────────────────────────────────
console.log("\n(b) play credits");

test("add plays then consume exactly one; reject at zero", () => {
  let state = { availablePlays: 0 };
  const bought = addPlays(state, 3);
  assert.equal(bought.ok, true);
  if (!bought.ok) return;
  state = { availablePlays: bought.availablePlays };
  assert.equal(state.availablePlays, 3);

  const c1 = consumePlay(state);
  assert.equal(c1.ok, true);
  if (!c1.ok) return;
  assert.equal(c1.availablePlays, 2);

  const c2 = consumePlay({ availablePlays: 1 });
  assert.equal(c2.ok, true);
  if (!c2.ok) return;
  assert.equal(c2.availablePlays, 0);

  const c3 = consumePlay({ availablePlays: 0 });
  assert.equal(c3.ok, false);
  if (c3.ok) return;
  assert.equal(c3.error, "no plays available");
  assert.equal(c3.availablePlays, 0);
});

test("store startAttempt deducts one play", () => {
  const store = createTestStore();
  store.creditClawBalance("Wallet1111111111111111111111111111111", 10_000);
  const buy = store.buyPlaysWithClaw("Wallet1111111111111111111111111111111", 2);
  assert.equal(buy.ok, true);
  if (!buy.ok) return;
  assert.equal(buy.availablePlays, 2);
  const start = store.startAttempt("Wallet1111111111111111111111111111111");
  assert.equal(start.ok, true);
  if (!start.ok) return;
  assert.equal(start.availablePlays, 1);
  const zero = store.startAttempt("Wallet2222222222222222222222222222222");
  assert.equal(zero.ok, false);
});

// ── (c) jackpot ────────────────────────────────────────────────────────
console.log("\n(c) jackpot");

test("contribute increases balance; jackpot win resets to base", () => {
  let jp = createJackpotState(100_000_000, 1_000_000);
  assert.equal(jp.balanceLamports, 100_000_000);
  jp = contributeJackpot(jp);
  assert.equal(jp.balanceLamports, 101_000_000);
  jp = contributeJackpot(jp);
  assert.equal(jp.balanceLamports, 102_000_000);
  const { awarded, state } = awardAndResetJackpot(jp, "WinnerWalletxxxxxxxxxx");
  assert.equal(awarded, 102_000_000);
  assert.equal(state.balanceLamports, 100_000_000);
  assert.equal(state.lastWinnerWallet, "WinnerWalletxxxxxxxxxx");
});

test("store resolve path contributes every play and resets on jackpot prize", () => {
  const store = createTestStore();
  const w = "JackpotWallet11111111111111111111111";
  store.creditClawBalance(w, 100_000);
  store.buyPlaysWithClaw(w, 5);
  const before = store.jackpot.balanceLamports;
  const start = store.startAttempt(w);
  assert.ok(start.ok);
  if (!start.ok) return;

  // Force jackpot by using a catalog of only jackpot + resolving with rng that picks it
  store.prizes = [
    {
      id: "jp",
      code: "jackpot",
      kind: "jackpot",
      title: "Jackpot Cube",
      valueLamports: 200_000_000,
      clawAmount: 0,
      weight: 1,
      active: true,
      maxMultiplierCap: 2.5,
    },
  ];
  // gate < 0.2 → win, second call picks jackpot (only prize)
  let n = 0;
  const rng = () => {
    n += 1;
    return n === 1 ? 0.05 : 0;
  };
  const r = store.resolveAttempt(start.playId, w, rng);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.result.isJackpot, true);
  assert.equal(r.result.outcome, "win");
  // Contributed once then awarded full pot, then reset to base
  assert.equal(store.jackpot.balanceLamports, store.jackpot.baseLamports);
  assert.ok(r.result.awardedLamports >= before);
});

// ── (d) staking does not affect odds ───────────────────────────────────
console.log("\n(d) staking fee only — odds independent");

test("fee multiplier reduces cost but not prize selection", () => {
  const mult0 = feeMultiplierForStake(0);
  const multHi = feeMultiplierForStake(100_000);
  assert.equal(mult0, 1);
  assert.ok(multHi < 1);

  const base = 50_000_000;
  assert.equal(solCostLamports(1, base, mult0), base);
  assert.ok(solCostLamports(1, base, multHi) < base);
  assert.ok(clawCost(1, 500, multHi) < clawCost(1, 500, mult0));

  const cat = defaultPrizeCatalog();
  const seed = 12345;
  const d1 = resolveOutcome(cat, {
    stakeLamports: base,
    maxWinMultiplier: 2.5,
    jackpotBalanceLamports: 230_000_000,
    rng: mulberry32(seed),
  });
  const d2 = resolveOutcome(cat, {
    stakeLamports: base,
    maxWinMultiplier: 2.5,
    jackpotBalanceLamports: 230_000_000,
    rng: mulberry32(seed),
  });
  assert.equal(d1.outcome, d2.outcome);
  assert.equal(d1.prize?.code, d2.prize?.code);
  assert.equal(d1.awardedLamports, d2.awardedLamports);
  // Staking state is irrelevant to resolveOutcome — no stake param exists
  assert.equal(tierForStake(0).vip, false);
  assert.equal(tierForStake(5000).vip, true);
});

test("stake/unstake ledger", () => {
  const s = stakeClaw(5000, 0, 1000);
  assert.equal(s.ok, true);
  if (!s.ok) return;
  assert.equal(s.clawBalance, 4000);
  assert.equal(s.stakedClaw, 1000);
  const u = unstakeClaw(s.clawBalance, s.stakedClaw, 500);
  assert.equal(u.ok, true);
  if (!u.ok) return;
  assert.equal(u.stakedClaw, 500);
  assert.equal(u.clawBalance, 4500);
});

// ── (e) leaderboard aggregation ────────────────────────────────────────
console.log("\n(e) leaderboard");

test("aggregate stats match fixture for windows", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");
  const plays: ResolvedPlay[] = [
    {
      playId: "1",
      wallet: "AAA",
      outcome: "win",
      prizeCode: "sol_small",
      prizeKind: "sol",
      prizeTitle: "SOL",
      awardedLamports: 50_000_000,
      awardedClaw: 0,
      isJackpot: false,
      message: "win",
      remainingPlays: 0,
      jackpotBalanceLamports: 0,
      createdAt: "2026-08-04T10:00:00.000Z",
    },
    {
      playId: "2",
      wallet: "AAA",
      outcome: "lose",
      prizeCode: null,
      prizeKind: null,
      prizeTitle: null,
      awardedLamports: 0,
      awardedClaw: 0,
      isJackpot: false,
      message: LOSE_MESSAGE,
      remainingPlays: 0,
      jackpotBalanceLamports: 0,
      createdAt: "2026-08-03T10:00:00.000Z",
    },
    {
      playId: "3",
      wallet: "BBB",
      outcome: "win",
      prizeCode: "claw_pack",
      prizeKind: "claw",
      prizeTitle: "CLAW",
      awardedLamports: 40_000_000,
      awardedClaw: 600,
      isJackpot: false,
      message: "win",
      remainingPlays: 0,
      jackpotBalanceLamports: 0,
      createdAt: "2026-07-01T10:00:00.000Z",
    },
  ];

  const all = rankLeaderboard(plays, "all", "solWonLamports", now);
  assert.equal(all.length, 2);
  const aaa = all.find((r) => r.wallet === "AAA")!;
  assert.equal(aaa.totalPlays, 2);
  assert.equal(aaa.wins, 1);
  assert.equal(aaa.losses, 1);
  assert.equal(aaa.solWonLamports, 50_000_000);
  assert.equal(aaa.biggestWinLamports, 50_000_000);

  const daily = rankLeaderboard(plays, "daily", "totalPlays", now);
  assert.equal(daily.length, 1);
  assert.equal(daily[0]!.wallet, "AAA");
  assert.equal(daily[0]!.totalPlays, 1);

  const weekly = rankLeaderboard(plays, "weekly", "wins", now);
  assert.ok(weekly.some((r) => r.wallet === "AAA"));
  assert.ok(!weekly.some((r) => r.wallet === "BBB"));

  const stats = applyPlayToPlayerStats(
    { totalPlays: 0, wins: 0, losses: 0, solWonLamports: 0, clawWon: 0, biggestWinLamports: 0 },
    { outcome: "win", awardedLamports: 10, awardedClaw: 5 }
  );
  assert.equal(stats.wins, 1);
  assert.equal(stats.clawWon, 5);
});

// ── (f) Win probability 20% (server-only constant) ─────────────────────
console.log("\n(f) win probability 20%");

test("WIN_PROBABILITY is exactly 0.2", () => {
  assert.equal(WIN_PROBABILITY, 0.2);
});

test("Monte Carlo win rate ≈ 20% within ±2pp", () => {
  const cat = defaultPrizeCatalog();
  const rng = mulberry32(99);
  const N = 50_000;
  const rate = simulateWinRate(cat, N, rng);
  console.log(`    simulated win rate (N=${N}) = ${rate.toFixed(4)}`);
  assert.ok(rate >= 0.18, `win rate ${rate} below 0.18`);
  assert.ok(rate <= 0.22, `win rate ${rate} above 0.22`);
});

// ── debit claw ─────────────────────────────────────────────────────────
test("debitClaw rejects insufficient balance", () => {
  const r = debitClaw(100, 500);
  assert.equal(r.ok, false);
});

// ── store full loop lose message ───────────────────────────────────────
test("lose path returns exact Better Luck Next Pull.", () => {
  const store = createTestStore();
  const w = "LoseWallet1111111111111111111111111";
  store.creditClawBalance(w, 50_000);
  store.buyPlaysWithClaw(w, 1);
  const s = store.startAttempt(w);
  assert.ok(s.ok);
  if (!s.ok) return;
  // gate roll 0.9 ≥ 0.2 → lose
  const r = store.resolveAttempt(s.playId, w, () => 0.9);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.result.outcome, "lose");
  assert.equal(r.result.message, "Better Luck Next Pull.");
});

// ── Claw phase chrome (status vocabulary + sequence) ───────────────────
console.log("\n(i) claw phases / PULL sequence");

test("status labels cover STANDBY→ARMED→DESCENDING→LOCKING→RETRACTING→WIN/MISS", () => {
  assert.equal(clawStatusLabel("idle"), "STANDBY");
  assert.equal(clawStatusLabel("ready"), "ARMED");
  assert.equal(clawStatusLabel("drop"), "DESCENDING");
  assert.equal(clawStatusLabel("close"), "LOCKING");
  assert.equal(clawStatusLabel("lift"), "RETRACTING");
  assert.equal(clawStatusLabel("hold"), "RETRACTING");
  assert.equal(clawStatusLabel("return"), "RETRACTING");
  assert.equal(clawStatusLabel("win"), "WIN");
  assert.equal(clawStatusLabel("lose"), "MISS");
  assert.equal(clawStatusLabel("slip"), "MISS");
});

test("PULL sequence progresses busy phases then recover to ARMED", () => {
  const winSeq = clawPullSequence(true);
  assert.deepEqual(winSeq, [
    "drop",
    "close",
    "lift",
    "hold",
    "return",
    "win",
    "ready",
  ]);
  const loseSeq = clawPullSequence(false);
  assert.deepEqual(loseSeq, [
    "drop",
    "close",
    "lift",
    "slip",
    "return",
    "lose",
    "ready",
  ]);
  // step through win path
  let p: ReturnType<typeof nextClawPhase> = "ready";
  p = nextClawPhase(p, true);
  assert.equal(p, "drop");
  assert.equal(isClawBusyPhase(p), true);
  p = nextClawPhase(p, true);
  assert.equal(p, "close");
  assert.equal(clawStatusLabel(p), "LOCKING");
  while (p !== "ready") {
    p = nextClawPhase(p, true);
  }
  assert.equal(p, "ready");
  assert.equal(clawStatusLabel(p), "ARMED");
});

test("3-click PULL advances drop → close/grab → lift via advancePullClick", () => {
  assert.equal(CLAW_FINGER_COUNT, 3);
  assert.equal(advancePullClick("idle"), "drop");
  assert.equal(advancePullClick("ready"), "drop");
  assert.equal(advancePullClick("drop"), "close");
  assert.equal(advancePullClick("close"), "lift");
  assert.equal(advancePullClick("lift"), null);
  assert.equal(advancePullClick("hold"), null);
  assert.equal(pullClickStep("drop"), 1);
  assert.equal(pullClickStep("close"), 2);
  assert.equal(pullClickStep("lift"), 3);
  assert.equal(pullClickStep("ready"), 0);
  assert.equal(canClickPull("ready"), true);
  assert.equal(canClickPull("drop"), true);
  assert.equal(canClickPull("close"), true);
  assert.equal(canClickPull("lift"), false);
  assert.equal(canMoveClaw("ready"), true);
  assert.equal(canMoveClaw("drop"), false);
  assert.deepEqual(pullRecoverySequence(true), [
    "hold",
    "return",
    "win",
    "ready",
  ]);
  assert.deepEqual(pullRecoverySequence(false), [
    "slip",
    "return",
    "lose",
    "ready",
  ]);
});

test("win overlay SECURED / lose overlay MISS + message path", () => {
  assert.equal(clawOverlayText("win"), "SECURED");
  assert.equal(clawOverlayText("lose"), "MISS");
  assert.equal(clawOverlayText("drop"), null);
  assert.equal(LOSE_MESSAGE, "Better Luck Next Pull.");
});

test("win path keeps prize held + fingers closed through return → SECURED", () => {
  // Simulate sequence: drop→close→lift→hold→return→win→ready
  let slipped = false;
  const winSteps: Array<Parameters<typeof clawShouldHoldPrize>[0]> = [
    "drop",
    "close",
    "lift",
    "hold",
    "return",
    "win",
    "ready",
  ];
  for (const ph of winSteps) {
    slipped = updateSlippedLatch(ph, slipped);
    if (ph === "close" || ph === "lift" || ph === "hold" || ph === "return" || ph === "win") {
      assert.equal(
        clawShouldHoldPrize(ph, slipped),
        true,
        `hold prize on win phase ${ph}`
      );
      assert.equal(
        clawFingersOpen(ph, slipped),
        false,
        `fingers closed on win phase ${ph}`
      );
    }
    if (ph === "drop") {
      assert.equal(clawShouldHoldPrize(ph, slipped), false);
      assert.equal(clawFingersOpen(ph, slipped), true);
    }
  }
  assert.equal(slipped, false, "win path never latches slip");
});

test("lose path opens fingers and drops prize after slip (incl. return)", () => {
  let slipped = false;
  for (const ph of ["drop", "close", "lift", "slip", "return", "lose", "ready"] as const) {
    slipped = updateSlippedLatch(ph, slipped);
    if (ph === "close" || ph === "lift") {
      assert.equal(clawShouldHoldPrize(ph, slipped), true);
      assert.equal(clawFingersOpen(ph, slipped), false);
    }
    if (ph === "slip" || ph === "return" || ph === "lose") {
      assert.equal(slipped, true);
      assert.equal(
        clawShouldHoldPrize(ph, slipped),
        false,
        `no hold on lose phase ${ph}`
      );
      assert.equal(
        clawFingersOpen(ph, slipped),
        true,
        `fingers open on lose phase ${ph}`
      );
    }
  }
});

// ── DROP re-entrancy guard (shipped lock used by /play) ────────────────
console.log("\n(g) DROP re-entrancy guard");

test("createDropGuard blocks concurrent acquires until release", () => {
  const g = createDropGuard();
  assert.equal(g.tryAcquire(), true);
  assert.equal(g.isLocked(), true);
  assert.equal(g.tryAcquire(), false, "second acquire must fail while locked");
  assert.equal(g.tryAcquire(), false);
  g.release();
  assert.equal(g.isLocked(), false);
  assert.equal(g.tryAcquire(), true);
  g.release();
});

test("isDropUiBusy allows mid 3-step PULL (drop/close) while blocking recovery", () => {
  assert.equal(isDropUiBusy("starting", "ready"), true);
  assert.equal(isDropUiBusy("playing", "idle"), true);
  assert.equal(isDropUiBusy("buying", "idle"), true);
  assert.equal(isDropUiBusy("ready", "ready"), false);
  assert.equal(isDropUiBusy("idle", "idle"), false);
  // Player must click PULL again during drop/close
  assert.equal(isDropUiBusy("playing", "drop"), false);
  assert.equal(isDropUiBusy("playing", "close"), false);
  assert.equal(isDropUiBusy("ready", "drop"), false);
  // After lift, auto recovery — busy
  assert.equal(isDropUiBusy("playing", "lift"), true);
  assert.equal(isDropUiBusy("playing", "hold"), true);
  assert.equal(isDropUiBusy("success", "win"), true);
});

test("double start without client guard burns two plays (why lock is required)", () => {
  const store = createTestStore();
  const w = "DoubleDropWallet1111111111111111111";
  store.creditClawBalance(w, 50_000);
  store.buyPlaysWithClaw(w, 3);
  const a = store.startAttempt(w);
  const b = store.startAttempt(w);
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.equal(a.availablePlays, 2);
  assert.equal(b.availablePlays, 1);
  // Client drop-guard must prevent this double-call path for one DROP.
});

// ── Admin SOL price stays authoritative for buy/verify ─────────────────
console.log("\n(h) admin price ↔ SOL cost sync");

test("partial updateConfig does not disable machine or wipe other fields", () => {
  const store = createTestStore();
  assert.equal(store.config.machineEnabled, true);
  store.updateConfig({ priceLamports: 60_000_000 });
  assert.equal(store.config.machineEnabled, true, "machine must stay enabled");
  assert.equal(store.config.clawPrice, 500);
  // Explicit undefined must not clobber
  store.updateConfig({ machineEnabled: undefined as unknown as boolean });
  assert.equal(store.config.machineEnabled, true);
  const w = "MachineStayOnWallet11111111111111111";
  store.creditClawBalance(w, 10_000);
  store.buyPlaysWithClaw(w, 1);
  const started = store.startAttempt(w);
  assert.equal(started.ok, true, "start must work after price-only admin patch");
});

test("after update_config, solCostLamports and store buy use new priceLamports", () => {
  const store = createTestStore();
  const oldPrice = store.config.priceLamports;
  assert.equal(oldPrice, 50_000_000);
  store.updateConfig({ priceLamports: 60_000_000 });
  assert.equal(store.config.priceLamports, 60_000_000);
  assert.equal(store.config.machineEnabled, true);

  // Same formula API routes use: store.config.priceLamports (not env CONFIG).
  const unitPrice = store.config.priceLamports;
  const minFor1 = solCostLamports(1, unitPrice, 1);
  assert.equal(minFor1, 60_000_000);
  const minFor3 = solCostLamports(3, unitPrice, 1);
  assert.equal(minFor3, 180_000_000);

  // buyPlaysWithSol ledger cost tracks store price
  const w = "PriceSyncWallet11111111111111111111";
  const buy = store.buyPlaysWithSol(w, 2, "sig_price_sync_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(buy.ok, true);
  if (!buy.ok) return;
  assert.equal(buy.costLamports, solCostLamports(2, store.config.priceLamports, 1));
  assert.equal(buy.costLamports, 120_000_000);

  // Staking fee multiplies the admin unit price, not a stale env default
  store.creditClawBalance(w, 100_000);
  store.stake(w, 100_000); // Diamond VIP 0.8
  const mult = feeMultiplierForStake(store.ensurePlayer(w).stakedClaw);
  assert.equal(mult, 0.8);
  const discounted = solCostLamports(1, store.config.priceLamports, mult);
  assert.equal(discounted, Math.ceil(60_000_000 * 0.8));
});

// ── Money-only prizes (catalog + visual pile) ──────────────────────────
console.log("\n(k) money-only prizes");

test("active catalog winners are all money-valued (SOL/$CLAW/jackpot/nft/mystery)", () => {
  const winners = winningPrizes(defaultPrizeCatalog());
  assert.ok(winners.length >= 5);
  for (const p of winners) {
    const money =
      p.kind === "jackpot" ||
      p.valueLamports > 0 ||
      p.clawAmount > 0 ||
      p.kind === "nft" ||
      p.kind === "mystery";
    assert.ok(money, `empty toy prize: ${p.code}`);
    assert.notEqual(p.code, "lose");
  }
});

test("visual pile is dense FIATCLAW + crystal + SOL billboards, lower band", () => {
  const layout = buildPrizePileLayout(42);
  assert.ok(layout.length >= 60, `need dense pile, got ${layout.length}`);
  assert.ok(layoutFillsLowerBand(layout));
  assert.ok(layoutHasRequiredKinds(layout), "must include FIATCLAW+crystal+SOL");
  assert.ok(layout.every((p) => isMoneyPrizeKind(p.kind)));
  const kinds = new Set(layout.map((p) => p.kind));
  assert.ok(kinds.has("fiatclaw_token"));
  assert.ok(kinds.has("sol_token"));
  assert.ok(kinds.has("crystal") || kinds.has("crystal_purple"));
  // Every prize has a /refs texture path (billboard assets)
  assert.ok(layout.every((p) => p.texture && p.texture.startsWith("/refs/")));
  const ys = layout.map((p) => p.position[1]);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 0.02);
});

// ── Premium industrial machine structure ───────────────────────────────
console.log("\n(j) premium industrial claw machine");

test("ClawScene ships glass cylinder vault + single 3-blade industrial claw", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const scenePath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "components",
    "claw",
    "ClawScene.tsx"
  );
  const src = fs.readFileSync(scenePath, "utf8");
  assert.ok(src.includes('CABINET_SHELL_MODE = "hollow-open-front"'));
  assert.ok(src.includes("VaultShell") || src.includes("glass-cylinder"));
  assert.ok(src.includes("meshPhysicalMaterial"), "glass cylinder body");
  assert.ok(src.includes("cylinderGeometry"), "cylindrical chamber");
  assert.ok(src.includes("CLAW_BLADES") || src.includes("fingers"));
  assert.ok(
    src.includes("claw-industrial") ||
      src.includes("claw-sprite") ||
      src.includes("ClawAssembly")
  );
  const assemblies = src.match(/function ClawAssembly/g) || [];
  assert.equal(assemblies.length, 1, "one ClawAssembly definition");
  assert.ok(src.includes("<ClawAssembly"));
  assert.ok(src.includes("buildPrizePileLayout") || src.includes("PrizePile"));
  assert.ok(src.includes("InteriorFog") || src.includes("fog"));
});

test("PrizeMeshes are sprite billboards from public/refs (no Sphere/Box/Icosa prizes)", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const root = path.join(__dirname, "..", "..", "..");
  const meshPath = path.join(root, "components", "claw", "PrizeMeshes.tsx");
  const src = fs.readFileSync(meshPath, "utf8");
  assert.ok(src.includes("sprite-billboard") || src.includes("PRIZE_RENDER_MODE"));
  assert.ok(src.includes("planeGeometry"), "billboard plane");
  assert.ok(src.includes("useTexture") || src.includes("/refs/"));
  assert.ok(src.includes("/refs/"), "loads public/refs textures");
  // Forbidden primitive prize piles
  assert.equal(src.includes("sphereGeometry"), false, "no sphere prizes");
  assert.equal(src.includes("icosahedronGeometry"), false, "no icosa prizes");
  assert.equal(src.includes("boxGeometry"), false, "no box prizes");
  assert.equal(src.includes("octahedronGeometry"), false, "no octa prizes");
  // Assets on disk
  for (const f of [
    "fiatclaw-token.png",
    "crystal.png",
    "sol-token.png",
  ]) {
    assert.ok(
      fs.existsSync(path.join(root, "public", "refs", f)),
      `missing public/refs/${f}`
    );
  }
});

test("Prize emblems: $FIATCLAW 3-blade claw + SOL bars (no V crow-foot art)", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const root = path.join(__dirname, "..", "..", "..");
  const genPath = path.join(root, "scripts", "generate-prize-art.mjs");
  const gen = fs.readFileSync(genPath, "utf8");
  // Generator must draw industrial 3-blade claw emblem
  assert.ok(
    gen.includes("drawFiatClawEmblem") || gen.includes("Three curved blades"),
    "generator draws 3-blade claw emblem"
  );
  assert.ok(gen.includes("$FIATCLAW"), "FIATCLAW label in generator");
  assert.ok(gen.includes("#9945FF") && gen.includes("#14F195"), "Solana bar colors");
  // Forbidden old V-arrow crow-foot (3 lines from bottom tip only)
  assert.equal(
    gen.includes("ctx.moveTo(128, 175)") && gen.includes("ctx.lineTo(95, 105)"),
    false,
    "must not use old V-arrow stroke paths"
  );
  // Shipped textures exist and are non-trivial PNGs
  const refs = path.join(root, "public", "refs");
  for (const f of [
    "fiatclaw-token.png",
    "sol-token.png",
    "jackpot-cube.png",
    "nft-box.png",
    "mystery-box.png",
    "crystal.png",
  ]) {
    const p = path.join(refs, f);
    assert.ok(fs.existsSync(p), `missing ${f}`);
    const st = fs.statSync(p);
    assert.ok(st.size > 4000, `${f} too small (${st.size}) — likely broken art`);
  }
  // prize-visuals maps to correct paths
  const vis = fs.readFileSync(path.join(root, "lib", "game", "prize-visuals.ts"), "utf8");
  assert.ok(vis.includes('fiatclaw_token: "/refs/fiatclaw-token.png"'));
  assert.ok(vis.includes('sol_token: "/refs/sol-token.png"'));
});

test("Dashboard hosts clickable PULL + joystick; machine mounts canvas", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const root = path.join(__dirname, "..", "..", "..");
  const playSrc = fs.readFileSync(path.join(root, "app", "play", "page.tsx"), "utf8");
  const machineSrc = fs.readFileSync(
    path.join(root, "components", "ClawMachine.tsx"),
    "utf8"
  );
  assert.ok(playSrc.includes('data-claw-action="pull"'));
  assert.ok(playSrc.includes('data-claw-controls="joystick"'));
  assert.ok(playSrc.includes('data-claw-dir="left"'));
  assert.ok(playSrc.includes('data-claw-dir="right"'));
  assert.ok(machineSrc.includes("ClawCanvas") || machineSrc.includes("r3f-webgl"));
  assert.ok(playSrc.includes("ClawMachine"));
});

test("WIN_PROBABILITY is 0.2 in code only; absent from play UI", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const playPath = path.join(__dirname, "..", "..", "..", "app", "play", "page.tsx");
  const prizesPath = path.join(__dirname, "..", "prizes.ts");
  const playSrc = fs.readFileSync(playPath, "utf8");
  const prizesSrc = fs.readFileSync(prizesPath, "utf8");
  assert.ok(/WIN_PROBABILITY\s*=\s*0\.2/.test(prizesSrc));
  assert.equal(playSrc.includes("WIN_PROBABILITY"), false);
  assert.equal(/\b20\s*%/.test(playSrc), false, "no 20% on play page");
  assert.ok(playSrc.includes("ClawMachine"), "play mounts ClawMachine");
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
