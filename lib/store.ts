import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Order } from "./types";
import { downloadPrivateFromSupabase, getSupabaseServer, uploadPrivateToSupabase } from "./supabase";
import { safeFilename, sha256 } from "./security";

interface AuditEntry {
  id: string;
  action: string;
  orderId?: string;
  actor: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface RuntimeStore {
  orders: Order[];
  audit: AuditEntry[];
}

const remoteTable = "tarjamah_order_runtime_snapshots";
const localRoot = process.env.RUNTIME_STORAGE_ROOT || (process.env.VERCEL === "1" ? path.join(os.tmpdir(), "tarjamah-runtime") : path.join(process.cwd(), ".runtime", "storage"));
const privateRoot = path.join(localRoot, "private");
const stateFile = path.join(localRoot, "runtime.json");

function remoteStore() {
  return getSupabaseServer();
}

async function ensureLocalStorage() {
  await mkdir(privateRoot, { recursive: true });
}

async function readLocalStore(): Promise<RuntimeStore> {
  await ensureLocalStorage();
  try {
    return JSON.parse(await readFile(stateFile, "utf8")) as RuntimeStore;
  } catch {
    return { orders: [], audit: [] };
  }
}

async function writeLocalStore(store: RuntimeStore) {
  await ensureLocalStorage();
  const temp = `${stateFile}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(store, null, 2), "utf8");
  await rename(temp, stateFile);
}

function readPayload(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("INVALID_ORDER_PAYLOAD");
  return value as Order;
}

async function readRemoteOrder(id: string) {
  const client = remoteStore();
  if (!client) return undefined;
  const result = await client.from(remoteTable).select("payload").eq("id", id).maybeSingle();
  if (result.error) throw new Error(`SUPABASE_ORDER_READ: ${result.error.message}`);
  return result.data ? readPayload(result.data.payload) : undefined;
}

export async function listOrders() {
  const client = remoteStore();
  if (client) {
    const result = await client.from(remoteTable).select("payload").order("updated_at", { ascending: false });
    if (result.error) throw new Error(`SUPABASE_ORDER_LIST: ${result.error.message}`);
    return (result.data || []).map((row) => readPayload(row.payload));
  }
  return (await readLocalStore()).orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getOrder(id: string) {
  const remote = await readRemoteOrder(id);
  if (remote) return remote;
  if (remoteStore()) return undefined;
  return (await readLocalStore()).orders.find((order) => order.id === id);
}

export async function createOrder(order: Order) {
  const client = remoteStore();
  if (client) {
    const result = await client.from(remoteTable).insert({ id: order.id, order_number: order.orderNumber, customer_token_hash: order.customerTokenHash, payload: order, created_at: order.createdAt, updated_at: order.updatedAt });
    if (result.error) throw new Error(`SUPABASE_ORDER_CREATE: ${result.error.message}`);
    return order;
  }
  const store = await readLocalStore();
  store.orders.push(order);
  await writeLocalStore(store);
  return order;
}

export async function updateOrder(id: string, updater: (order: Order) => Order) {
  const current = await getOrder(id);
  if (!current) throw new Error("ORDER_NOT_FOUND");
  const updated = updater({ ...current, updatedAt: new Date().toISOString() });
  const client = remoteStore();
  if (client) {
    const result = await client.from(remoteTable).update({ order_number: updated.orderNumber, customer_token_hash: updated.customerTokenHash, payload: updated, updated_at: updated.updatedAt }).eq("id", id);
    if (result.error) throw new Error(`SUPABASE_ORDER_UPDATE: ${result.error.message}`);
    return updated;
  }
  const store = await readLocalStore();
  const index = store.orders.findIndex((order) => order.id === id);
  if (index < 0) throw new Error("ORDER_NOT_FOUND");
  store.orders[index] = updated;
  await writeLocalStore(store);
  return updated;
}

export async function addAudit(action: string, actor: string, orderId?: string, metadata?: Record<string, unknown>) {
  const client = remoteStore();
  const entry = { action, actor, orderId, metadata: metadata || {}, createdAt: new Date().toISOString() };
  if (client) {
    const modern = await client.from("audit_logs").insert({ action, actor_type: actor, order_id: orderId || null, metadata: metadata || {}, created_at: entry.createdAt });
    if (!modern.error) return;
    const legacy = await client.from("audit_logs").insert({ action, entity_type: "order", entity_id: orderId || null, metadata: metadata || {}, created_at: entry.createdAt });
    if (legacy.error) console.error("audit_log_write_failed", legacy.error.message);
    return;
  }
  const store = await readLocalStore();
  store.audit.push({ id: crypto.randomUUID(), ...entry });
  await writeLocalStore(store);
}

function contentTypeFor(filename: string) {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

export async function savePrivateFile(orderId: string, version: string, filename: string, bytes: Buffer, contentType = contentTypeFor(filename)) {
  const safeName = safeFilename(filename);
  const storageKey = `${orderId}/${version}/${crypto.randomUUID()}-${safeName}`;
  const client = remoteStore();
  if (client) {
    await uploadPrivateToSupabase(storageKey, bytes, contentType);
    return { storageKey, sha256: sha256(bytes), size: bytes.byteLength };
  }
  await ensureLocalStorage();
  const directory = path.join(privateRoot, orderId);
  await mkdir(directory, { recursive: true });
  const localKey = `${version}-${crypto.randomUUID()}-${safeName}`;
  const absolutePath = path.join(directory, localKey);
  await writeFile(absolutePath, bytes);
  return { storageKey: localKey, absolutePath, sha256: sha256(bytes), size: bytes.byteLength };
}

export async function readPrivateFile(orderId: string, storageKey: string) {
  const client = remoteStore();
  if (client) {
    const bytes = await downloadPrivateFromSupabase(storageKey);
    if (!bytes) throw new Error("SUPABASE_STORAGE_NOT_CONFIGURED");
    return bytes;
  }
  const rootPath = path.resolve(path.join(privateRoot, orderId));
  const absolutePath = path.resolve(rootPath, storageKey);
  if (!absolutePath.startsWith(`${rootPath}${path.sep}`)) throw new Error("INVALID_STORAGE_KEY");
  return readFile(absolutePath);
}
