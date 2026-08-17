/**
 * Phantom wallet-adapter entry that uses the OFFICIAL provider path only.
 * Detect/connect: docs.phantom.com getProvider + provider.connect().
 * readyState is Loadable when inject is pending (matches Solflare / WalletProviderBase)
 * so connect() is never blocked by WalletNotReadyError before we wait for inject.
 * When Wallet Standard registers "Phantom", WalletProvider filters this same-name
 * entry — Standard owns that slot (no dual-active package+Standard conflict).
 */

import {
  BaseMessageSignerWalletAdapter,
  WalletAccountError,
  WalletConnectionError,
  WalletDisconnectedError,
  WalletError,
  WalletName,
  WalletPublicKeyError,
  WalletReadyState,
  type TransactionOrVersionedTransaction,
} from "@solana/wallet-adapter-base";
import { PublicKey, type TransactionVersion } from "@solana/web3.js";
import {
  connectPhantomOfficial,
  getPhantomProvider,
  PHANTOM_INSTALL_MESSAGE,
  type OfficialPhantomProvider,
  type PhantomWindowLike,
} from "./phantom-official";
import {
  browserPhantomStorage,
  buildPhantomMobileOpenUrl,
  clearPhantomMobileSession,
  isMobileUserAgent,
  loadPhantomMobilePublicKey,
  PHANTOM_MOBILE_OPEN_MESSAGE,
  shouldUsePhantomMobileDeepLink,
  withPhantomBrowseIntent,
} from "./phantom-mobile";

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
  private _wallet: OfficialPhantomProvider | null = null;
  private _publicKey: PublicKey | null = null;

  /**
   * Loadable when inject pending; Installed when getProvider() finds extension.
   * Never NotDetected — WalletProviderBase would throw WalletNotReadyError
   * before our official wait/retry connect path runs.
   */
  get readyState(): WalletReadyState {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return WalletReadyState.Unsupported;
    }
    return getPhantomProvider(win())
      ? WalletReadyState.Installed
      : WalletReadyState.Loadable;
  }

  get publicKey() {
    return this._publicKey;
  }

  get connecting() {
    return this._connecting;
  }

  async connect(): Promise<void> {
    try {
      if (this.connected || this._connecting) return;
      this._connecting = true;

      // Already connected at provider (e.g. bridge ran official connect first)
      let provider = getPhantomProvider(win());
      let publicKeyStr: string | null = null;

      if (provider?.isConnected && provider.publicKey) {
        publicKeyStr =
          typeof provider.publicKey.toBase58 === "function"
            ? provider.publicKey.toBase58()
            : provider.publicKey.toString();
      } else if (provider) {
        // Official docs: brief inject wait → provider.connect() (extension / in-app)
        const result = await connectPhantomOfficial(() => win(), {
          timeoutMs: 2_500,
          pollMs: 50,
        });
        if (!result.ok) {
          throw new WalletConnectionError(result.message);
        }
        publicKeyStr = result.publicKey;
        provider = getPhantomProvider(win());
      } else {
        // Mobile deep-link return: restore publicKey (session+local dual storage)
        const bag = browserPhantomStorage();
        const cached = bag ? loadPhantomMobilePublicKey(bag) : null;
        if (cached) {
          publicKeyStr = cached;
          provider = null;
        } else {
          const ua =
            typeof navigator !== "undefined" ? navigator.userAgent : "";
          if (
            shouldUsePhantomMobileDeepLink({
              userAgent: ua,
              hasInjectedProvider: false,
            })
          ) {
            // jup.ag-style browse UL → site in Phantom in-app browser (inject)
            const openUrl = buildPhantomMobileOpenUrl({
              pageHref: withPhantomBrowseIntent(window.location.href),
              origin: window.location.origin,
              cluster:
                (process.env.NEXT_PUBLIC_SOLANA_CLUSTER as
                  | "devnet"
                  | "testnet"
                  | "mainnet-beta"
                  | undefined) ?? "devnet",
              mode: "browse",
            });
            window.location.assign(openUrl);
            throw new WalletConnectionError(PHANTOM_MOBILE_OPEN_MESSAGE);
          }
          // Desktop / no mobile path: Install
          throw new WalletConnectionError(PHANTOM_INSTALL_MESSAGE);
        }
      }

      if (!publicKeyStr) {
        throw new WalletAccountError();
      }

      let publicKey: PublicKey;
      try {
        if (provider?.publicKey?.toBytes) {
          publicKey = new PublicKey(provider.publicKey.toBytes());
        } else {
          publicKey = new PublicKey(publicKeyStr);
        }
      } catch (error: unknown) {
        throw new WalletPublicKeyError(
          error instanceof Error ? error.message : "Invalid public key",
          error as Error
        );
      }

      this._wallet = provider;
      this._publicKey = publicKey;
      if (provider) {
        provider.on?.(
          "disconnect",
          this._disconnected as (...args: unknown[]) => void
        );
        provider.on?.(
          "accountChanged",
          this._accountChanged as (...args: unknown[]) => void
        );
      }
      this.emit("readyStateChange", this.readyState);
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
      try {
        await wallet.disconnect?.();
      } catch {
        /* ignore */
      }
    }
    // Always clear — mobile-hydrated sessions have _wallet=null but _publicKey set
    this._wallet = null;
    this._publicKey = null;
    const bag = browserPhantomStorage();
    if (bag) clearPhantomMobileSession(bag);
    this.emit("disconnect");
  }

  async signTransaction<
    T extends TransactionOrVersionedTransaction<this["supportedTransactionVersions"]>,
  >(transaction: T): Promise<T> {
    // Prefer live inject (desktop or Phantom in-app browser)
    const live = getPhantomProvider(win());
    const wallet = this._wallet ?? live;
    if (!wallet || !this._publicKey) {
      const ua =
        typeof navigator !== "undefined" ? navigator.userAgent : "";
      if (isMobileUserAgent(ua) && !live) {
        throw new WalletConnectionError(
          "Open this site in Phantom (or reconnect) to sign transactions."
        );
      }
      throw new WalletConnectionError(PHANTOM_INSTALL_MESSAGE);
    }
    if (!wallet.signTransaction) {
      throw new WalletConnectionError("Phantom signTransaction unavailable");
    }
    return wallet.signTransaction(transaction) as Promise<T>;
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const live = getPhantomProvider(win());
    const wallet = this._wallet ?? live;
    if (!wallet || !this._publicKey) {
      const ua =
        typeof navigator !== "undefined" ? navigator.userAgent : "";
      if (isMobileUserAgent(ua) && !live) {
        throw new WalletConnectionError(
          "Open this site in Phantom (or reconnect) to sign messages."
        );
      }
      throw new WalletConnectionError(PHANTOM_INSTALL_MESSAGE);
    }
    if (!wallet.signMessage) {
      throw new WalletConnectionError("Phantom signMessage unavailable");
    }
    const out = await wallet.signMessage(message, "utf8");
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
    const raw = args[0] as
      | { toBytes?: () => Uint8Array; toString?: () => string }
      | null
      | undefined;
    if (!raw) return;
    try {
      const next = raw.toBytes
        ? new PublicKey(raw.toBytes())
        : new PublicKey(String(raw.toString?.() ?? raw));
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
