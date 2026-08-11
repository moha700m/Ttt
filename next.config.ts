import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "25mb" }
  },
  serverExternalPackages: ["pdfjs-dist", "adm-zip", "sharp", "@napi-rs/canvas"]
};

export default nextConfig;
