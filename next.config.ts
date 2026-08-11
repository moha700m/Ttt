import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "25mb" }
  },
  serverExternalPackages: ["pdfjs-dist", "adm-zip", "sharp", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"]
  }
};

export default nextConfig;
