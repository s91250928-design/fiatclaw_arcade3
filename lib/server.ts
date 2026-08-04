/**
 * lib/server.ts — ТОЛЬКО серверный код.
 * Никогда не импортировать в клиентских компонентах ("use client").
 * Содержит service-role Supabase и RPC-соединение.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "./config";

export const connection = new Connection(CONFIG.rpcUrl, {
  commitment: CONFIG.commitment,
  confirmTransactionInitialTimeout: 60_000,
});

// Service-role обходит RLS. Ключ живёт только в server env (Vercel / .env.local).
// В NEXT_PUBLIC_* его быть не должно.
export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

export function treasuryPubkey(): PublicKey {
  return new PublicKey(CONFIG.treasury);
}
