import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Turbopack config for Next.js 16
  turbopack: {},
};

initOpenNextCloudflareForDev();

export default nextConfig;
