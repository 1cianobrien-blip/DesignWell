import type { NextConfig } from "next";

const config: NextConfig = {
  // Pipeline code is plain Node and never bundled into pages except shared lib/ helpers.
  serverExternalPackages: ["postgres"],
};
export default config;
