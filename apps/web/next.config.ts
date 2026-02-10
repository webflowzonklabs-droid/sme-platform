import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sme/core", "@sme/shared", "@sme/ui"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
