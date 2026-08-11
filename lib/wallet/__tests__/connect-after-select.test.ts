/**
 * Jupiter-like Phantom flow + Solflare ready-gate (shipped pure modules).
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
  shouldConnectAfterWalletSelect,
  PHANTOM_INSTALL_MESSAGE,
  PHANTOM_INSTALL_URL,
  PHANTOM_UNLOCK_MESSAGE,
  getPhantomProvider,
  isPhantomInstalled,
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
  test("modal close → connect when user opened + wallet selected", () => {
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

  test("wallet select while modal session → connect", () => {
    assert.equal(
      shouldConnectAfterWalletSelect({
        userOpenedModal: true,
        hasWallet: true,
        connected: false,
        connecting: false,
        inFlight: false,
      }),
      true
    );
    assert.equal(
      shouldConnectAfterWalletSelect({
        userOpenedModal: false,
        hasWallet: true,
        connected: false,
        connecting: false,
        inFlight: false,
      }),
      false
    );
  }),

  test("localStorage alone does not connect", () => {
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

  // ── CRITICAL: no false Install when provider present ───────────────

  test("formatWalletConnectError: NotReady NEVER becomes Install", () => {
    const e = new Error("Wallet not ready");
    e.name = "WalletNotReadyError";
    const msg = formatWalletConnectError(e, { providerPresent: true });
    assert.equal(isPhantomInstallMessage(msg), false, msg);
    assert.ok(/unlock|try again/i.test(msg), msg);

    const msg2 = formatWalletConnectError(e, { providerPresent: false });
    // Still unlock, not Install — NotReady ≠ missing extension
    assert.equal(isPhantomInstallMessage(msg2), false, msg2);
  }),

  test("formatWalletConnectError: Install text suppressed when providerPresent", () => {
    const e = new Error(PHANTOM_INSTALL_MESSAGE);
    const msg = formatWalletConnectError(e, { providerPresent: true });
    assert.equal(isPhantomInstallMessage(msg), false, msg);
    assert.equal(msg, PHANTOM_UNLOCK_MESSAGE);
  }),

  test("getPhantomProvider: isPhantom true → installed", () => {
    assert.equal(getPhantomProvider(null), null);
    assert.equal(isPhantomInstalled({}), false);

    const provider = {
      isPhantom: true as const,
      connect: async () => ({ publicKey: { toString: () => "K" } }),
    };
    assert.ok(getPhantomProvider({ phantom: { solana: provider } }));
    assert.equal(isPhantomInstalled({ phantom: { solana: provider } }), true);

    // isPhantom false → not installed
    assert.equal(
      getPhantomProvider({
        phantom: {
          solana: { isPhantom: false, connect: async () => {} },
        },
      }),
      null
    );

    // legacy solana
    assert.ok(getPhantomProvider({ solana: provider }));
  }),

  test("waitForPhantomProvider: present immediately → no Install", async () => {
    const provider = {
      isPhantom: true as const,
      connect: async () => ({ publicKey: { toString: () => "K" } }),
    };
    const r = await waitForPhantomProvider(
      () => ({ phantom: { solana: provider } }),
      { timeoutMs: 100, pollMs: 10, sleep: async () => {}, now: fakeClock(5) }
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.provider, provider);
  }),

  test("waitForPhantomProvider: absent after wait → single Install link", async () => {
    const r = await waitForPhantomProvider(() => ({}), {
      timeoutMs: 80,
      pollMs: 20,
      sleep: async () => {},
      now: fakeClock(40),
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.message, PHANTOM_INSTALL_MESSAGE);
      assert.ok(r.message.includes(PHANTOM_INSTALL_URL));
    }
  }),

  test("connectPhantomOfficial: isPhantom → connect() once → publicKey", async () => {
    let connectCalls = 0;
    const provider = {
      isPhantom: true as const,
      isConnected: false,
      publicKey: null as { toString(): string } | null,
      connect: async () => {
        connectCalls += 1;
        const pk = { toString: () => "JupLikeKey111" };
        provider.publicKey = pk;
        provider.isConnected = true;
        return { publicKey: pk };
      },
    };
    const r = await connectPhantomOfficial(
      () => ({ phantom: { solana: provider } }),
      { timeoutMs: 100, pollMs: 10, sleep: async () => {}, now: fakeClock(5) }
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.publicKey, "JupLikeKey111");
    assert.equal(connectCalls, 1);
  }),

  test("connectPhantomOfficial: delayed inject → connect once (no premature Install)", async () => {
    let n = 0;
    let connectCalls = 0;
    const provider = {
      isPhantom: true as const,
      connect: async () => {
        connectCalls += 1;
        return { publicKey: { toString: () => "Delayed" } };
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

  test("connectPhantomOfficial: truly absent → install kind only", async () => {
    const r = await connectPhantomOfficial(() => ({}), {
      timeoutMs: 60,
      pollMs: 15,
      sleep: async () => {},
      now: fakeClock(30),
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.kind, "install");
      assert.ok(isPhantomInstallMessage(r.message));
    }
  }),

  test("runPhantomOfficialConnect: adapter race after success does NOT Install", async () => {
    let providerConnects = 0;
    const provider = {
      isPhantom: true as const,
      isConnected: false,
      publicKey: null as { toString(): string } | null,
      connect: async () => {
        providerConnects += 1;
        provider.isConnected = true;
        const pk = { toString: () => "OkKey" };
        provider.publicKey = pk;
        return { publicKey: pk };
      },
    };
    const r = await runPhantomOfficialConnect(
      () => ({ phantom: { solana: provider } }),
      async () => {
        throw Object.assign(new Error("Wallet not ready"), {
          name: "WalletNotReadyError",
        });
      },
      { timeoutMs: 200, pollMs: 10, sleep: async () => {}, now: fakeClock(5) }
    );
    // Official connect succeeded — must not surface Install
    assert.equal(r.ok, true, "adapter NotReady after official success must still ok");
    assert.equal(providerConnects, 1);
    assert.equal(
      r.ok && r.publicKey ? r.publicKey : "",
      "OkKey"
    );
  }),

  test("runSelectedWalletConnect: Phantom with provider → connect, Solflare Loadable", async () => {
    let pCalls = 0;
    const provider = {
      isPhantom: true as const,
      connect: async () => {
        pCalls += 1;
        return { publicKey: { toString: () => "P" } };
      },
    };
    const r1 = await runSelectedWalletConnect({
      walletName: "Phantom",
      connect: async () => {},
      getReadyState: () => "Installed",
      getWin: () => ({ phantom: { solana: provider } }),
      phantomOpts: {
        timeoutMs: 200,
        pollMs: 10,
        sleep: async () => {},
        now: fakeClock(5),
      },
    });
    assert.equal(r1.ok, true);
    assert.equal(pCalls, 1);

    let sCalls = 0;
    const r2 = await runSelectedWalletConnect({
      walletName: "Solflare",
      connect: async () => {
        sCalls += 1;
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
    assert.equal(r2.ok, true);
    assert.equal(sCalls, 1);
  }),

  test("Solflare Loadable still connects via ready gate", async () => {
    let calls = 0;
    const r = await runWalletConnectWhenReady(
      async () => {
        calls += 1;
      },
      () => "Loadable",
      { timeoutMs: 100, pollMs: 10, sleep: async () => {}, now: fakeClock(5) }
    );
    assert.equal(r.ok, true);
    assert.equal(calls, 1);
  }),

  test("buildArcadeWalletAdapters lists Phantom + Solflare once", () => {
    const names = arcadeWalletAdapterNames(buildArcadeWalletAdapters());
    assert.ok(names.includes("Phantom"));
    assert.ok(names.includes("Solflare"));
    assert.equal(names.filter((n) => n === "Phantom").length, 1);
    assert.deepEqual([...ARCADE_WALLET_NAMES], ["Phantom", "Solflare"]);
    assert.equal(usesPackagePhantomWalletAdapter(), false);
  }),

  test("runWalletConnect success", async () => {
    assert.equal((await runWalletConnect(async () => {})).ok, true);
  }),

  test("isWalletReadyForConnect Installed|Loadable", () => {
    assert.equal(isWalletReadyForConnect("Installed"), true);
    assert.equal(isWalletReadyForConnect("Loadable"), true);
    assert.equal(isWalletReadyForConnect("NotDetected"), false);
  }),
];

async function main() {
  let passed = 0;
  let failed = 0;
  console.log("\n=== phantom jup-flow + connect tests ===\n");
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
