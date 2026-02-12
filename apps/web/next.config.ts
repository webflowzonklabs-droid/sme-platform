import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sme/shared", "@sme/ui", "@sme/core"],
  serverExternalPackages: ["postgres"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
