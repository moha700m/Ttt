import PreviewGuard from "@/components/PreviewGuard";
import { getOrder } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token = "" } = await searchParams;
  const order = await getOrder(id);
  const previewUrl = `/api/orders/${id}/download?kind=preview&token=${encodeURIComponent(token)}`;
  return <PreviewGuard previewUrl={previewUrl} orderNumber={order?.orderNumber || id} />;
}
