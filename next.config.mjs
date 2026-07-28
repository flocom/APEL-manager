/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Le lint tourne dans la CI (.github/workflows/ci.yml), avant la fusion :
    // une remarque de style ne doit pas faire échouer la construction de
    // l'image, donc un déploiement.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Tree-shaking ciblé des gros barrels (icônes, dates) → bundles plus légers.
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
};

export default nextConfig;
