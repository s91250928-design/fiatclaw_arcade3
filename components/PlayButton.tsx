/**
 * PlayButton — безопасный старт игры.
 * 1. Кошелёк платит на казну.
 * 2. Сервер проверяет tx on-chain.
 * 3. Только после этого возвращается playId.
 * Клиент никогда не решает, есть ли у него кредит.
 */

"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { startPlay } from "@/lib/pay";

type Status = "idle" | "paying" | "verifying" | "success" | "error";

export function PlayButton() {
  const wallet = useWallet();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");
  const [playId, setPlayId] = useState<string | null>(null);

  const onPlay = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey) {
      setStatus("error");
      setMessage("Сначала подключи кошелёк");
      return;
    }

    setStatus("paying");
    setMessage("Подтверди оплату в кошельке…");
    setPlayId(null);

    try {
      setStatus("verifying");
      setMessage("Проверяем оплату on-chain…");

      const result = await startPlay(wallet);

      setPlayId(result.playId);
      setStatus("success");
      setMessage(`Игра создана. ID: ${result.playId.slice(0, 8)}…`);
      // Дальше Фаза 2/3 запустит саму клешню с этим playId
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ошибка оплаты";
      setStatus("error");
      setMessage(msg);
    }
  }, [wallet]);

  const busy = status === "paying" || status === "verifying";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <button
        type="button"
        onClick={onPlay}
        disabled={busy || !wallet.connected}
        style={{
          padding: "14px 28px",
          borderRadius: 12,
          border: "1px solid rgba(255,120,140,.45)",
          cursor: busy || !wallet.connected ? "not-allowed" : "pointer",
          color: "#fff",
          font: "800 13px/1 Inter, system-ui, sans-serif",
          letterSpacing: "0.12em",
          background: busy
            ? "rgba(100,100,100,.4)"
            : "linear-gradient(180deg,#FF3E5C,#C4102A 62%,#8C0A1E)",
          boxShadow: busy ? "none" : "0 0 24px rgba(255,37,68,.4)",
          opacity: !wallet.connected ? 0.5 : 1,
          transition: "transform .2s, box-shadow .2s",
        }}
      >
        {busy ? (status === "paying" ? "ОПЛАТА…" : "ПРОВЕРКА…") : "ИГРАТЬ"}
      </button>

      {message && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color:
              status === "error"
                ? "#FF6B6B"
                : status === "success"
                  ? "#14F195"
                  : "#9BA1AE",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
          }}
        >
          {message}
        </p>
      )}

      {playId && (
        <p style={{ margin: 0, fontSize: 11, color: "#6B7280" }}>
          playId: {playId}
        </p>
      )}
    </div>
  );
}
