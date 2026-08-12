import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: { bodySizeLimit: "25mb" }
  },
  serverExternalPackages: ["pdfjs-dist", "adm-zip", "sharp", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/*": [
      "./assets/fonts/**/*",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/cmaps/**/*"
    ]
  }
};

export default nextConfig;
