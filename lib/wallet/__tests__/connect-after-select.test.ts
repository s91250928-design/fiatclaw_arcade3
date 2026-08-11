/**
 * Honest tests for PC connect-after-modal + ready-gate (shipped pure modules).
 * Covers same-name reselect, wait-for-Installed, and Phantom+Solflare list.
 */
import assert from "node:assert/strict";
import {
  formatWalletConnectError,
  isWalletReadyForConnect,
  runWalletConnect,
  runWalletConnectWhenReady,
  shouldConnectAfterModalClose,
  waitForWalletReady,
} from "../connect-after-select";
import {
  ARCADE_WALLET_NAMES,
  arcadeWalletAdapterNames,
  buildArcadeWalletAdapters,
  usesPackagePhantomWalletAdapter,
} from "../adapters";
import {
  isPhantomProviderPresent,
  resolvePhantomProvider,
} from "../phantom-provider";

function test(name: string, fn: () => void | Promise<void>) {
  return { name, fn };
}

const cases = [
  test("modal close after user open + selected wallet → connect", () => {
    assert.equal(
      shouldConnectAfterModalClose({
        userOpenedModal: true,
        prevVisible: true,
        visible: false,
        hasWallet: true,
        connected: false,
        connecting: false,
        inFlight: false,
      }),
      true
    );
  }),

  test("same-name reselect path: close with wallet already selected → connect", () => {
    assert.equal(
      shouldConnectAfterModalClose({
        userOpenedModal: true,
        prevVisible: true,
        visible: false,
        hasWallet: true,
        connected: false,
        connecting: false,
        inFlight: false,
      }),
      true
    );
  }),

  test("page load with localStorage wallet only → do NOT connect", () => {
    assert.equal(
      shouldConnectAfterModalClose({
        userOpenedModal: false,
        prevVisible: false,
        visible: false,
        hasWallet: true,
        connected: false,
        connecting: false,
        inFlight: false,
      }),
      false
    );
  }),

  test("modal still open → do not connect yet", () => {
    assert.equal(
      shouldConnectAfterModalClose({
        userOpenedModal: true,
        prevVisible: true,
        visible: true,
        hasWallet: true,
        connected: false,
        connecting: false,
        inFlight: false,
      }),
      false
    );
  }),

  test("already connected → no connect", () => {
    assert.equal(
      shouldConnectAfterModalClose({
        userOpenedModal: true,
        prevVisible: true,
        visible: false,
        hasWallet: true,
        connected: true,
        connecting: false,
        inFlight: false,
      }),
      false
    );
  }),

  test("in-flight → no second connect", () => {
    assert.equal(
      shouldConnectAfterModalClose({
        userOpenedModal: true,
        prevVisible: true,
        visible: false,
        hasWallet: true,
        connected: false,
        connecting: false,
        inFlight: true,
      }),
      false
    );
  }),

  test("no wallet selected → no connect", () => {
    assert.equal(
      shouldConnectAfterModalClose({
        userOpenedModal: true,
        prevVisible: true,
        visible: false,
        hasWallet: false,
        connected: false,
        connecting: false,
        inFlight: false,
      }),
      false
    );
  }),

  test("runWalletConnect success", async () => {
    let calls = 0;
    const r = await runWalletConnect(async () => {
      calls += 1;
    });
    assert.equal(r.ok, true);
    assert.equal(calls, 1);
  }),

  test("runWalletConnect failure surfaces message", async () => {
    const r = await runWalletConnect(async () => {
      throw new Error("User rejected the request.");
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.message.includes("User rejected") || r.message.length > 0);
    }
  }),

  test("formatWalletConnectError maps WalletNotReadyError", () => {
    const e = new Error("Wallet not ready");
    e.name = "WalletNotReadyError";
    const msg = formatWalletConnectError(e);
    assert.ok(/not ready|Unlock/i.test(msg), msg);
  }),

  test("formatWalletConnectError fallback", () => {
    assert.ok(formatWalletConnectError(null).includes("failed"));
    assert.equal(formatWalletConnectError(new Error("x")), "x");
  }),

  test("isWalletReadyForConnect accepts Installed and Loadable (WalletProviderBase)", () => {
    assert.equal(isWalletReadyForConnect("Installed"), true);
    assert.equal(
      isWalletReadyForConnect("Loadable"),
      true,
      "Solflare defaults to Loadable and must be connectable"
    );
    assert.equal(isWalletReadyForConnect("NotDetected"), false);
    assert.equal(isWalletReadyForConnect("Unsupported"), false);
    assert.equal(isWalletReadyForConnect(null), false);
  }),

  test("waitForWalletReady resolves when state becomes Installed", async () => {
    let n = 0;
    const r = await waitForWalletReady(
      () => {
        n += 1;
        return n >= 3 ? "Installed" : "NotDetected";
      },
      {
        timeoutMs: 2000,
        pollMs: 10,
        sleep: async () => {},
        now: (() => {
          let t = 0;
          return () => {
            t += 50;
            return t;
          };
        })(),
      }
    );
    assert.equal(r.ready, true);
  }),

  test("waitForWalletReady fails when never Installed", async () => {
    const r = await waitForWalletReady(() => "NotDetected", {
      timeoutMs: 100,
      pollMs: 20,
      sleep: async () => {},
      now: (() => {
        let t = 0;
        return () => {
          t += 40;
          return t;
        };
      })(),
    });
    assert.equal(r.ready, false);
    if (!r.ready) {
      assert.ok(/not ready|Unlock/i.test(r.message), r.message);
    }
  }),

  test("runWalletConnectWhenReady does not call connect while NotDetected", async () => {
    let connectCalls = 0;
    const r = await runWalletConnectWhenReady(
      async () => {
        connectCalls += 1;
      },
      () => "NotDetected",
      {
        timeoutMs: 80,
        pollMs: 20,
        sleep: async () => {},
        now: (() => {
          let t = 0;
          return () => {
            t += 40;
            return t;
          };
        })(),
      }
    );
    assert.equal(r.ok, false);
    assert.equal(connectCalls, 0, "must not connect before ready");
  }),

  test("runWalletConnectWhenReady connects once Installed", async () => {
    let connectCalls = 0;
    let tick = 0;
    const r = await runWalletConnectWhenReady(
      async () => {
        connectCalls += 1;
      },
      () => {
        tick += 1;
        return tick >= 2 ? "Installed" : "NotDetected";
      },
      {
        timeoutMs: 2000,
        pollMs: 10,
        sleep: async () => {},
        now: (() => {
          let t = 0;
          return () => {
            t += 30;
            return t;
          };
        })(),
      }
    );
    assert.equal(r.ok, true);
    assert.equal(connectCalls, 1);
  }),

  test("runWalletConnectWhenReady connects when Loadable (Solflare default)", async () => {
    let connectCalls = 0;
    const r = await runWalletConnectWhenReady(
      async () => {
        connectCalls += 1;
      },
      () => "Loadable",
      {
        timeoutMs: 500,
        pollMs: 20,
        sleep: async () => {},
        now: (() => {
          let t = 0;
          return () => {
            t += 10;
            return t;
          };
        })(),
      }
    );
    assert.equal(r.ok, true, "Loadable must not time out");
    assert.equal(
      connectCalls,
      1,
      "Solflare Loadable path must call connect() once"
    );
  }),

  test("buildArcadeWalletAdapters lists Phantom and Solflare once each", () => {
    const adapters = buildArcadeWalletAdapters();
    const names = arcadeWalletAdapterNames(adapters);
    assert.ok(names.includes("Phantom"), "Phantom present");
    assert.ok(names.includes("Solflare"), "Solflare present");
    assert.equal(names.filter((n) => n === "Phantom").length, 1);
    assert.equal(names.filter((n) => n === "Solflare").length, 1);
    assert.equal(adapters.length, 2, "exactly two adapters — no dual Phantom");
    assert.deepEqual([...ARCADE_WALLET_NAMES], ["Phantom", "Solflare"]);
    assert.equal(
      usesPackagePhantomWalletAdapter(),
      false,
      "must not use package PhantomWalletAdapter (isPhantomInstalled bug)"
    );
  }),

  test("resolvePhantomProvider prefers window.phantom.solana without isPhantomInstalled", () => {
    assert.equal(resolvePhantomProvider(null), null);
    assert.equal(isPhantomProviderPresent({}), false);
    const fake = {
      phantom: {
        solana: {
          isPhantom: true,
          connect: async () => {},
        },
      },
    };
    assert.equal(isPhantomProviderPresent(fake), true);
    assert.ok(resolvePhantomProvider(fake)?.isPhantom);
    // Legacy window.solana path
    const legacy = {
      solana: { isPhantom: true, connect: async () => {} },
    };
    assert.equal(isPhantomProviderPresent(legacy), true);
    // Bare window-like object without isPhantom → not present
    assert.equal(
      isPhantomProviderPresent({
        solana: { connect: async () => {} },
      }),
      false
    );
  }),
];

async function main() {
  let passed = 0;
  let failed = 0;
  console.log("\n=== connect-after-select / ready-gate tests ===\n");
  for (const c of cases) {
    try {
      await c.fn();
      passed += 1;
      console.log(`  ✓ ${c.name}`);
    } catch (e) {
      failed += 1;
      console.error(`  ✗ ${c.name}`);
      console.error(e);
    }
  }
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main();
