/**
 * Honest tests for PC connect-after-modal logic (shipped pure module).
 * Covers same-name reselect / modal-close path that WalletConnectAfterSelect uses.
 */
import assert from "node:assert/strict";
import {
  formatWalletConnectError,
  runWalletConnect,
  shouldConnectAfterModalClose,
} from "../connect-after-select";

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
    // select('Phantom') is no-op when already selected; only modal close fires
    assert.equal(
      shouldConnectAfterModalClose({
        userOpenedModal: true,
        prevVisible: true,
        visible: false,
        hasWallet: true, // localStorage already had Phantom
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
      assert.equal(r.message, "User rejected the request.");
    }
  }),

  test("formatWalletConnectError fallback", () => {
    assert.ok(formatWalletConnectError(null).includes("failed"));
    assert.equal(formatWalletConnectError(new Error("x")), "x");
  }),
];

async function main() {
  let passed = 0;
  let failed = 0;
  console.log("\n=== connect-after-select tests ===\n");
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
