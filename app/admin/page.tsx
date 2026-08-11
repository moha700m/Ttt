import Link from "next/link";
import AdminClient from "@/components/AdminClient";

export default function AdminPage() { return <main><div className="container"><nav className="nav"><Link href="/" className="brand"><span className="brand-mark">ت</span><span>ترجمة</span></Link><Link href="/" className="nav-link">الواجهة العامة</Link></nav><div className="page-head"><span className="eyebrow">مساحة العمل الداخلية</span><h1>لوحة الإدارة</h1><p>تحقق من الدفعات، راجع المستندات، وأصدر الاعتماد من الخادم.</p></div><AdminClient /></div></main>; }
