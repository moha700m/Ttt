import "@fontsource/noto-sans-arabic/400.css";
import "@fontsource/noto-sans-arabic/600.css";
import "@fontsource/noto-sans/400.css";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "ترجمة | ترجمة مستندات تحفظ تنسيقك", description: "ارفع مستندك واستلمه مترجمًا بنفس تنسيقه مع خيار الاعتماد." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
