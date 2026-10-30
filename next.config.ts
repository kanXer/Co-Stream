import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['192.168.29.41', 'localhost'],
};

export default nextConfig;
