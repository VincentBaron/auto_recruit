import type { NextConfig } from "next";

// Throwaway prototype: no special config. The dummy backend lives in-process.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The simulator pill owns the bottom-left corner. Compile and runtime errors still show in dev.
  devIndicators: false,
  // `next dev` must not write AGENTS.md / CLAUDE.md files into the app.
  agentRules: false,
};

export default nextConfig;
