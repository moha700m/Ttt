"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Order = { id: string; orderNumber: string; customerName: string; customerEmail: string; pages: number; service: string; amount: number; status: string; paymentStatus: string; createdAt: string };
const status: Record<string, string> = { quote_ready: "عرض جاهز", preview_ready: "معاينة", awaiting_payment_verification: "تحقق دفع", awaiting_certification: "اعتماد", certified: "معتمد", completed: "مكتمل", failed: "فشل" };

export default function AdminClient() {
  const [token, setToken] = useState("test-admin-token");
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/orders", { headers: { "x-admin-token": token }, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setOrders(body.orders);
  }, [token]);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  const metrics = useMemo(() => ({ all: orders.length, payment: orders.filter((item) => item.paymentStatus === "awaiting_payment_verification").length, cert: orders.filter((item) => item.status === "awaiting_certification").length, done: orders.filter((item) => ["completed", "certified"].includes(item.status)).length }), [orders]);
  async function action(id: string, kind: "verify-payment" | "certify") {
    setBusy(id + kind); setError("");
    try {
      const response = await fetch(`/api/admin/orders/${id}/${kind}`, { method: "POST", headers: { "x-admin-token": token } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تنفيذ الإجراء"); }
    finally { setBusy(""); }
  }
  return <div className="stack"><div className="panel"><div className="form-grid"><div className="field"><label>رمز الإدارة</label><input value={token} onChange={(event) => setToken(event.target.value)} type="password" /></div><div className="field" style={{ alignSelf: "end" }}><button className="button" onClick={() => load().catch((cause) => setError(cause.message))}>تحديث الطلبات</button></div></div>{error && <div className="error" style={{ marginTop: 14 }}>{error}</div>}</div><div className="admin-grid"><div className="metric"><small>إجمالي الطلبات</small><strong>{metrics.all}</strong></div><div className="metric"><small>دفعات تنتظر التحقق</small><strong>{metrics.payment}</strong></div><div className="metric"><small>تنتظر الاعتماد</small><strong>{metrics.cert}</strong></div><div className="metric"><small>مكتملة</small><strong>{metrics.done}</strong></div></div><div className="table-wrap">{orders.length === 0 ? <div className="empty">لا توجد طلبات بعد.</div> : <table className="table"><thead><tr><th>الطلب</th><th>العميل</th><th>الصفحات</th><th>الخدمة</th><th>المبلغ</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td>{order.orderNumber}</td><td>{order.customerName}</td><td>{order.pages}</td><td>{order.service === "certified" ? "معتمدة" : "عادية"}</td><td>{order.amount} ريال</td><td>{status[order.status] || order.status}</td><td>{order.paymentStatus === "awaiting_payment_verification" && <button className="button" style={{ padding: "8px 10px", fontSize: 12 }} disabled={!!busy} onClick={() => action(order.id, "verify-payment")}>اعتماد الدفع</button>}{order.status === "awaiting_certification" && <button className="button gold" style={{ padding: "8px 10px", fontSize: 12 }} disabled={!!busy} onClick={() => action(order.id, "certify")}>إصدار الاعتماد</button>}</td></tr>)}</tbody></table>}</div></div>;
}
