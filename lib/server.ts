/**
 * lib/server.ts — server-only. Never import from "use client" modules.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CONFIG } from "./config";

export const connection = new Connection(CONFIG.rpcUrl, {
  commitment: CONFIG.commitment,
  confirmTransactionInitialTimeout: 60_000,
});

let _db: SupabaseClient | null = null;

export function getDb(): SupabaseClient | null {
  if (!CONFIG.hasSupabase) return null;
  if (!_db) {
    _db = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _db;
}

/** Lazy proxy — only used when Supabase env is present. */
export const db = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getDb();
    if (!client) {
      throw new Error("Supabase not configured");
    }
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function treasuryPubkey(): PublicKey {
  if (!CONFIG.treasury) {
    throw new Error("TREASURY_ADDRESS not configured");
  }
  return new PublicKey(CONFIG.treasury);
}
