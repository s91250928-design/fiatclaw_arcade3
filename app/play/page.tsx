"use client";

/**
 * FiatClaw Arcade LOBBY (game lobby).
 * Responsive: 1 column <768px. Wallet: Phantom/Solflare via modal.
 * PLAY NOW opens /play/game when connected + plays > 0.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { useWalletUiError } from "@/components/SolanaProvider";
import { useArcadePlayer } from "@/hooks/useArcadePlayer";
import {
  RED,
  CYAN,
  MUTED,
  FONTS_HREF,
  panelStyle as panel,
  labelStyle as label,
  valueStyle as value,
  ctaStyle,
  ctaGhostStyle,
} from "@/lib/arcade-ui";

export default function ArcadeLobbyPage() {
  const router = useRouter();
  const { setVisible: openWalletModal } = useWalletModal();
  const { error: walletError } = useWalletUiError();
  const p = useArcadePlayer();
  const busy = p.status === "buying";

  const canEnterVault =
    p.wallet.connected && p.availablePlays > 0 && !busy;

  const enterVault = async () => {
    if (!p.wallet.connected) {
      p.setMessage("Select Phantom or Solflare to continue");
      p.setStatus("error");
      // Open official wallet modal (extension / mobile deep link)
      openWalletModal(true);
      return;
    }
    if (p.availablePlays < 1) {
      p.setMessage("Buy plays first, then press PLAY NOW");
      p.setStatus("error");
      return;
    }
    await p.refreshState();
    p.setMessage("Entering vault…");
    router.push("/play/game");
  };

  const playNowStyle: React.CSSProperties = {
    marginTop: 8,
    width: "min(100%, 320px)",
    minHeight: 72,
    borderRadius: 16,
    border: canEnterVault
      ? "2px solid rgba(255,140,160,0.9)"
      : "2px solid rgba(255,62,92,0.45)",
    cursor: canEnterVault || !p.wallet.connected ? "pointer" : "not-allowed",
    color: "#fff",
    fontFamily: "Orbitron, sans-serif",
    fontWeight: 800,
    fontSize: 18,
    letterSpacing: "0.28em",
    background: canEnterVault
      ? `radial-gradient(circle at 40% 22%, #FF9AAB 0%, ${RED} 40%, #B01028 75%, #2a040c 100%)`
      : !p.wallet.connected
        ? `linear-gradient(180deg, #5a2030, #2a0a14)`
        : "linear-gradient(180deg, #3a1820, #1a0a10)",
    boxShadow: canEnterVault
      ? "0 0 56px rgba(255,37,68,0.75), 0 10px 0 #2a040c"
      : "none",
    textShadow: "0 0 18px rgba(255,62,92,0.8)",
    opacity: canEnterVault || !p.wallet.connected ? 1 : 0.65,
    transition: "transform 0.12s, box-shadow 0.2s",
    touchAction: "manipulation",
  };

  return (
    <>
      <link href={FONTS_HREF} rel="stylesheet" />
      <main data-arcade-lobby className="lobby-main">
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            background:
              "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(255,37,68,0.12), transparent 55%), radial-gradient(ellipse 40% 35% at 80% 70%, rgba(34,211,255,0.06), transparent), radial-gradient(ellipse 35% 30% at 15% 80%, rgba(123,63,228,0.07), transparent)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        <header className="lobby-header">
          <Link href="/" className="lobby-brand">
            <span style={{ fontSize: 18 }}>⬡</span> FIATCLAW
            <span className="lobby-brand-sub" style={{ color: MUTED, fontWeight: 500, fontSize: 10 }}>
              ARCADE
            </span>
          </Link>
          <nav className="lobby-nav">
            <Link href="/play" className="lobby-nav-link">
              LOBBY
            </Link>
            <Link href="/stake" className="lobby-nav-link lobby-nav-link--optional">
              STAKING
            </Link>
            <Link
              href="/leaderboard"
              className="lobby-nav-link lobby-nav-link--optional"
            >
              LEADERBOARD
            </Link>
            <Link href="/admin" className="lobby-nav-link lobby-nav-link--optional">
              ADMIN
            </Link>
            {p.shortWallet && (
              <span
                data-wallet-chip
                style={{
                  ...label,
                  color: CYAN,
                  padding: "6px 10px",
                  border: "1px solid rgba(34,211,255,0.25)",
                  borderRadius: 8,
                  flexShrink: 0,
                }}
              >
                {p.shortWallet}
              </span>
            )}
            <WalletConnectButton />
          </nav>
        </header>

        <div className="lobby-stats">
          {[
            {
              k: "MEGA JACKPOT",
              v: p.jackpotDisplay,
              color: RED,
              attr: "jackpot",
            },
            { k: "ONLINE", v: "—", color: "#14F195", attr: "online" },
            {
              k: "PLAYS",
              v: p.wallet.connected ? String(p.availablePlays) : "—",
              color: CYAN,
              attr: "plays",
            },
            {
              k: "TIER",
              v: `${p.tier}${p.vip ? " · VIP" : ""}`,
              color: "#EDEEF2",
              attr: "tier",
            },
          ].map((c) => (
            <div
              key={c.k}
              style={{
                ...panel,
                textAlign: "center",
                padding: "12px 10px",
              }}
            >
              <p style={label}>{c.k}</p>
              <p
                style={{ ...value, color: c.color, fontSize: 16 }}
                data-stat={c.attr}
              >
                {c.v}
              </p>
            </div>
          ))}
        </div>

        <div className="lobby-grid">
          <aside className="lobby-aside lobby-aside-left">
            <div style={panel} data-play-chrome="wallet">
              <p style={{ ...label, color: RED }}>WALLET OVERVIEW</p>
              <div style={{ marginTop: 12 }}>
                <p style={label}>TOTAL BALANCE</p>
                <p style={value} data-balance="sol">
                  {p.wallet.connected
                    ? p.solBalance == null
                      ? "…"
                      : `${p.solBalance.toFixed(4)} SOL`
                    : "— SOL"}
                </p>
              </div>
              <div style={{ marginTop: 12 }}>
                <p style={label}>$FIATCLAW BALANCE</p>
                <p style={value} data-balance="claw">
                  {p.wallet.connected ? p.clawBalance.toLocaleString() : "—"}
                </p>
              </div>
              {!p.wallet.connected && (
                <button
                  type="button"
                  data-wallet-connect="inline"
                  onClick={() => openWalletModal(true)}
                  style={{
                    ...ctaStyle(false),
                    width: "100%",
                    marginTop: 14,
                    minHeight: 48,
                  }}
                >
                  CONNECT PHANTOM / SOLFLARE
                </button>
              )}
            </div>

            <div style={panel} data-play-chrome="plays">
              <p style={label}>AVAILABLE PLAYS</p>
              <p
                style={{ ...value, fontSize: 28, color: CYAN }}
                data-balance="plays"
              >
                {p.wallet.connected ? p.availablePlays : "—"}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 12,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  data-buy-action="sol"
                  disabled={busy || !p.wallet.connected}
                  onClick={p.onBuySol}
                  style={ctaStyle(busy || !p.wallet.connected)}
                >
                  BUY PLAYS
                </button>
                <button
                  type="button"
                  data-buy-action="claw"
                  disabled={busy || !p.wallet.connected}
                  onClick={p.onBuyClaw}
                  style={ctaGhostStyle(busy || !p.wallet.connected)}
                >
                  $CLAW
                </button>
              </div>
              <p style={{ ...label, marginTop: 10, color: MUTED }}>
                {p.solPrice} SOL · {p.clawCost} $CLAW · qty {p.buyCount}
              </p>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  data-buy-qty="dec"
                  onClick={() => p.setBuyCount((n) => Math.max(1, n - 1))}
                  style={ctaGhostStyle(false)}
                >
                  −
                </button>
                <button
                  type="button"
                  data-buy-qty="inc"
                  onClick={() => p.setBuyCount((n) => Math.min(20, n + 1))}
                  style={ctaGhostStyle(false)}
                >
                  +
                </button>
                <button
                  type="button"
                  data-buy-action="faucet"
                  disabled={!p.wallet.connected}
                  onClick={p.onFaucet}
                  style={ctaGhostStyle(!p.wallet.connected)}
                >
                  FAUCET
                </button>
              </div>
            </div>

            <div style={{ ...panel, borderColor: "rgba(255,62,92,0.35)" }}>
              <p style={{ ...label, color: RED }}>PROGRESSIVE JACKPOT</p>
              <p
                style={{
                  ...value,
                  fontSize: 22,
                  color: RED,
                  textShadow: "0 0 18px rgba(255,37,68,0.45)",
                }}
                data-jackpot="live"
              >
                {p.jackpotDisplay}
              </p>
              <p style={{ ...label, marginTop: 8 }}>$FIATCLAW MEGA VAULT</p>
            </div>

            <div style={panel} data-play-chrome="stake" data-stake-status="server">
              <p style={{ ...label, color: "#9945FF" }}>STAKE $FIATCLAW</p>
              <p style={{ ...label, marginTop: 8, color: MUTED }}>
                VIP fee discount only — does not change win odds (0.2 server).
              </p>
              <p style={{ ...label, marginTop: 8 }} data-stake-staked>
                Staked {p.stakedClaw.toLocaleString()} · {p.tier}
                {p.vip ? " VIP" : ""} · fee {Math.round(p.feeMultiplier * 100)}%
              </p>
              <p style={{ ...label, marginTop: 8, color: MUTED, fontSize: 10 }}>
                Stake = SOL to treasury (verified). Unstake = request, no free mint.
              </p>
              <input
                type="number"
                min={100}
                step={100}
                value={p.stakeAmt}
                data-stake-input="amount"
                onChange={(e) =>
                  p.setStakeAmt(Math.max(1, Number(e.target.value) || 0))
                }
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(34,211,255,0.25)",
                  background: "rgba(4,6,10,0.9)",
                  color: "#EDEEF2",
                  fontFamily: "Orbitron, sans-serif",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  data-stake-action="stake"
                  disabled={!p.wallet.connected}
                  onClick={() => p.onStake("stake")}
                  style={ctaStyle(!p.wallet.connected)}
                >
                  STAKE
                </button>
                <button
                  type="button"
                  data-stake-action="unstake"
                  disabled={!p.wallet.connected || p.stakedClaw < 1}
                  onClick={() => p.onStake("unstake")}
                  style={ctaGhostStyle(
                    !p.wallet.connected || p.stakedClaw < 1
                  )}
                >
                  UNSTAKE
                </button>
              </div>
              <Link
                href="/stake"
                style={{
                  display: "inline-block",
                  marginTop: 12,
                  fontFamily: "Orbitron, sans-serif",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  color: CYAN,
                  textDecoration: "none",
                }}
              >
                FULL STAKING PAGE →
              </Link>
            </div>
          </aside>

          <section className="lobby-hero" data-lobby-hero>
            <p style={{ ...label, color: CYAN, letterSpacing: "0.28em" }}>
              CRYPTO VAULT LOBBY
            </p>
            <h1
              style={{
                margin: 0,
                fontFamily: "Orbitron, sans-serif",
                fontWeight: 800,
                fontSize: "clamp(20px, 5vw, 36px)",
                letterSpacing: "0.08em",
                color: "#EDEEF2",
                textShadow: "0 0 40px rgba(255,62,92,0.35)",
                maxWidth: 420,
                lineHeight: 1.25,
              }}
            >
              ENTER THE FIATCLAW VAULT
            </h1>
            <p
              style={{
                margin: 0,
                maxWidth: 380,
                color: MUTED,
                fontSize: 13,
                lineHeight: 1.6,
                fontFamily: "Inter, sans-serif",
              }}
            >
              Buy plays, stake for VIP fees, then launch a full-screen claw
              session. The machine lives in its own arena — not inside the lobby.
            </p>

            <button
              type="button"
              className="lobby-play-now"
              data-lobby-action="play-now"
              data-play-now
              disabled={p.wallet.connected && p.availablePlays < 1}
              onClick={enterVault}
              style={playNowStyle}
            >
              {!p.wallet.connected
                ? "CONNECT TO PLAY"
                : p.availablePlays > 0
                  ? "PLAY NOW"
                  : "BUY PLAYS FIRST"}
            </button>
            <p style={{ ...label, color: MUTED, marginTop: 4 }}>
              {p.wallet.connected
                ? p.availablePlays > 0
                  ? `${p.availablePlays} PLAY${p.availablePlays === 1 ? "" : "S"} READY`
                  : "BUY PLAYS TO ENTER"
                : "CONNECT PHANTOM OR SOLFLARE"}
            </p>

            {canEnterVault && (
              <Link
                href="/play/game"
                data-lobby-link="game"
                style={{
                  fontFamily: "Orbitron, sans-serif",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  color: CYAN,
                  textDecoration: "none",
                }}
              >
                OPEN VAULT SCENE →
              </Link>
            )}

            <div
              style={{
                ...panel,
                width: "100%",
                maxWidth: 420,
                marginTop: 12,
                textAlign: "center",
                boxSizing: "border-box",
              }}
              data-play-message
            >
              <p
                style={{
                  margin: 0,
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12,
                  color:
                    p.status === "error"
                      ? "#FF6B7A"
                      : p.status === "success" || p.status === "ready"
                        ? "#14F195"
                        : MUTED,
                }}
              >
                {walletError
                  ? `Wallet: ${walletError}`
                  : p.message ||
                    (p.wallet.connected
                      ? "Lobby ready — buy plays, then PLAY NOW."
                      : "Connect Phantom or Solflare to use the lobby.")}
              </p>
            </div>
          </section>

          <aside className="lobby-aside lobby-aside-right">
            <div style={panel}>
              <p style={{ ...label, color: CYAN }}>HOW TO PLAY</p>
              <ol
                style={{
                  margin: "12px 0 0",
                  paddingLeft: 18,
                  color: MUTED,
                  fontSize: 12,
                  lineHeight: 1.7,
                  fontFamily: "Inter, sans-serif",
                }}
              >
                <li>Connect wallet</li>
                <li>Buy plays (SOL or $FIATCLAW)</li>
                <li>Press PLAY NOW</li>
                <li>Aim · PULL in the vault scene</li>
              </ol>
            </div>

            <div style={panel} data-play-chrome="winners">
              <p style={label}>RECENT WINNERS</p>
              <p
                style={{
                  ...label,
                  marginTop: 12,
                  color: MUTED,
                  lineHeight: 1.6,
                }}
              >
                Live feed unlocks after first on-chain wins.
              </p>
              <Link
                href="/leaderboard"
                style={{
                  display: "inline-block",
                  marginTop: 12,
                  fontFamily: "Orbitron, sans-serif",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  color: CYAN,
                  textDecoration: "none",
                }}
              >
                VIEW LEADERBOARD →
              </Link>
            </div>

            <div style={panel} data-lobby-missions>
              <p style={{ ...label, color: "#F5C542" }}>DAILY MISSIONS</p>
              <p
                style={{
                  ...label,
                  marginTop: 12,
                  color: MUTED,
                  lineHeight: 1.6,
                }}
              >
                Complete pulls · stake · refer friends for bonus plays.
              </p>
              <ul
                style={{
                  margin: "12px 0 0",
                  paddingLeft: 16,
                  color: MUTED,
                  fontSize: 11,
                  lineHeight: 1.7,
                }}
              >
                <li>First pull of the day</li>
                <li>Stake any $FIATCLAW</li>
                <li>Share referral link</li>
              </ul>
            </div>

            <div style={panel} data-lobby-referral>
              <p style={{ ...label, color: "#14F195" }}>REFERRAL</p>
              <p
                style={{
                  ...label,
                  marginTop: 12,
                  color: MUTED,
                  lineHeight: 1.6,
                }}
              >
                Invite players — earn rewards when they buy plays.
              </p>
              <p
                style={{
                  ...value,
                  fontSize: 11,
                  color: CYAN,
                  marginTop: 10,
                  wordBreak: "break-all",
                }}
              >
                {p.wallet.publicKey
                  ? `ref=${p.wallet.publicKey.toBase58().slice(0, 8)}…`
                  : "Connect wallet for your code"}
              </p>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
