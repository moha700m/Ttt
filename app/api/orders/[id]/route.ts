import { NextResponse } from "next/server";
import { canAccessOrder, publicOrder } from "@/lib/api";
import { getOrder } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
  const token = new URL(request.url).searchParams.get("token");
  if (!canAccessOrder(order, token)) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  return NextResponse.json({ order: publicOrder(order) });
}
