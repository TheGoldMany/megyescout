import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // small Docker image; Vercel ignores this
  serverExternalPackages: ["pg"],
};

export default nextConfig;
