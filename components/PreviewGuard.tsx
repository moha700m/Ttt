"use client";

import { useEffect, useMemo, useState } from "react";

const watermarkLabels = [
  "PREVIEW ONLY",
  "معاينة فقط",
  "غير صالح للتسليم",
  "PREVIEW ONLY",
  "معاينة فقط",
  "غير صالح للتسليم",
  "PREVIEW ONLY",
  "معاينة فقط",
  "غير صالح للتسليم",
  "PREVIEW ONLY",
  "معاينة فقط",
  "غير صالح للتسليم"
];

export default function PreviewGuard({ previewUrl, orderNumber }: { previewUrl: string; orderNumber: string }) {
  const [blocked, setBlocked] = useState(false);
  const labels = useMemo(() => watermarkLabels.map((label, index) => `${label} · ${orderNumber} · ${index + 1}`), [orderNumber]);

  useEffect(() => {
    const temporarilyBlock = () => {
      setBlocked(true);
      window.setTimeout(() => setBlocked(false), 1800);
    };
    const handleVisibility = () => setBlocked(document.visibilityState !== "visible");
    const handleFocus = () => setBlocked(false);
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const restrictedShortcut = (event.ctrlKey || event.metaKey) && ["p", "s", "u", "c"].includes(key);
      if (event.key === "PrintScreen" || restrictedShortcut) {
        event.preventDefault();
        temporarilyBlock();
      }
    };
    const prevent = (event: Event) => event.preventDefault();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", temporarilyBlock);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("copy", prevent);
    document.addEventListener("cut", prevent);
    document.addEventListener("dragstart", prevent);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", temporarilyBlock);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("copy", prevent);
      document.removeEventListener("cut", prevent);
      document.removeEventListener("dragstart", prevent);
    };
  }, []);

  return (
    <main className="preview-guard" onContextMenu={(event) => event.preventDefault()}>
      <header className="preview-toolbar">
        <div>
          <span className="eyebrow">{orderNumber}</span>
          <h1>معاينة الترجمة</h1>
        </div>
        <span className="preview-badge">محمية بعلامة مائية</span>
      </header>
      <p className="preview-warning">هذه معاينة كاملة للمراجعة فقط. لا تصلح للتسليم أو الاستخدام التجاري، وتظهر العلامة المائية على كامل الصفحات.</p>
      <section className="preview-stage" aria-label="معاينة المستند">
        <iframe
          className="preview-frame"
          title="معاينة المستند المترجم"
          src={previewUrl}
          referrerPolicy="no-referrer"
          onContextMenu={(event) => event.preventDefault()}
        />
        <div className="preview-watermark-layer" aria-hidden="true">
          {labels.map((label) => <span key={label}>{label}</span>)}
        </div>
        {blocked && <div className="preview-blocker">المعاينة مخفية مؤقتًا أثناء مغادرة الصفحة أو محاولة الطباعة/الالتقاط.</div>}
      </section>
      <p className="preview-footnote">بعد تأكيد الدفع والمراجعة، يُفتح الملف النهائي بدون علامة المعاينة حسب الخدمة المختارة.</p>
    </main>
  );
}
