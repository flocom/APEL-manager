import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

/**
 * `eslint-config-next` n'est pas encore publié en configuration à plat :
 * FlatCompat le traduit. Les règles retenues sont celles qui attrapent des
 * erreurs réelles — hooks React, imports Next, accessibilité — plutôt que des
 * questions de style, déjà tranchées par la revue.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "drizzle/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Le préfixe « _ » marque un paramètre volontairement inutilisé, présent
      // pour respecter une signature imposée (handlers de route Next).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default config;
