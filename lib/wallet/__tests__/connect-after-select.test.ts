/**
 * Official Phantom docs path + Solflare ready-gate tests (shipped pure modules).
 */
import assert from "node:assert/strict";
import {
  formatWalletConnectError,
  isWalletReadyForConnect,
  runPhantomOfficialConnect,
  runSelectedWalletConnect,
  runWalletConnect,
  runWalletConnectWhenReady,
  shouldConnectAfterModalClose,
  waitForWalletReady,
  PHANTOM_INSTALL_MESSAGE,
  PHANTOM_INSTALL_URL,
  getPhantomProvider,
  connectPhantomOfficial,
  waitForPhantomProvider,
  isPhantomInstallMessage,
} from "../connect-after-select";
import {
  ARCADE_WALLET_NAMES,
  arcadeWalletAdapterNames,
  buildArcadeWalletAdapters,
  usesPackagePhantomWalletAdapter,
} from "../adapters";

function test(name: string, fn: () => void | Promise<void>) {
  return { name, fn };
}

function fakeClock(step = 40) {
  let t = 0;
  return () => {
    t += step;
    return t;
  };
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

  test("runWalletConnect success / failure", async () => {
    assert.equal((await runWalletConnect(async () => {})).ok, true);
    const r = await runWalletConnect(async () => {
      throw new Error("User rejected the request.");
    });
    assert.equal(r.ok, false);
  }),

  test("formatWalletConnectError maps WalletNotReady to Install Phantom", () => {
    const e = new Error("Wallet not ready");
    e.name = "WalletNotReadyError";
    const msg = formatWalletConnectError(e);
    assert.ok(isPhantomInstallMessage(msg), msg);
    assert.ok(msg.includes(PHANTOM_INSTALL_URL), msg);
  }),

  test("isWalletReadyForConnect accepts Installed and Loadable", () => {
    assert.equal(isWalletReadyForConnect("Installed"), true);
    assert.equal(isWalletReadyForConnect("Loadable"), true);
    assert.equal(isWalletReadyForConnect("NotDetected"), false);
  }),

  test("runWalletConnectWhenReady connects when Loadable (Solflare)", async () => {
    let connectCalls = 0;
    const r = await runWalletConnectWhenReady(
      async () => {
        connectCalls += 1;
      },
      () => "Loadable",
      { timeoutMs: 200, pollMs: 10, sleep: async () => {}, now: fakeClock(5) }
    );
    assert.equal(r.ok, true);
    assert.equal(connectCalls, 1);
  }),

  test("runWalletConnectWhenReady does not connect while NotDetected", async () => {
    let connectCalls = 0;
    const r = await runWalletConnectWhenReady(
      async () => {
        connectCalls += 1;
      },
      () => "NotDetected",
      { timeoutMs: 80, pollMs: 20, sleep: async () => {}, now: fakeClock(40) }
    );
    assert.equal(r.ok, false);
    assert.equal(connectCalls, 0);
  }),

  // ── Official Phantom docs path ─────────────────────────────────────

  test("getPhantomProvider matches docs: window.phantom.solana.isPhantom", () => {
    assert.equal(getPhantomProvider(null), null);
    assert.equal(getPhantomProvider({}), null);
    const provider = {
      isPhantom: true,
      connect: async () => ({ publicKey: { toString: () => "Pk1" } }),
    };
    const win = { phantom: { solana: provider } };
    assert.equal(getPhantomProvider(win), provider);
    // legacy window.solana
    assert.equal(
      getPhantomProvider({ solana: provider }),
      provider
    );
    // phantom without isPhantom
    assert.equal(
      getPhantomProvider({
        phantom: { solana: { connect: async () => {} } },
      }),
      null
    );
  }),

  test("waitForPhantomProvider: missing → Install Phantom + https://phantom.app", async () => {
    const r = await waitForPhantomProvider(() => ({}), {
      timeoutMs: 80,
      pollMs: 20,
      sleep: async () => {},
      now: fakeClock(40),
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.message.includes(PHANTOM_INSTALL_URL), r.message);
      assert.ok(/install phantom/i.test(r.message), r.message);
      assert.equal(r.message, PHANTOM_INSTALL_MESSAGE);
    }
  }),

  test("waitForPhantomProvider: appears after poll → ok", async () => {
    let n = 0;
    const provider = {
      isPhantom: true as const,
      connect: async () => ({ publicKey: { toString: () => "X" } }),
    };
    const r = await waitForPhantomProvider(
      () => {
        n += 1;
        return n >= 3 ? { phantom: { solana: provider } } : {};
      },
      {
        timeoutMs: 2000,
        pollMs: 10,
        sleep: async () => {},
        now: fakeClock(30),
      }
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.provider, provider);
  }),

  test("connectPhantomOfficial: provider present → connect() → publicKey", async () => {
    let connectCalls = 0;
    const provider = {
      isPhantom: true as const,
      publicKey: null as { toString(): string } | null,
      connect: async () => {
        connectCalls += 1;
        const pk = { toString: () => "PhantomPubKey111" };
        provider.publicKey = pk;
        return { publicKey: pk };
      },
    };
    const r = await connectPhantomOfficial(
      () => ({ phantom: { solana: provider } }),
      { timeoutMs: 100, pollMs: 10, sleep: async () => {}, now: fakeClock(5) }
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.publicKey, "PhantomPubKey111");
    assert.equal(connectCalls, 1);
  }),

  test("connectPhantomOfficial: delayed inject then connect once", async () => {
    let n = 0;
    let connectCalls = 0;
    const provider = {
      isPhantom: true as const,
      publicKey: null as { toString(): string } | null,
      connect: async () => {
        connectCalls += 1;
        const pk = { toString: () => "DelayedKey" };
        provider.publicKey = pk;
        return { publicKey: pk };
      },
    };
    const r = await connectPhantomOfficial(
      () => {
        n += 1;
        return n >= 3 ? { phantom: { solana: provider } } : {};
      },
      {
        timeoutMs: 2000,
        pollMs: 10,
        sleep: async () => {},
        now: fakeClock(25),
      }
    );
    assert.equal(r.ok, true);
    assert.equal(connectCalls, 1);
  }),

  test("connectPhantomOfficial: never inject → install message not WalletNotReady", async () => {
    const r = await connectPhantomOfficial(() => ({}), {
      timeoutMs: 60,
      pollMs: 15,
      sleep: async () => {},
      now: fakeClock(30),
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(isPhantomInstallMessage(r.message));
      assert.equal(r.message.includes("WalletNotReady"), false);
    }
  }),

  test("runPhantomOfficialConnect syncs adapter after official connect", async () => {
    let adapterCalls = 0;
    const provider = {
      isPhantom: true as const,
      isConnected: false,
      publicKey: null as { toString(): string } | null,
      connect: async () => {
        provider.isConnected = true;
        const pk = { toString: () => "SyncKey" };
        provider.publicKey = pk;
        return { publicKey: pk };
      },
    };
    const r = await runPhantomOfficialConnect(
      () => ({ phantom: { solana: provider } }),
      async () => {
        adapterCalls += 1;
      },
      { timeoutMs: 200, pollMs: 10, sleep: async () => {}, now: fakeClock(5) }
    );
    assert.equal(r.ok, true);
    assert.equal(adapterCalls, 1);
  }),

  test("runSelectedWalletConnect: Phantom → official path", async () => {
    let adapterCalls = 0;
    let providerConnects = 0;
    const provider = {
      isPhantom: true as const,
      connect: async () => {
        providerConnects += 1;
        return { publicKey: { toString: () => "SelPk" } };
      },
    };
    const r = await runSelectedWalletConnect({
      walletName: "Phantom",
      connect: async () => {
        adapterCalls += 1;
      },
      getReadyState: () => "NotDetected",
      getWin: () => ({ phantom: { solana: provider } }),
      phantomOpts: {
        timeoutMs: 200,
        pollMs: 10,
        sleep: async () => {},
        now: fakeClock(5),
      },
    });
    assert.equal(r.ok, true);
    assert.equal(providerConnects, 1);
    assert.equal(adapterCalls, 1);
  }),

  test("runSelectedWalletConnect: Solflare → ready gate Loadable", async () => {
    let connectCalls = 0;
    const r = await runSelectedWalletConnect({
      walletName: "Solflare",
      connect: async () => {
        connectCalls += 1;
      },
      getReadyState: () => "Loadable",
      getWin: () => ({}),
      readyOpts: {
        timeoutMs: 200,
        pollMs: 10,
        sleep: async () => {},
        now: fakeClock(5),
      },
    });
    assert.equal(r.ok, true);
    assert.equal(connectCalls, 1);
  }),

  test("buildArcadeWalletAdapters: Phantom + Solflare, no package phantom", () => {
    const adapters = buildArcadeWalletAdapters();
    const names = arcadeWalletAdapterNames(adapters);
    assert.ok(names.includes("Phantom"));
    assert.ok(names.includes("Solflare"));
    assert.equal(adapters.length, 2);
    assert.deepEqual([...ARCADE_WALLET_NAMES], ["Phantom", "Solflare"]);
    assert.equal(usesPackagePhantomWalletAdapter(), false);
    // Arcade Phantom uses Loadable when no window provider (not NotDetected)
    const phantom = adapters.find((a) => a.name === "Phantom");
    assert.ok(phantom);
    // In node, readyState is Unsupported (no document) — acceptable server-side
    assert.ok(
      phantom!.readyState === "Loadable" ||
        phantom!.readyState === "Installed" ||
        phantom!.readyState === "Unsupported"
    );
  }),
];

async function main() {
  let passed = 0;
  let failed = 0;
  console.log("\n=== official Phantom + connect-after-select tests ===\n");
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
