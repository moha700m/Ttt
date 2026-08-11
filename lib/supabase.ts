import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serverClient: SupabaseClient | null = null;

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

function supabaseSecretKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function getSupabaseServer() {
  const url = supabaseUrl();
  const secretKey = supabaseSecretKey();
  if (!url || !secretKey) return null;
  serverClient ??= createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return serverClient;
}

export function getPrivateBucket() {
  return process.env.SUPABASE_PRIVATE_BUCKET || "tarjamah-private";
}

export async function uploadPrivateToSupabase(key: string, data: Buffer, contentType: string) {
  const client = getSupabaseServer();
  if (!client) return null;
  const bucket = getPrivateBucket();
  const result = await client.storage.from(bucket).upload(key, data, { contentType, upsert: false });
  if (result.error) throw result.error;
  return { bucket, key };
}

export async function downloadPrivateFromSupabase(key: string) {
  const client = getSupabaseServer();
  if (!client) return null;
  const result = await client.storage.from(getPrivateBucket()).download(key);
  if (result.error) throw result.error;
  return Buffer.from(await result.data.arrayBuffer());
}
