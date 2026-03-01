import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "jnavvjoddalfxttynsyd.supabase.co" },
      { protocol: "https", hostname: "placehold.co" },
    ],
  },
};

export default nextConfig;
