import { NextResponse } from "next/server";
import { canAccessOrder, jsonError } from "@/lib/api";
import { getOrder, readPrivateFile } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const order = await getOrder(id);
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const kind = url.searchParams.get("kind") === "preview" ? "translated_preview" : order?.service === "certified" ? "certified_final" : "translated_final";
  if (!order) return jsonError("الطلب غير موجود", 404);
  if (!canAccessOrder(order, token)) return jsonError("غير مصرح", 403);
  const canDownloadFinal = order.paymentStatus === "verified" && (order.service === "translation" || order.status === "certified" || order.status === "completed");
  if (kind !== "translated_preview" && !canDownloadFinal) return jsonError("الملف النهائي يُفتح بعد تأكيد الدفع والاعتماد", 402);
  const file = order.files.find((entry) => entry.version === kind);
  if (!file) return jsonError("الملف غير جاهز", 404);
  const bytes = await readPrivateFile(id, file.storageKey);
  const isPreview = kind === "translated_preview";
  const previewExtension = file.filename.split(".").pop() || "pdf";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": file.mimeType,
      "content-disposition": `${isPreview ? "inline" : "attachment"}; filename="${encodeURIComponent(isPreview ? `preview-${order.orderNumber}.${previewExtension}` : file.filename)}"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "referrer-policy": "no-referrer",
      ...(isPreview ? { "content-security-policy": "frame-ancestors 'self'" } : {})
    }
  });
}
