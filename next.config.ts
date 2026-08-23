import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext emits a self-contained Node.js server for the Ubuntu web image.
  output: "standalone",
};

export default nextConfig;
