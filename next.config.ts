import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["docx", "pdf-lib", "xlsx"],
  outputFileTracingRoot: __dirname,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
