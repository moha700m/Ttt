import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeDocument } from "@/lib/document-engine";
import { publicOrder } from "@/lib/api";
import { quoteOrder } from "@/lib/pricing";
import { createCapabilityToken, hashToken, safeFilename } from "@/lib/security";
import { addAudit, createOrder, savePrivateFile } from "@/lib/store";
import type { DocumentType, ServiceKind } from "@/lib/types";

export const runtime = "nodejs";

const requestSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  customerEmail: z.string().email().max(180),
  sourceLanguage: z.enum(["ar", "en"]),
  targetLanguage: z.enum(["ar", "en"]),
  service: z.enum(["translation", "certified"]),
  documentType: z.enum(["general", "medical", "legal", "academic"]),
  urgent: z.enum(["true", "false"]).default("false"),
  protectVisualElements: z.enum(["true", "false"]).optional(),
  protectVisualElementsConfigured: z.enum(["true"]).optional()
});

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "يجب رفع ملف" }, { status: 400 });
    if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "الحد الأقصى للملف 25MB" }, { status: 413 });
    const input = requestSchema.parse({
      customerName: form.get("customerName"), customerEmail: form.get("customerEmail"), sourceLanguage: form.get("sourceLanguage"), targetLanguage: form.get("targetLanguage"), service: form.get("service"), documentType: form.get("documentType"), urgent: form.get("urgent") || "false", protectVisualElements: form.get("protectVisualElements") || undefined, protectVisualElementsConfigured: form.get("protectVisualElementsConfigured") || undefined
    });
    if (input.sourceLanguage === input.targetLanguage) return NextResponse.json({ error: "اختر لغتين مختلفتين" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const analysis = await analyzeDocument(bytes, file.name);
    const quote = quoteOrder({ pages: analysis.pages, documentType: input.documentType as DocumentType, service: input.service as ServiceKind, urgent: input.urgent === "true" });
    const id = crypto.randomUUID();
    const customerToken = createCapabilityToken();
    const stored = await savePrivateFile(id, "original", safeFilename(file.name), bytes);
    const now = new Date().toISOString();
    const order = await createOrder({
      id, orderNumber: `TR-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}`, customerName: input.customerName, customerEmail: input.customerEmail,
      sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage, service: input.service, documentType: input.documentType,
      urgent: input.urgent === "true", protectVisualElements: input.protectVisualElements === undefined ? input.protectVisualElementsConfigured !== "true" : input.protectVisualElements === "true", pages: quote.pages, amount: quote.amount, translationAmount: quote.translationAmount, certificationAmount: quote.certificationAmount, vatAmount: quote.vatAmount,
      status: "quote_ready", paymentStatus: "unpaid", files: [{ version: "original", storageKey: stored.storageKey, filename: file.name, mimeType: file.type || "application/octet-stream", size: stored.size, sha256: stored.sha256, createdAt: now }], createdAt: now, updatedAt: now, customerTokenHash: hashToken(customerToken)
    });
    await addAudit("order_created", "customer", id, { filename: file.name, pages: quote.pages });
    return NextResponse.json({ order: publicOrder(order), customerToken });
  } catch (error) {
    console.error("order_create_failed", error);
    const message = error instanceof z.ZodError ? "تحقق من بيانات الطلب" : error instanceof Error && /SUPABASE_ORDER|SUPABASE_STORAGE|ENOENT|EACCES|EROFS/.test(error.message) ? "تعذر حفظ الملف حاليًا. أعد المحاولة بعد لحظات." : "تعذر إنشاء الطلب";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
