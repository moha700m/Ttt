import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "25mb" }
  },
  serverExternalPackages: ["pdfjs-dist", "adm-zip"]
};

export default nextConfig;
