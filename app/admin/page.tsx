"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/WalletConnectButton";

type Prize = {
  id: string;
  code: string;
  kind: string;
  title: string;
  valueLamports: number;
  clawAmount: number;
  weight: number;
  active: boolean;
  maxMultiplierCap: number;
};

export default function AdminPage() {
  const wallet = useWallet();
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [players, setPlayers] = useState<unknown[]>([]);
  const [txs, setTxs] = useState<unknown[]>([]);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [jackpot, setJackpot] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"config" | "prizes" | "players" | "txs">("config");

  const adminWallet = wallet.publicKey?.toBase58() ?? "";

  const headers = useCallback(() => {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (adminWallet) h["x-admin-wallet"] = adminWallet;
    return h;
  }, [adminWallet]);

  const load = useCallback(async () => {
    if (!adminWallet) return;
    const [c, p, pl, t] = await Promise.all([
      fetch("/api/admin?view=config", { headers: headers() }).then((r) => r.json()),
      fetch("/api/admin?view=prizes", { headers: headers() }).then((r) => r.json()),
      fetch("/api/admin?view=players", { headers: headers() }).then((r) => r.json()),
      fetch("/api/admin?view=transactions", { headers: headers() }).then((r) => r.json()),
    ]);
    if (c.ok) {
      setConfig(c.config);
      setJackpot(c.jackpot);
    }
    if (p.ok) setPrizes(p.prizes ?? []);
    if (pl.ok) setPlayers(pl.players ?? []);
    if (t.ok) setTxs(t.transactions ?? []);
  }, [adminWallet, headers]);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...body, adminWallet }),
    });
    const d = await r.json();
    setMsg(d.ok ? "Saved" : d.error ?? "Failed");
    await load();
    return d;
  };

  const panel: React.CSSProperties = {
    padding: 16,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(14,16,22,0.85)",
    marginBottom: 16,
  };

  return (
    <main style={{ minHeight: "100vh", background: "#06070B", color: "#EDEEF2", fontFamily: "Inter, system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/play" style={{ color: "#FF3E5C", textDecoration: "none", fontFamily: "Orbitron, sans-serif", fontSize: 12 }}>
          ← PLAY
        </Link>
        <WalletConnectButton />
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontFamily: "Orbitron, sans-serif", letterSpacing: "0.08em" }}>ADMIN</h1>
        <p style={{ color: "#5c6478", fontSize: 13 }}>
          Connect wallet. Configure rewards, cost, jackpot, machines, view stats & transactions.
        </p>
        {msg && <p style={{ color: "#22D3FF" }}>{msg}</p>}

        <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
          {(["config", "prizes", "players", "txs"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: tab === t ? "1px solid #FF3E5C" : "1px solid #333",
                background: tab === t ? "rgba(255,37,68,0.15)" : "transparent",
                color: "#EDEEF2",
                cursor: "pointer",
                textTransform: "uppercase",
                fontSize: 11,
                letterSpacing: "0.1em",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "config" && config && (
          <div style={panel} data-admin="config">
            <h3>Game cost & jackpot</h3>
            <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
              Price lamports{" "}
              <input
                defaultValue={String(config.priceLamports ?? "")}
                id="cfg-price"
                style={{ marginLeft: 8, padding: 6, background: "#0e1016", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
              />
            </label>
            <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
              $CLAW price{" "}
              <input
                defaultValue={String(config.clawPrice ?? "")}
                id="cfg-claw"
                style={{ marginLeft: 8, padding: 6, background: "#0e1016", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
              />
            </label>
            <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
              Jackpot base{" "}
              <input
                defaultValue={String(config.jackpotBaseLamports ?? "")}
                id="cfg-jp-base"
                style={{ marginLeft: 8, padding: 6, background: "#0e1016", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
              />
            </label>
            <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
              Jackpot contribution / play{" "}
              <input
                defaultValue={String(config.jackpotContributionLamports ?? "")}
                id="cfg-jp-contrib"
                style={{ marginLeft: 8, padding: 6, background: "#0e1016", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
              />
            </label>
            <p style={{ fontSize: 13, color: "#9BA1AE" }}>
              Live jackpot: {jackpot ? String(jackpot.balanceLamports) : "—"} lamports · Machine:{" "}
              {config.machineEnabled ? "ENABLED" : "DISABLED"}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() =>
                  post({
                    action: "update_config",
                    config: {
                      priceLamports: Number((document.getElementById("cfg-price") as HTMLInputElement).value),
                      clawPrice: Number((document.getElementById("cfg-claw") as HTMLInputElement).value),
                      jackpotBaseLamports: Number((document.getElementById("cfg-jp-base") as HTMLInputElement).value),
                      jackpotContributionLamports: Number(
                        (document.getElementById("cfg-jp-contrib") as HTMLInputElement).value
                      ),
                    },
                  })
                }
                style={{ padding: "10px 16px", background: "#FF3E5C", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer" }}
              >
                Save config
              </button>
              <button
                type="button"
                onClick={() => post({ action: "set_machine", enabled: !config.machineEnabled })}
                style={{ padding: "10px 16px", background: "#1a3040", border: "1px solid #22D3FF", borderRadius: 8, color: "#22D3FF", cursor: "pointer" }}
              >
                {config.machineEnabled ? "Disable machine" : "Enable machine"}
              </button>
            </div>
          </div>
        )}

        {tab === "prizes" && (
          <div style={panel} data-admin="prizes">
            <h3>Rewards catalog</h3>
            <p style={{ fontSize: 12, color: "#5c6478" }}>
              Kinds: sol · claw · nft · mystery · jackpot
            </p>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "#5c6478", textAlign: "left" }}>
                  <th style={{ padding: 6 }}>Code</th>
                  <th style={{ padding: 6 }}>Kind</th>
                  <th style={{ padding: 6 }}>Title</th>
                  <th style={{ padding: 6 }}>Weight</th>
                  <th style={{ padding: 6 }}>Value</th>
                  <th style={{ padding: 6 }}>Active</th>
                  <th style={{ padding: 6 }} />
                </tr>
              </thead>
              <tbody>
                {prizes.map((p) => (
                  <tr key={p.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: 6 }}>{p.code}</td>
                    <td style={{ padding: 6 }}>{p.kind}</td>
                    <td style={{ padding: 6 }}>{p.title}</td>
                    <td style={{ padding: 6 }}>
                      <input
                        type="number"
                        defaultValue={p.weight}
                        id={`w-${p.id}`}
                        style={{ width: 56, background: "#0e1016", color: "#fff", border: "1px solid #333", borderRadius: 4 }}
                      />
                    </td>
                    <td style={{ padding: 6 }}>{p.valueLamports}</td>
                    <td style={{ padding: 6 }}>{p.active ? "yes" : "no"}</td>
                    <td style={{ padding: 6 }}>
                      <button
                        type="button"
                        onClick={() =>
                          post({
                            action: "upsert_prize",
                            prize: {
                              ...p,
                              weight: Number((document.getElementById(`w-${p.id}`) as HTMLInputElement).value),
                            },
                          })
                        }
                        style={{ marginRight: 6, cursor: "pointer" }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => post({ action: "remove_prize", id: p.id })}
                        style={{ cursor: "pointer", color: "#FF6B7A" }}
                      >
                        Del
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4 style={{ marginTop: 20 }}>Add reward</h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <input id="new-code" placeholder="code" style={{ padding: 6, background: "#0e1016", color: "#fff", border: "1px solid #333" }} />
              <select id="new-kind" defaultValue="sol" style={{ padding: 6, background: "#0e1016", color: "#fff", border: "1px solid #333" }}>
                <option value="sol">sol</option>
                <option value="claw">claw</option>
                <option value="nft">nft</option>
                <option value="mystery">mystery</option>
                <option value="jackpot">jackpot</option>
              </select>
              <input id="new-title" placeholder="title" style={{ padding: 6, background: "#0e1016", color: "#fff", border: "1px solid #333" }} />
              <input id="new-weight" type="number" placeholder="weight" defaultValue={10} style={{ width: 70, padding: 6, background: "#0e1016", color: "#fff", border: "1px solid #333" }} />
              <input id="new-value" type="number" placeholder="valueLamports" defaultValue={50000000} style={{ width: 120, padding: 6, background: "#0e1016", color: "#fff", border: "1px solid #333" }} />
              <button
                type="button"
                onClick={() =>
                  post({
                    action: "upsert_prize",
                    prize: {
                      code: (document.getElementById("new-code") as HTMLInputElement).value,
                      kind: (document.getElementById("new-kind") as HTMLSelectElement).value,
                      title: (document.getElementById("new-title") as HTMLInputElement).value,
                      weight: Number((document.getElementById("new-weight") as HTMLInputElement).value),
                      valueLamports: Number((document.getElementById("new-value") as HTMLInputElement).value),
                      clawAmount: 0,
                      active: true,
                      maxMultiplierCap: 2.5,
                    },
                  })
                }
                style={{ padding: "8px 14px", background: "#FF3E5C", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer" }}
              >
                Add
              </button>
            </div>
          </div>
        )}

        {tab === "players" && (
          <div style={panel} data-admin="players">
            <h3>Player statistics</h3>
            <pre style={{ fontSize: 11, overflow: "auto", maxHeight: 480 }}>
              {JSON.stringify(players, null, 2)}
            </pre>
          </div>
        )}

        {tab === "txs" && (
          <div style={panel} data-admin="transactions">
            <h3>Transactions</h3>
            <pre style={{ fontSize: 11, overflow: "auto", maxHeight: 480 }}>
              {JSON.stringify(txs, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}
