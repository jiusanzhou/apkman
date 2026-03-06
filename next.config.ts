import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable webpack worker support for Web Worker parsing
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
};

export default nextConfig;
