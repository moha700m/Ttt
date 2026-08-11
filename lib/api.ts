import type { Order } from "./types";
import { hashToken } from "./security";

export function publicOrder(order: Order) {
  return {
    ...order,
    customerTokenHash: undefined,
    files: order.files.map((file) => {
      const safeFile = { ...file } as Partial<typeof file>;
      delete safeFile.storageKey;
      return safeFile;
    })
  };
}

export function canAccessOrder(order: Order, token: string | null) {
  if (!token) return false;
  return order.customerTokenHash === hashToken(token);
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
