/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Lint is run separately; do not block production builds on lint warnings.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Tree-shaking ciblé des gros barrels (icônes, dates) → bundles plus légers.
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
};

export default nextConfig;
