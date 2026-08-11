import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serverClient: SupabaseClient | null = null;

export function getSupabaseServer() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return null;
  serverClient ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return serverClient;
}

export async function uploadPrivateToSupabase(key: string, data: Buffer, contentType: string) {
  const client = getSupabaseServer();
  if (!client) return null;
  const bucket = process.env.SUPABASE_PRIVATE_BUCKET || "tarjamah-private";
  const result = await client.storage.from(bucket).upload(key, data, { contentType, upsert: false });
  if (result.error) throw result.error;
  return { bucket, key };
}
