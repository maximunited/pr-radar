import type { NextConfig } from "next";
import path from "path";

const config: NextConfig = {
  transpilePackages: ["@pr-radar/core"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
  webpack(webpackConfig) {
    // webpack doesn't resolve .js → .ts automatically (TypeScript ESM convention)
    webpackConfig.resolve.extensionAlias = {
      ".js": [".ts", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return webpackConfig;
  },
};

export default config;
