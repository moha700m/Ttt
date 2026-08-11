import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { certifyPdf } from "@/lib/document-engine";
import { publicOrder } from "@/lib/api";
import { addAudit, getOrder, readPrivateFile, savePrivateFile, updateOrder } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(request);
    const { id } = await context.params;
    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    if (order.service !== "certified" || order.paymentStatus !== "verified") return NextResponse.json({ error: "الطلب غير جاهز للاعتماد" }, { status: 409 });
    const working = order.files.find((file) => file.version === "translated_working");
    if (!working) return NextResponse.json({ error: "الملف المترجم غير موجود" }, { status: 409 });
    const input = await readPrivateFile(id, working.storageKey);
    const certifiedBytes = working.filename.toLowerCase().endsWith(".pdf") ? await certifyPdf(input) : input;
    const stored = await savePrivateFile(id, "certified_final", working.filename, certifiedBytes);
    const updated = await updateOrder(id, (current) => ({ ...current, status: "certified", files: [...current.files, { version: "certified_final", storageKey: stored.storageKey, filename: working.filename, mimeType: working.mimeType, size: stored.size, sha256: stored.sha256, createdAt: new Date().toISOString() }] }));
    await addAudit("certification_issued", "admin", id, { certifiedDocumentHash: stored.sha256 });
    return NextResponse.json({ order: publicOrder(updated) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "ADMIN_UNAUTHORIZED" ? "غير مصرح" : "تعذر إصدار الاعتماد" }, { status: 401 });
  }
}
