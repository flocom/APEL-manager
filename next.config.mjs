/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Lint is run separately; do not block production builds on lint warnings.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
