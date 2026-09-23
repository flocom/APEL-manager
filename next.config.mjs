/**
 * En-têtes de sécurité communs à toutes les réponses, pages, API et fichiers
 * statiques. Ils ne dépendent de rien que la construction ignore : l'image
 * Docker est construite une fois, puis configurée au démarrage.
 *
 * La politique de sécurité du contenu (CSP), elle, n'est pas ici : elle porte
 * un nonce tiré pour chaque page, que seul le middleware peut poser
 * (src/middleware.ts).
 */
const securityHeaders = [
  // HTTPS obligatoire pour un an, une fois le site vu en HTTPS. Un navigateur
  // ignore cet en-tête reçu en HTTP : une instance locale n'en est pas gênée.
  // Pas de `includeSubDomains` : le domaine de l'école ou de l'association
  // peut porter d'autres sites, qui ne sont pas les nôtres.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  // Pas d'affichage dans le cadre d'un autre site (détournement de clic). Le
  // même site reste permis, comme dans docker/Caddyfile.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Les adresses internes (liens de réinitialisation, jetons de
  // désinscription) ne partent pas en référent vers d'autres sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Rien de tout cela ne sert ici : une faille ne pourra pas s'en servir.
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  // Pas de Cross-Origin-Opener-Policy : l'autorisation d'un connecteur MCP
  // s'ouvre dans une fenêtre que Claude surveille, et cette politique couperait
  // le lien entre les deux.
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // « X-Powered-By: Next.js » annonçait le cadriciel à qui cherche une
  // version vulnérable.
  poweredByHeader: false,
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
  async headers() {
    return [
      // Les pages et les fichiers statiques : tous les en-têtes.
      { source: "/", headers: securityHeaders },
      { source: "/:path((?!api/|\\.well-known/).*)", headers: securityHeaders },
      // Les API et les métadonnées OAuth : seulement ceux qui ne peuvent rien
      // contredire. Next donne le dernier mot à cette configuration sur les
      // en-têtes d'une route ; or certaines posent les leurs, plus stricts —
      // l'écran de consentement OAuth impose `Referrer-Policy: no-referrer`
      // et `X-Frame-Options: DENY`.
      ...["/api/:path*", "/.well-known/:path*"].map((source) => ({
        source,
        headers: securityHeaders.filter(({ key }) =>
          ["Strict-Transport-Security", "X-Content-Type-Options", "Permissions-Policy"].includes(key),
        ),
      })),
    ];
  },
};

export default nextConfig;
