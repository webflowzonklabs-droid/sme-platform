import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sme/shared", "@sme/ui"],
  serverExternalPackages: ["postgres", "@sme/core"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
