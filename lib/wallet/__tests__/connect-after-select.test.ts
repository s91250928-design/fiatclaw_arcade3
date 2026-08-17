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
  isMobileUserAgent,
  shouldUsePhantomMobileDeepLink,
  buildPhantomBrowseDeepLink,
  buildPhantomConnectDeepLink,
  buildPhantomMobileOpenUrl,
  createPhantomConnectKeypair,
  parsePhantomConnectReturn,
  phantomAbsentMessage,
  PHANTOM_MOBILE_OPEN_MESSAGE,
  tryRestorePhantomConnectReturn,
  dualWriteStorage,
  storePhantomConnectSecret,
  loadPhantomConnectSecret,
  clearPhantomMobileSession,
  storePhantomMobileSession,
  loadPhantomMobilePublicKey,
} from "../connect-after-select";
import {
  ARCADE_WALLET_NAMES,
  arcadeWalletAdapterNames,
  buildArcadeWalletAdapters,
  usesPackagePhantomWalletAdapter,
} from "../adapters";
import nacl from "tweetnacl";
import bs58 from "bs58";

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

  // ── Mobile Phantom deep link (jup.ag-style) ───────────────────────

  test("isMobileUserAgent detects phones; desktop false", () => {
    assert.equal(
      isMobileUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
      ),
      true
    );
    assert.equal(
      isMobileUserAgent(
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36"
      ),
      true
    );
    assert.equal(
      isMobileUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"
      ),
      false
    );
  }),

  test("shouldUsePhantomMobileDeepLink: mobile no inject → true; inject → false", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
    assert.equal(
      shouldUsePhantomMobileDeepLink({
        userAgent: iphone,
        hasInjectedProvider: false,
      }),
      true
    );
    assert.equal(
      shouldUsePhantomMobileDeepLink({
        userAgent: iphone,
        hasInjectedProvider: true,
      }),
      false
    );
    assert.equal(
      shouldUsePhantomMobileDeepLink({
        userAgent: "Mozilla/5.0 Phantom/25.0",
        hasInjectedProvider: false,
      }),
      false
    );
  }),

  test("buildPhantomBrowseDeepLink encodes page + ref", () => {
    const u = buildPhantomBrowseDeepLink(
      "https://app.example.com/play?connect=1",
      "https://app.example.com"
    );
    assert.ok(u.startsWith("https://phantom.app/ul/browse/"));
    assert.ok(u.includes(encodeURIComponent("https://app.example.com/play?connect=1")));
    assert.ok(u.includes("ref=" + encodeURIComponent("https://app.example.com")));
  }),

  test("buildPhantomConnectDeepLink has app_url redirect_link encryption key HTTPS", () => {
    const u = buildPhantomConnectDeepLink({
      appUrl: "https://fiatclaw.vercel.app",
      redirectLink: "https://fiatclaw.vercel.app/play",
      dappEncryptionPublicKey: "AbCdEf123",
      cluster: "devnet",
    });
    assert.ok(u.startsWith("https://phantom.app/ul/v1/connect?"));
    const q = new URL(u).searchParams;
    assert.equal(q.get("app_url"), "https://fiatclaw.vercel.app");
    assert.equal(q.get("redirect_link"), "https://fiatclaw.vercel.app/play");
    assert.equal(q.get("dapp_encryption_public_key"), "AbCdEf123");
    assert.equal(q.get("cluster"), "devnet");
  }),

  test("buildPhantomMobileOpenUrl connect mode uses UL connect", () => {
    const u = buildPhantomMobileOpenUrl({
      pageHref: "https://example.com/play",
      origin: "https://example.com",
      mode: "connect",
      dappEncryptionPublicKey: "Pk123",
      cluster: "devnet",
    });
    assert.ok(u.includes("phantom.app/ul/v1/connect"));
  }),

  test("phantomAbsentMessage: mobile → open; desktop → install", () => {
    const m = phantomAbsentMessage({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      hasInjectedProvider: false,
    });
    assert.equal(m.kind, "mobile_open");
    assert.ok(/Opening Phantom/i.test(m.message));
    const d = phantomAbsentMessage({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      hasInjectedProvider: false,
    });
    assert.equal(d.kind, "install");
    assert.ok(isPhantomInstallMessage(d.message));
  }),

  test("runPhantomOfficialConnect mobile no inject → navigates deep link not Install", async () => {
    let navigated: string | null = null;
    const store: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    };
    const r = await runPhantomOfficialConnect(
      () => ({}),
      async () => {},
      {
        timeoutMs: 50,
        pollMs: 10,
        sleep: async () => {},
        now: fakeClock(30),
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        pageHref: "https://app.example.com/play",
        origin: "https://app.example.com",
        cluster: "devnet",
        navigate: (url) => {
          navigated = url;
        },
        storage,
      }
    );
    assert.equal(r.ok, false);
    assert.ok(!isPhantomInstallMessage(r.message));
    assert.ok(
      r.message === PHANTOM_MOBILE_OPEN_MESSAGE ||
        /Opening Phantom/i.test(r.message)
    );
    assert.ok(navigated);
    assert.ok(String(navigated).includes("phantom.app/ul/v1/connect"));
    assert.ok(String(navigated).includes("redirect_link"));
    assert.ok(store["fiatclaw_phantom_dapp_sk"]);
  }),

  test("parsePhantomConnectReturn decrypts public_key (nacl round-trip)", () => {
    const dapp = createPhantomConnectKeypair();
    const phantom = nacl.box.keyPair();
    const shared = nacl.box.before(
      bs58.decode(dapp.publicKeyBs58),
      phantom.secretKey
    );
    // Phantom encrypts with shared secret from nacl.box.before(dappPk, phantomSk)
    // App decrypts with nacl.box.before(phantomPk, dappSk) — same shared secret
    const sharedApp = nacl.box.before(
      phantom.publicKey,
      bs58.decode(dapp.secretKeyBs58)
    );
    assert.deepEqual(shared, sharedApp);

    const payload = new TextEncoder().encode(
      JSON.stringify({
        public_key: "UserWallet1111111111111111111111111111111",
        session: "sessionTokenBase58",
      })
    );
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const boxed = nacl.secretbox(payload, nonce, shared);

    const q = new URLSearchParams({
      phantom_encryption_public_key: bs58.encode(phantom.publicKey),
      nonce: bs58.encode(nonce),
      data: bs58.encode(boxed),
    });
    const parsed = parsePhantomConnectReturn(q, dapp.secretKeyBs58);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.publicKey, "UserWallet1111111111111111111111111111111");
      assert.equal(parsed.session, "sessionTokenBase58");
    }
  }),

  test("tryRestorePhantomConnectReturn stores publicKey session", () => {
    const dapp = createPhantomConnectKeypair();
    const phantom = nacl.box.keyPair();
    const shared = nacl.box.before(
      phantom.publicKey,
      bs58.decode(dapp.secretKeyBs58)
    );
    const payload = new TextEncoder().encode(
      JSON.stringify({
        public_key: "RestoredKey2222222222222222222222222222",
        session: "sess",
      })
    );
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const boxed = nacl.secretbox(payload, nonce, shared);
    const store: Record<string, string> = {
      fiatclaw_phantom_dapp_sk: dapp.secretKeyBs58,
      fiatclaw_phantom_mobile_pending: "1",
    };
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    };
    const search = `?phantom_encryption_public_key=${bs58.encode(phantom.publicKey)}&nonce=${bs58.encode(nonce)}&data=${bs58.encode(boxed)}`;
    let cleaned: string | null = null;
    const r = tryRestorePhantomConnectReturn({
      search,
      storage,
      currentHref: `https://app.example.com/play${search}`,
      replaceUrl: (h) => {
        cleaned = h;
      },
    });
    assert.ok(r);
    assert.equal(r!.ok, true);
    assert.equal(store["fiatclaw_phantom_pk"], "RestoredKey2222222222222222222222222222");
    assert.equal(store["fiatclaw_phantom_dapp_sk"], undefined);
    assert.ok(cleaned && !String(cleaned).includes("data="));
  }),

  test("dualWriteStorage: secret written in tab1 readable from tab2 bag", () => {
    const tab1: Record<string, string> = {};
    const durable: Record<string, string> = {};
    const bag1 = dualWriteStorage(
      {
        getItem: (k) => tab1[k] ?? null,
        setItem: (k, v) => {
          tab1[k] = v;
        },
        removeItem: (k) => {
          delete tab1[k];
        },
      },
      {
        getItem: (k) => durable[k] ?? null,
        setItem: (k, v) => {
          durable[k] = v;
        },
        removeItem: (k) => {
          delete durable[k];
        },
      }
    );
    storePhantomConnectSecret(bag1, "SecretKeyFromTab1");
    assert.equal(tab1["fiatclaw_phantom_dapp_sk"], "SecretKeyFromTab1");
    assert.equal(durable["fiatclaw_phantom_dapp_sk"], "SecretKeyFromTab1");

    // New browser context: empty session, only durable (localStorage)
    const tab2: Record<string, string> = {};
    const bag2 = dualWriteStorage(
      {
        getItem: (k) => tab2[k] ?? null,
        setItem: (k, v) => {
          tab2[k] = v;
        },
        removeItem: (k) => {
          delete tab2[k];
        },
      },
      {
        getItem: (k) => durable[k] ?? null,
        setItem: (k, v) => {
          durable[k] = v;
        },
        removeItem: (k) => {
          delete durable[k];
        },
      }
    );
    assert.equal(loadPhantomConnectSecret(bag2), "SecretKeyFromTab1");

    // Cross-tab restore decrypt
    const dapp = createPhantomConnectKeypair();
    storePhantomConnectSecret(bag1, dapp.secretKeyBs58);
    const phantom = nacl.box.keyPair();
    const shared = nacl.box.before(
      phantom.publicKey,
      bs58.decode(dapp.secretKeyBs58)
    );
    const payload = new TextEncoder().encode(
      JSON.stringify({
        public_key: "CrossTabKey333333333333333333333333333",
        session: "s2",
      })
    );
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const boxed = nacl.secretbox(payload, nonce, shared);
    const q = `?phantom_encryption_public_key=${bs58.encode(phantom.publicKey)}&nonce=${bs58.encode(nonce)}&data=${bs58.encode(boxed)}`;
    const r = tryRestorePhantomConnectReturn({
      search: q,
      storage: bag2, // empty session, durable has secret
    });
    assert.ok(r?.ok);
    assert.equal(
      loadPhantomMobilePublicKey(bag2),
      "CrossTabKey333333333333333333333333333"
    );
  }),

  test("clearPhantomMobileSession clears dual storage after disconnect path", () => {
    const a: Record<string, string> = {};
    const b: Record<string, string> = {};
    const bag = dualWriteStorage(
      {
        getItem: (k) => a[k] ?? null,
        setItem: (k, v) => {
          a[k] = v;
        },
        removeItem: (k) => {
          delete a[k];
        },
      },
      {
        getItem: (k) => b[k] ?? null,
        setItem: (k, v) => {
          b[k] = v;
        },
        removeItem: (k) => {
          delete b[k];
        },
      }
    );
    storePhantomMobileSession(bag, "PkDisconnect", "sess");
    assert.equal(loadPhantomMobilePublicKey(bag), "PkDisconnect");
    clearPhantomMobileSession(bag);
    assert.equal(loadPhantomMobilePublicKey(bag), null);
    assert.equal(a["fiatclaw_phantom_pk"], undefined);
    assert.equal(b["fiatclaw_phantom_pk"], undefined);
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
