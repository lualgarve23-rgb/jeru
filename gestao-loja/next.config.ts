import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // uploads (template do convite, PPTX do certificado) — igual ao nginx (20m)
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
