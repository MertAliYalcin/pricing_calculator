import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lib/icons.ts reads these via fs.readFileSync with a computed path, which the serverless
  // file tracer can't follow statically — without this they're missing in the deployed bundle.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/simple-icons/data/simple-icons.json",
      "./node_modules/simple-icons/icons/*.svg",
    ],
  },
};

export default nextConfig;
