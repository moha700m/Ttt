"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = await fetch("/api/orders", { method:"POST", body:new FormData(event.currentTarget) });
      const body = await result.json() as { order?: { id:string }; customerToken?:string; error?:string };
      if (!result.ok || !body.order || !body.customerToken) throw new Error(body.error || "تعذر إنشاء الطلب");
      router.push(`/order/${body.order.id}?token=${encodeURIComponent(body.customerToken)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إنشاء الطلب"); setBusy(false); }
  }
  return <form onSubmit={submit} className="upload-shell"><div className="panel"><h2>بيانات الطلب</h2><p className="panel-subtitle">لا تحتاج إلى إنشاء حساب. سيُحفظ رابط طلبك مع رمز وصول خاص.</p><div className="form-grid"><div className="field"><label htmlFor="customerName">الاسم</label><input id="customerName" name="customerName" required placeholder="محمد الزهراني" /></div><div className="field"><label htmlFor="customerEmail">البريد الإلكتروني</label><input id="customerEmail" name="customerEmail" type="email" required placeholder="name@example.com" /></div><div className="field"><label htmlFor="sourceLanguage">لغة المستند</label><select id="sourceLanguage" name="sourceLanguage" defaultValue="en"><option value="en">English</option><option value="ar">العربية</option></select></div><div className="field"><label htmlFor="targetLanguage">الترجمة إلى</label><select id="targetLanguage" name="targetLanguage" defaultValue="ar"><option value="ar">العربية</option><option value="en">English</option></select></div><div className="field"><label htmlFor="documentType">نوع المستند</label><select id="documentType" name="documentType" defaultValue="general"><option value="general">عام</option><option value="medical">طبي</option><option value="legal">قانوني</option><option value="academic">أكاديمي</option></select></div><div className="field"><label htmlFor="service">الخدمة</label><select id="service" name="service" defaultValue="translation"><option value="translation">ترجمة عادية</option><option value="certified">ترجمة معتمدة</option></select></div><label className="check full"><input type="checkbox" name="urgent" value="true" /><span>طلب مستعجل (يُطبّق معامل السعر من إعدادات الإدارة)</span></label></div></div><div className="panel"><h2>ملف المستند</h2><p className="panel-subtitle">لن نغير الملف الأصلي. يُستخدم كمرجع ثابت طوال مراحل الطلب.</p><div className="file-box"><strong>اسحب الملف هنا أو اختره</strong><p className="panel-subtitle" style={{ margin:"7px 0 0" }}>PDF · DOCX · JPG · PNG · حتى 25MB</p><input name="file" type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.webp" required /></div>{error && <div className="error" style={{marginTop:14}}>{error}</div>}<div className="notice" style={{marginTop:18}}>بعد الرفع يحلل النظام عدد الصفحات ويعرض لك السعر. لا يتم طلب الدفع قبل مشاهدة المعاينة.</div><button disabled={busy} className="button" style={{width:"100%", marginTop:18}}>{busy ? "جارٍ تحليل المستند..." : "تحليل المستند وإظهار السعر"}</button></div></form>;
}
