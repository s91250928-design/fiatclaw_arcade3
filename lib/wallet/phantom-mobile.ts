/**
 * Phantom mobile deep-link helpers (jup.ag-style).
 * - Browse UL: open dApp inside Phantom in-app browser (provider inject available).
 * - Connect UL: encrypted connect + redirect back with public_key session.
 * Pure functions — unit-testable without browser.
 *
 * @see https://docs.phantom.com/phantom-deeplinks/other-methods/browse
 * @see https://docs.phantom.com/phantom-deeplinks/provider-methods/connect
 */

import bs58 from "bs58";
import nacl from "tweetnacl";

export const PHANTOM_UL_BROWSE = "https://phantom.app/ul/browse";
export const PHANTOM_UL_CONNECT = "https://phantom.app/ul/v1/connect";
/** Shown while handing off to the Phantom app (browse UL / in-app browser). */
export const PHANTOM_MOBILE_OPEN_MESSAGE =
  "Opening Phantom… When the site opens inside Phantom, approve Connect.";

/**
 * Query flag appended to browse target so the in-app page auto-selects Phantom
 * and runs inject connect() after the Universal Link opens the site.
 */
export const PHANTOM_BROWSE_INTENT = "fc_phantom";

/**
 * Storage keys for deeplink round-trip (public data + dapp encryption secret only).
 * Secret is dual-written to sessionStorage + localStorage: Phantom HTTPS redirect
 * often opens a new browser context that does not share sessionStorage.
 */
export const PHANTOM_SS_SECRET = "fiatclaw_phantom_dapp_sk";
export const PHANTOM_SS_PENDING = "fiatclaw_phantom_mobile_pending";
export const PHANTOM_SS_PUBLIC_KEY = "fiatclaw_phantom_pk";
export const PHANTOM_SS_SESSION = "fiatclaw_phantom_session";

export function isMobileUserAgent(ua: string): boolean {
  if (!ua) return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(
    ua
  );
}

/** Phantom in-app browser already injects provider — do not re-open deep link. */
export function isPhantomInAppBrowser(ua: string): boolean {
  return /Phantom/i.test(ua);
}

/**
 * Use mobile deep link when: mobile UA, no inject, not already in Phantom browser.
 */
export function shouldUsePhantomMobileDeepLink(input: {
  userAgent: string;
  hasInjectedProvider: boolean;
}): boolean {
  if (input.hasInjectedProvider) return false;
  if (isPhantomInAppBrowser(input.userAgent)) return false;
  return isMobileUserAgent(input.userAgent);
}

/**
 * Open current page inside Phantom in-app browser (provider injects there).
 * https://phantom.app/ul/browse/<url>?ref=<ref>
 */
export function buildPhantomBrowseDeepLink(
  pageUrl: string,
  refUrl: string
): string {
  const url = encodeURIComponent(pageUrl);
  const ref = encodeURIComponent(refUrl);
  return `${PHANTOM_UL_BROWSE}/${url}?ref=${ref}`;
}

export type PhantomConnectKeypair = {
  publicKeyBs58: string;
  secretKeyBs58: string;
};

/** x25519 keypair for Phantom connect encryption. */
export function createPhantomConnectKeypair(
  randomBytes?: (n: number) => Uint8Array
): PhantomConnectKeypair {
  const kp = randomBytes
    ? nacl.box.keyPair.fromSecretKey(randomBytes(nacl.box.secretKeyLength))
    : nacl.box.keyPair();
  return {
    publicKeyBs58: bs58.encode(kp.publicKey),
    secretKeyBs58: bs58.encode(kp.secretKey),
  };
}

export function buildPhantomConnectDeepLink(params: {
  appUrl: string;
  redirectLink: string;
  dappEncryptionPublicKey: string;
  cluster?: "devnet" | "testnet" | "mainnet-beta";
}): string {
  const q = new URLSearchParams();
  // Phantom requires these query values URL-encoded (URLSearchParams handles it)
  q.set("app_url", params.appUrl);
  q.set("redirect_link", params.redirectLink);
  q.set("dapp_encryption_public_key", params.dappEncryptionPublicKey);
  q.set("cluster", params.cluster ?? "devnet");
  return `${PHANTOM_UL_CONNECT}?${q.toString()}`;
}

export type PhantomConnectReturn =
  | { ok: true; publicKey: string; session: string }
  | { ok: false; message: string; kind: "reject" | "error" };

/**
 * Parse Phantom connect redirect query and decrypt public_key + session.
 * Query: phantom_encryption_public_key, nonce, data (or errorCode/errorMessage).
 */
export function parsePhantomConnectReturn(
  search: string | URLSearchParams,
  dappSecretKeyBs58: string
): PhantomConnectReturn {
  const params =
    typeof search === "string"
      ? new URLSearchParams(
          search.startsWith("?") ? search.slice(1) : search
        )
      : search;

  const errCode = params.get("errorCode");
  const errMsg = params.get("errorMessage");
  if (errCode || errMsg) {
    const msg = errMsg || `Phantom error ${errCode}`;
    if (/reject|denied|user|4001/i.test(msg)) {
      return { ok: false, message: msg, kind: "reject" };
    }
    return { ok: false, message: msg, kind: "error" };
  }

  const phantomPk = params.get("phantom_encryption_public_key");
  const nonce = params.get("nonce");
  const data = params.get("data");
  if (!phantomPk || !nonce || !data) {
    return {
      ok: false,
      message: "Missing Phantom connect response parameters.",
      kind: "error",
    };
  }

  try {
    const dappSecret = bs58.decode(dappSecretKeyBs58);
    const phantomPub = bs58.decode(phantomPk);
    const nonceBytes = bs58.decode(nonce);
    const dataBytes = bs58.decode(data);
    const shared = nacl.box.before(phantomPub, dappSecret);
    const opened = nacl.secretbox.open(dataBytes, nonceBytes, shared);
    if (!opened) {
      return {
        ok: false,
        message: "Could not decrypt Phantom connect response.",
        kind: "error",
      };
    }
    const json = JSON.parse(new TextDecoder().decode(opened)) as {
      public_key?: string;
      session?: string;
    };
    if (!json.public_key || !json.session) {
      return {
        ok: false,
        message: "Phantom connect response missing public_key.",
        kind: "error",
      };
    }
    return {
      ok: true,
      publicKey: json.public_key,
      session: json.session,
    };
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error
          ? e.message
          : "Failed to parse Phantom connect response.",
      kind: "error",
    };
  }
}

/** Web Storage–shaped bag for pure tests */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * Read primary first, then durable (localStorage).
 * Write/remove both so Phantom redirect into a new tab still decrypts.
 */
export function dualWriteStorage(
  primary: StorageLike,
  durable?: StorageLike | null
): StorageLike {
  return {
    getItem(key: string) {
      return primary.getItem(key) ?? durable?.getItem(key) ?? null;
    },
    setItem(key: string, value: string) {
      primary.setItem(key, value);
      durable?.setItem(key, value);
    },
    removeItem(key: string) {
      primary.removeItem(key);
      durable?.removeItem(key);
    },
  };
}

/** Browser dual bag: sessionStorage + localStorage. */
export function browserPhantomStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return dualWriteStorage(sessionStorage, localStorage);
  } catch {
    try {
      return sessionStorage;
    } catch {
      return null;
    }
  }
}

export function storePhantomConnectSecret(
  storage: StorageLike,
  secretKeyBs58: string
): void {
  storage.setItem(PHANTOM_SS_SECRET, secretKeyBs58);
  storage.setItem(PHANTOM_SS_PENDING, "1");
}

export function loadPhantomConnectSecret(
  storage: StorageLike
): string | null {
  return storage.getItem(PHANTOM_SS_SECRET);
}

export function clearPhantomConnectSecret(storage: StorageLike): void {
  storage.removeItem(PHANTOM_SS_SECRET);
  storage.removeItem(PHANTOM_SS_PENDING);
}

export function storePhantomMobileSession(
  storage: StorageLike,
  publicKey: string,
  session: string
): void {
  storage.setItem(PHANTOM_SS_PUBLIC_KEY, publicKey);
  storage.setItem(PHANTOM_SS_SESSION, session);
  storage.removeItem(PHANTOM_SS_PENDING);
  storage.removeItem(PHANTOM_SS_SECRET);
}

export function loadPhantomMobilePublicKey(
  storage: StorageLike
): string | null {
  return storage.getItem(PHANTOM_SS_PUBLIC_KEY);
}

export function clearPhantomMobileSession(storage: StorageLike): void {
  storage.removeItem(PHANTOM_SS_PUBLIC_KEY);
  storage.removeItem(PHANTOM_SS_SESSION);
  storage.removeItem(PHANTOM_SS_PENDING);
  storage.removeItem(PHANTOM_SS_SECRET);
}

/**
 * Append browse-intent query so the site auto-connects once opened in Phantom.
 */
export function withPhantomBrowseIntent(pageHref: string): string {
  try {
    const u = new URL(pageHref);
    u.searchParams.set(PHANTOM_BROWSE_INTENT, "1");
    return u.toString();
  } catch {
    const sep = pageHref.includes("?") ? "&" : "?";
    return `${pageHref}${sep}${PHANTOM_BROWSE_INTENT}=1`;
  }
}

export function hasPhantomBrowseIntent(search: string): boolean {
  const q = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(q).get(PHANTOM_BROWSE_INTENT) === "1";
}

/** Strip browse-intent flag; returns pathname+search+hash (or full href on parse fail). */
export function stripPhantomBrowseIntent(href: string): string {
  try {
    const u = new URL(href);
    u.searchParams.delete(PHANTOM_BROWSE_INTENT);
    return u.pathname + u.search + u.hash;
  } catch {
    return href;
  }
}

/**
 * Build browse OR connect deep link for mobile (no inject).
 *
 * Default is **browse** (jup.ag-style): open the dApp inside Phantom’s in-app
 * browser so `window.phantom.solana` inject is available and connect() works.
 * Encrypted connect UL remains available when mode:"connect" + encryption key
 * (HTTPS redirect_link is fragile — new browser tab, decrypt/secret identity).
 */
export function buildPhantomMobileOpenUrl(input: {
  pageHref: string;
  origin: string;
  cluster?: "devnet" | "testnet" | "mainnet-beta";
  /** browse = in-app inject (default); connect = encrypted redirect return. */
  mode?: "browse" | "connect";
  dappEncryptionPublicKey?: string;
}): string {
  const mode = input.mode ?? "browse";
  if (mode === "connect" && input.dappEncryptionPublicKey) {
    return buildPhantomConnectDeepLink({
      appUrl: input.origin,
      redirectLink: input.pageHref,
      dappEncryptionPublicKey: input.dappEncryptionPublicKey,
      cluster: input.cluster,
    });
  }
  return buildPhantomBrowseDeepLink(input.pageHref, input.origin);
}

/**
 * Install vs open policy: on mobile, do NOT show Install when deep link is viable.
 */
export function phantomAbsentMessage(input: {
  userAgent: string;
  hasInjectedProvider: boolean;
}): { kind: "install" | "mobile_open"; message: string } {
  if (
    shouldUsePhantomMobileDeepLink({
      userAgent: input.userAgent,
      hasInjectedProvider: input.hasInjectedProvider,
    })
  ) {
    return { kind: "mobile_open", message: PHANTOM_MOBILE_OPEN_MESSAGE };
  }
  return {
    kind: "install",
    message: "Install Phantom: https://phantom.app",
  };
}
