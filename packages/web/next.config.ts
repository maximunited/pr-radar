import type { NextConfig } from "next";
import path from "path";

const config: NextConfig = {
  transpilePackages: ["@pr-radar/core"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default config;
