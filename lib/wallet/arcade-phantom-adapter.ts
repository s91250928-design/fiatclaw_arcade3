/**
 * FiatClaw Phantom list/connect adapter.
 * Detects window.phantom.solana / window.solana.isPhantom WITHOUT isPhantomInstalled
 * (package PhantomWalletAdapter requires that flag → permanent NotDetected / WalletNotReadyError).
 * When Wallet Standard registers Phantom, WalletProvider filters this same-name entry
 * and Standard owns connect — no dual-active conflict.
 */

import {
  BaseMessageSignerWalletAdapter,
  scopePollingDetectionStrategy,
  WalletAccountError,
  WalletConnectionError,
  WalletDisconnectedError,
  WalletError,
  WalletName,
  WalletNotReadyError,
  WalletPublicKeyError,
  WalletReadyState,
  type TransactionOrVersionedTransaction,
} from "@solana/wallet-adapter-base";
import { PublicKey, type TransactionVersion } from "@solana/web3.js";
import {
  isPhantomProviderPresent,
  resolvePhantomProvider,
  type PhantomSolanaProvider,
  type PhantomWindowLike,
} from "./phantom-provider";

export const ArcadePhantomWalletName = "Phantom" as WalletName<"Phantom">;

const PHANTOM_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiB2aWV3Qm94PSIwIDAgMTA4IDEwOCIgZmlsbD0ibm9uZSI+CjxyZWN0IHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiByeD0iMjYiIGZpbGw9IiNBQjlGRjIiLz4KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik00Ni41MjY3IDY5LjkyMjlDNDIuMDA1NCA3Ni44NTA5IDM0LjQyOTIgODUuNjE4MiAyNC4zNDggODUuNjE4MkMxOS41ODI0IDg1LjYxODIgMTUgODMuNjU2MyAxNSA3NS4xMzQyQzE1IDUzLjQzMDUgNDQuNjMyNiAxOS44MzI3IDcyLjEyNjggMTkuODMyN0M4Ny43NjggMTkuODMyNyA5NCAzMC42ODQ2IDk0IDQzLjAwNzlDOTQgNTguODI1OCA4My43MzU1IDc2LjkxMjIgNzMuNTMyMSA3Ni45MTIyQzcwLjI5MzkgNzYuOTEyMiA2OC43MDUzIDc1LjEzNDIgNjguNzA1MyA3Mi4zMTRDNjguNzA1MyA3MS41NzczIDY4LjgyNzUgNzAuNzgxMiA2OS4wNzE5IDY5LjkyMjlDNjUuNTg5MyA3NS44Njk5IDU4Ljg2ODUgODEuMzg3OCA1Mi41NzU0IDgxLjM4NzhDNDcuOTkzIDgxLjM4NzggNDUuNjcxMyA3OC41MDYzIDQ1LjY3MTMgNzQuNDU5OEM0NS42NzEzIDcyLjk4ODQgNDUuOTc2OCA3MS40NTU2IDQ2LjUyNjcgNjkuOTIyOVpNODMuNjc2MSA0Mi41Nzk0QzgzLjY3NjEgNDYuMTcwNCA4MS41NTc1IDQ3Ljk2NTggNzkuMTg3NSA0Ny45NjU4Qzc2Ljc4MTYgNDcuOTY1OCA3NC42OTg5IDQ2LjE3MDQgNzQuNjk4OSA0Mi41Nzk0Qzc0LjY5ODkgMzguOTg4NSA3Ni43ODE2IDM3LjE5MzEgNzkuMTg3NSAzNy4xOTMxQzgxLjU1NzUgMzcuMTkzMSA4My42NzYxIDM4Ljk4ODUgODMuNjc2MSA0Mi41Nzk0Wk03MC4yMTAzIDQyLjU3OTVDNzAuMjEwMyA0Ni4xNzA0IDY4LjA5MTYgNDcuOTY1OCA2NS43MjE2IDQ3Ljk2NThDNjMuMzE1NyA0Ny45NjU4IDYxLjIzMyA0Ni4xNzA0IDYxLjIzMyA0Mi41Nzk1QzYxLjIzMyAzOC45ODg1IDYzLjMxNTcgMzcuMTkzMSA2NS43MjE2IDM3LjE5MzFDNjguMDkxNiAzNy4xOTMxIDcwLjIxMDMgMzguOTg4NSA3MC4yMTAzIDQyLjU3OTVaIiBmaWxsPSIjRkZGREY4Ii8+Cjwvc3ZnPg==";

function win(): PhantomWindowLike | null {
  if (typeof window === "undefined") return null;
  return window as unknown as PhantomWindowLike;
}

export class ArcadePhantomWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = ArcadePhantomWalletName;
  url = "https://phantom.app/";
  icon = PHANTOM_ICON;
  readonly supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set([
    "legacy",
    0,
  ]);

  private _connecting = false;
  private _wallet: PhantomSolanaProvider | null = null;
  private _publicKey: PublicKey | null = null;
  private _readyState: WalletReadyState =
    typeof window === "undefined" || typeof document === "undefined"
      ? WalletReadyState.Unsupported
      : WalletReadyState.NotDetected;

  constructor() {
    super();
    if (this._readyState !== WalletReadyState.Unsupported) {
      scopePollingDetectionStrategy(() => {
        if (isPhantomProviderPresent(win())) {
          this._readyState = WalletReadyState.Installed;
          this.emit("readyStateChange", this._readyState);
          return true;
        }
        return false;
      });
    }
  }

  get publicKey() {
    return this._publicKey;
  }

  get connecting() {
    return this._connecting;
  }

  get readyState() {
    return this._readyState;
  }

  async connect(): Promise<void> {
    try {
      if (this.connected || this._connecting) return;

      let wallet = resolvePhantomProvider(win());
      if (!wallet) {
        throw new WalletNotReadyError();
      }
      if (this._readyState !== WalletReadyState.Installed) {
        this._readyState = WalletReadyState.Installed;
        this.emit("readyStateChange", this._readyState);
      }

      this._connecting = true;

      if (!wallet.isConnected) {
        try {
          await wallet.connect();
        } catch (error: unknown) {
          const msg =
            error instanceof Error ? error.message : "Phantom connection failed";
          throw new WalletConnectionError(msg, error as Error);
        }
      }

      // Re-resolve after connect (some builds replace the object)
      wallet = resolvePhantomProvider(win()) ?? wallet;
      if (!wallet.publicKey) throw new WalletAccountError();

      let publicKey: PublicKey;
      try {
        publicKey = new PublicKey(wallet.publicKey.toBytes());
      } catch (error: unknown) {
        throw new WalletPublicKeyError(
          error instanceof Error ? error.message : "Invalid public key",
          error as Error
        );
      }

      this._wallet = wallet;
      this._publicKey = publicKey;
      wallet.on?.("disconnect", this._disconnected as (...args: unknown[]) => void);
      wallet.on?.(
        "accountChanged",
        this._accountChanged as (...args: unknown[]) => void
      );
      this.emit("connect", publicKey);
    } catch (error: unknown) {
      if (error instanceof WalletError) {
        this.emit("error", error);
      } else if (error instanceof Error) {
        this.emit("error", new WalletConnectionError(error.message, error));
      }
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    const wallet = this._wallet;
    if (wallet) {
      wallet.off?.(
        "disconnect",
        this._disconnected as (...args: unknown[]) => void
      );
      wallet.off?.(
        "accountChanged",
        this._accountChanged as (...args: unknown[]) => void
      );
      this._wallet = null;
      this._publicKey = null;
      try {
        await wallet.disconnect?.();
      } catch {
        /* ignore */
      }
    }
    this.emit("disconnect");
  }

  async signTransaction<
    T extends TransactionOrVersionedTransaction<this["supportedTransactionVersions"]>,
  >(transaction: T): Promise<T> {
    if (!this._wallet || !this._publicKey) throw new WalletNotReadyError();
    const w = this._wallet as PhantomSolanaProvider & {
      signTransaction?: (tx: T) => Promise<T>;
    };
    if (!w.signTransaction) {
      throw new WalletConnectionError("Phantom signTransaction unavailable");
    }
    return w.signTransaction(transaction);
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this._wallet || !this._publicKey) throw new WalletNotReadyError();
    const w = this._wallet as PhantomSolanaProvider & {
      signMessage?: (
        msg: Uint8Array,
        display?: string
      ) => Promise<{ signature: Uint8Array } | Uint8Array>;
    };
    if (!w.signMessage) {
      throw new WalletConnectionError("Phantom signMessage unavailable");
    }
    const out = await w.signMessage(message, "utf8");
    if (out instanceof Uint8Array) return out;
    return out.signature;
  }

  private _disconnected = (..._args: unknown[]) => {
    const wallet = this._wallet;
    if (wallet) {
      wallet.off?.(
        "disconnect",
        this._disconnected as (...args: unknown[]) => void
      );
      wallet.off?.(
        "accountChanged",
        this._accountChanged as (...args: unknown[]) => void
      );
      this._wallet = null;
      this._publicKey = null;
      this.emit("error", new WalletDisconnectedError());
      this.emit("disconnect");
    }
  };

  private _accountChanged = (...args: unknown[]) => {
    const publicKey = this._publicKey;
    if (!publicKey) return;
    const newPublicKey = args[0] as { toBytes?: () => Uint8Array } | undefined;
    if (!newPublicKey?.toBytes) return;
    try {
      const next = new PublicKey(newPublicKey.toBytes());
      if (publicKey.equals(next)) return;
      this._publicKey = next;
      this.emit("connect", next);
    } catch (error: unknown) {
      this.emit(
        "error",
        new WalletPublicKeyError(
          error instanceof Error ? error.message : "Invalid key",
          error as Error
        )
      );
    }
  };
}
