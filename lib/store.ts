import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Order } from "./types";
import { sha256 } from "./security";

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

const root = path.join(process.cwd(), "storage");
const privateRoot = path.join(root, "private");
const stateFile = path.join(root, "runtime.json");

async function ensureStorage() {
  await mkdir(privateRoot, { recursive: true });
}

async function readStore(): Promise<RuntimeStore> {
  await ensureStorage();
  try {
    return JSON.parse(await readFile(stateFile, "utf8")) as RuntimeStore;
  } catch {
    return { orders: [], audit: [] };
  }
}

async function writeStore(store: RuntimeStore) {
  await ensureStorage();
  const temp = `${stateFile}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(store, null, 2), "utf8");
  await rename(temp, stateFile);
}

export async function listOrders() {
  return (await readStore()).orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getOrder(id: string) {
  return (await readStore()).orders.find((order) => order.id === id);
}

export async function createOrder(order: Order) {
  const store = await readStore();
  store.orders.push(order);
  await writeStore(store);
  return order;
}

export async function updateOrder(id: string, updater: (order: Order) => Order) {
  const store = await readStore();
  const index = store.orders.findIndex((order) => order.id === id);
  if (index < 0) throw new Error("ORDER_NOT_FOUND");
  store.orders[index] = updater({ ...store.orders[index], updatedAt: new Date().toISOString() });
  await writeStore(store);
  return store.orders[index];
}

export async function addAudit(action: string, actor: string, orderId?: string, metadata?: Record<string, unknown>) {
  const store = await readStore();
  store.audit.push({ id: crypto.randomUUID(), action, actor, orderId, metadata, createdAt: new Date().toISOString() });
  await writeStore(store);
}

export async function savePrivateFile(orderId: string, version: string, filename: string, bytes: Buffer) {
  await ensureStorage();
  const directory = path.join(privateRoot, orderId);
  await mkdir(directory, { recursive: true });
  const storageKey = `${version}-${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const absolutePath = path.join(directory, storageKey);
  await writeFile(absolutePath, bytes);
  return { storageKey, absolutePath, sha256: sha256(bytes), size: bytes.byteLength };
}

export async function readPrivateFile(orderId: string, storageKey: string) {
  const rootPath = path.resolve(privateRoot, orderId);
  const absolutePath = path.resolve(rootPath, storageKey);
  if (!absolutePath.startsWith(`${rootPath}${path.sep}`)) throw new Error("INVALID_STORAGE_KEY");
  return readFile(absolutePath);
}
