import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    AMAP_KEY: process.env.AMAP_KEY,
    AMAP_SECURITY_CODE: process.env.AMAP_SECURITY_CODE,
  },
};

export default nextConfig;
