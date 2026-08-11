import Link from "next/link";
import OrderClient from "@/components/OrderClient";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token = "" } = await searchParams;
  return <main><div className="container"><nav className="nav"><Link href="/" className="brand"><span className="brand-mark">ت</span><span>ترجمة</span></Link><Link href="/" className="nav-link">طلب جديد</Link></nav><div className="page-head"><span className="eyebrow">مساحة طلبك الخاصة</span><h1>تفاصيل الطلب</h1><p>تابع مراحل الترجمة والدفع والاعتماد من مكان واحد.</p></div><OrderClient id={id} token={token} /></div></main>;
}
