import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { listOrders } from "@/lib/store";
import { publicOrder } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const orders = await listOrders();
    return NextResponse.json({ orders: orders.map(publicOrder) });
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
}
