import PreviewGuard from "@/components/PreviewGuard";
import { getOrder } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token = "" } = await searchParams;
  const order = await getOrder(id);
  const previewUrl = `/api/orders/${id}/download?kind=preview&token=${encodeURIComponent(token)}`;
  const isDocxPreview = order?.files.find((file) => file.version === "translated_preview")?.mimeType === "application/pdf" && order.files.find((file) => file.version === "original")?.filename.toLowerCase().endsWith(".docx");
  return <PreviewGuard previewUrl={previewUrl} orderNumber={order?.orderNumber || id} previewPages={isDocxPreview ? 2 : undefined} />;
}
