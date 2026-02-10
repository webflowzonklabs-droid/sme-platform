import baseConfig from "@sme/tailwind-config/tailwind.config";
import type { Config } from "tailwindcss";

const config: Config = {
  ...baseConfig,
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
