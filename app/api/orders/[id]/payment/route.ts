import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessOrder, jsonError, publicOrder } from "@/lib/api";
import { addAudit, getOrder, savePrivateFile, updateOrder } from "@/lib/store";
import { getPaymentDetails } from "@/lib/payments";
import type { PaymentMethod } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const order = await getOrder(id);
  const form = await request.formData();
  const token = String(form.get("token") || "");
  if (!order) return jsonError("الطلب غير موجود", 404);
  if (!canAccessOrder(order, token)) return jsonError("غير مصرح", 403);
  if (!order.amount || !["preview_ready", "awaiting_payment", "payment_verified", "awaiting_certification"].includes(order.status)) return jsonError("الطلب غير جاهز للدفع", 409);
  const method = z.enum(["al_rajhi", "al_bilad", "arab_national", "binance"]).safeParse(form.get("method"));
  if (!method.success) return jsonError("طريقة الدفع غير صحيحة");
  const receipt = form.get("receipt");
  if (!(receipt instanceof File)) return jsonError("ارفع إيصال التحويل");
  if (receipt.size > 8 * 1024 * 1024) return jsonError("الإيصال أكبر من 8MB");
  getPaymentDetails(method.data as PaymentMethod);
  const stored = await savePrivateFile(id, "payment_receipt", receipt.name, Buffer.from(await receipt.arrayBuffer()));
  const updated = await updateOrder(id, (current) => ({ ...current, paymentMethod: method.data as PaymentMethod, paymentStatus: "awaiting_payment_verification", status: "awaiting_payment_verification", files: [...current.files, { version: "payment_receipt", storageKey: stored.storageKey, filename: receipt.name, mimeType: receipt.type || "application/octet-stream", size: stored.size, sha256: stored.sha256, createdAt: new Date().toISOString() }] }));
  await addAudit("payment_receipt_uploaded", "customer", id, { method: method.data });
  return NextResponse.json({ order: publicOrder(updated), message: "تم استلام إثبات التحويل وسيتم التحقق منه." });
}
