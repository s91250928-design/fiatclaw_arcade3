/**
 * Shared player wallet / balances / buy-plays / stake for lobby + game.
 * Does not own claw phase machine (game session owns that).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  buyPlaysClaw,
  buyPlaysSol,
  faucetClaw,
  fetchPlayerState,
  stakeClawApi,
} from "@/lib/pay";

export type ArcadeStatus =
  | "idle"
  | "buying"
  | "ready"
  | "starting"
  | "playing"
  | "success"
  | "error";

export function useArcadePlayer() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [status, setStatus] = useState<ArcadeStatus>("idle");
  const [message, setMessage] = useState("");
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [clawBalance, setClawBalance] = useState(0);
  const [availablePlays, setAvailablePlays] = useState(0);
  const [stakedClaw, setStakedClaw] = useState(0);
  const [feeMultiplier, setFeeMultiplier] = useState(1);
  const [tier, setTier] = useState("Standard");
  const [vip, setVip] = useState(false);
  const [jackpot, setJackpot] = useState<string>("—");
  const [priceLamports, setPriceLamports] = useState(50_000_000);
  const [clawPrice, setClawPrice] = useState(500);
  const [buyCount, setBuyCount] = useState(1);
  const [stakeAmt, setStakeAmt] = useState(1000);

  const refreshState = useCallback(async () => {
    if (!wallet.publicKey) return;
    const addr = wallet.publicKey.toBase58();
    try {
      const lamports = await connection.getBalance(wallet.publicKey, "confirmed");
      setSolBalance(lamports / 1e9);
    } catch {
      setSolBalance(null);
    }
    try {
      const data = await fetchPlayerState(addr);
      if (data?.ok) {
        setClawBalance(Number(data.clawBalance ?? 0));
        setAvailablePlays(Number(data.availablePlays ?? 0));
        setStakedClaw(Number(data.stakedClaw ?? 0));
        setFeeMultiplier(Number(data.feeMultiplier ?? 1));
        setTier(String(data.tier ?? "Standard"));
        setVip(Boolean(data.vip));
        setJackpot(String(data.jackpotBalanceLamports ?? "0"));
        setPriceLamports(Number(data.priceLamports ?? 50_000_000));
        setClawPrice(Number(data.clawPrice ?? 500));
      }
    } catch {
      /* ignore */
    }
  }, [wallet.publicKey, connection]);

  useEffect(() => {
    if (!wallet.connected || !wallet.publicKey) {
      setSolBalance(null);
      setClawBalance(0);
      setAvailablePlays(0);
      return;
    }
    refreshState();
    const t = setInterval(refreshState, 12_000);
    return () => clearInterval(t);
  }, [wallet.connected, wallet.publicKey, refreshState]);

  const onBuySol = useCallback(async () => {
    if (!wallet.connected) {
      setMessage("Connect wallet first");
      setStatus("error");
      return;
    }
    setStatus("buying");
    setMessage("Confirm SOL payment in wallet…");
    try {
      const r = await buyPlaysSol(
        wallet,
        buyCount,
        feeMultiplier,
        BigInt(priceLamports)
      );
      setAvailablePlays(r.availablePlays);
      setMessage(
        `+${r.playsBought} plays. Press PLAY NOW to enter the vault.`
      );
      setStatus("ready");
      await refreshState();
    } catch (e: unknown) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Purchase failed");
    }
  }, [wallet, buyCount, feeMultiplier, priceLamports, refreshState]);

  const onBuyClaw = useCallback(async () => {
    if (!wallet.connected) {
      setMessage("Connect wallet first");
      setStatus("error");
      return;
    }
    setStatus("buying");
    setMessage("Debiting $CLAW…");
    try {
      const r = await buyPlaysClaw(wallet, buyCount);
      setAvailablePlays(r.availablePlays);
      setClawBalance(r.clawBalance);
      setMessage(
        `+${buyCount} plays for ${r.costClaw} $CLAW. Press PLAY NOW.`
      );
      setStatus("ready");
      await refreshState();
    } catch (e: unknown) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Purchase failed");
    }
  }, [wallet, buyCount, refreshState]);

  const onFaucet = useCallback(async () => {
    if (!wallet.publicKey) return;
    setMessage("Claiming dev $CLAW…");
    const r = await faucetClaw(wallet.publicKey.toBase58(), 5000);
    if (r.ok) {
      setClawBalance(r.clawBalance);
      setMessage("Credited 5000 $CLAW (dev faucet).");
    } else {
      setMessage(r.error ?? "Faucet failed");
    }
  }, [wallet.publicKey]);

  /**
   * Phase 1: stake credit disabled (amount alone cannot raise staked).
   * Calls API only to surface server message; refreshes status from server.
   */
  const onStake = useCallback(
    async (action: "stake" | "unstake") => {
      if (!wallet.publicKey) return;
      try {
        const r = await stakeClawApi(
          wallet.publicKey.toBase58(),
          action,
          stakeAmt
        );
        // Server never credits in Phase 1 — refresh authoritative status
        await refreshState();
        if (r.credited === false) {
          setMessage(
            r.reason ??
              "Phase 1: stake credit requires on-chain tx (coming in Phase 2)."
          );
        } else {
          setMessage(
            action === "stake"
              ? `Staked ${stakeAmt} $CLAW · ${r.tier}`
              : `Unstaked ${stakeAmt} $CLAW · ${r.tier}`
          );
        }
      } catch (e: unknown) {
        setMessage(e instanceof Error ? e.message : "Stake failed");
        setStatus("error");
      }
    },
    [wallet.publicKey, stakeAmt, refreshState]
  );

  const jackpotSol = (() => {
    const n = Number(jackpot);
    if (!Number.isFinite(n)) return "—";
    return (n / 1e9).toFixed(4);
  })();
  const jackpotDisplay = jackpotSol === "—" ? "—" : `${jackpotSol} SOL`;
  const solPrice = ((priceLamports * feeMultiplier) / 1e9).toFixed(4);
  const clawCost = Math.ceil(clawPrice * feeMultiplier);
  const shortWallet = wallet.publicKey
    ? `${wallet.publicKey.toBase58().slice(0, 4)}…${wallet.publicKey
        .toBase58()
        .slice(-4)}`
    : null;

  return {
    wallet,
    status,
    setStatus,
    message,
    setMessage,
    solBalance,
    clawBalance,
    setClawBalance,
    availablePlays,
    setAvailablePlays,
    stakedClaw,
    feeMultiplier,
    tier,
    vip,
    jackpot,
    setJackpot,
    jackpotDisplay,
    priceLamports,
    clawPrice,
    buyCount,
    setBuyCount,
    stakeAmt,
    setStakeAmt,
    solPrice,
    clawCost,
    shortWallet,
    refreshState,
    onBuySol,
    onBuyClaw,
    onFaucet,
    onStake,
  };
}
