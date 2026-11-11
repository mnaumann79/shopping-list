import type { NextConfig } from "next";
import { createRequire } from "module";

const nextConfig: NextConfig = {};

export default process.env.ANALYZE === "true"
  ? createRequire(import.meta.url)("@next/bundle-analyzer")({ enabled: true })(nextConfig)
  : nextConfig;
