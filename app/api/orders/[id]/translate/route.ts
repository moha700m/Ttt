import { NextResponse } from "next/server";
import { canAccessOrder, jsonError, publicOrder } from "@/lib/api";
import { addPdfWatermark, buildValidationReport, translateDocument } from "@/lib/document-engine";
import { addAudit, getOrder, readPrivateFile, savePrivateFile, updateOrder } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const order = await getOrder(id);
  const token = new URL(request.url).searchParams.get("token");
  if (!order) return jsonError("الطلب غير موجود", 404);
  if (!canAccessOrder(order, token)) return jsonError("غير مصرح", 403);
  const original = order.files.find((file) => file.version === "original");
  if (!original) return jsonError("الملف الأصلي غير موجود", 409);
  try {
    await updateOrder(id, (current) => ({ ...current, status: "translating" }));
    const input = await readPrivateFile(id, original.storageKey);
    const translated = await translateDocument(input, original.filename, order.sourceLanguage, order.targetLanguage);
    const working = await savePrivateFile(id, "translated_working", original.filename, translated.bytes);
    const previewBytes = original.filename.toLowerCase().endsWith(".pdf") ? await addPdfWatermark(translated.bytes) : translated.bytes;
    const preview = await savePrivateFile(id, "translated_preview", original.filename, previewBytes);
    const validation = buildValidationReport(translated.changedBlocks, order.pages);
    const updated = await updateOrder(id, (current) => ({ ...current, status: "preview_ready", validation, files: [...current.files, { version: "translated_working", storageKey: working.storageKey, filename: original.filename, mimeType: original.mimeType, size: working.size, sha256: working.sha256, createdAt: new Date().toISOString() }, { version: "translated_preview", storageKey: preview.storageKey, filename: original.filename, mimeType: original.mimeType, size: preview.size, sha256: preview.sha256, createdAt: new Date().toISOString() }] }));
    await addAudit("preview_generated", "customer", id, { changedBlocks: translated.changedBlocks });
    return NextResponse.json({ order: publicOrder(updated) });
  } catch (error) {
    await updateOrder(id, (current) => ({ ...current, status: "failed", failureReason: error instanceof Error ? error.message : "translation_failed" }));
    return jsonError("تعذر تجهيز المعاينة", 500);
  }
}
