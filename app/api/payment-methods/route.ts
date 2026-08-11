import { NextResponse } from "next/server";
import { getPaymentDetails, listPaymentMethods } from "@/lib/payments";
import type { PaymentMethod } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const method = new URL(request.url).searchParams.get("method") as PaymentMethod | null;
  if (!method) return NextResponse.json({ methods: listPaymentMethods() });
  return NextResponse.json({ method: getPaymentDetails(method) });
}
