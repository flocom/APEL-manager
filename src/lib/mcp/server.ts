import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getAccountingSummary } from "@/lib/services/accounting";

import { registerAssociationTools } from "./register-association-tools";
import { registerCoreTools } from "./register-core-tools";
import { requireMcpAccess, type McpPrincipal } from "./types";

export function createApelMcpServer(principal: McpPrincipal) {
  const server = new McpServer({
    name: "apel-notre-dame-des-flots",
    title: "APEL Notre Dame des Flots",
    version: "1.0.0",
    description:
      "Pilotage sécurisé de l’APEL Notre Dame des Flots — RNA W853001441.",
  });

  registerCoreTools(server, principal);
  registerAssociationTools(server, principal);

  server.registerResource(
    "association-profile",
    "apel://association/profile",
    {
      title: "Identité de l’association",
      description:
        "Informations officielles de l’APEL Notre Dame des Flots.",
      mimeType: "application/json",
    },
    async (uri) => {
      requireMcpAccess(principal, "mcp:read");
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({
              name: "APEL Notre Dame des Flots",
              school: "École Notre Dame des Flots",
              rna: "W853001441",
            }),
          },
        ],
      };
    },
  );

  if (principal.role === "admin") {
    server.registerResource(
      "accounting-summary",
      "apel://accounting/summary",
      {
        title: "Synthèse comptable",
        description:
          "Recettes, dépenses, solde et état de complétude du journal.",
        mimeType: "application/json",
      },
      async (uri) => {
        requireMcpAccess(principal, "mcp:read", "admin");
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(await getAccountingSummary()),
            },
          ],
        };
      },
    );
  }

  server.registerPrompt(
    "prepare_general_assembly",
    {
      title: "Préparer une assemblée générale",
      description:
        "Cadre de préparation d’une AG et de rédaction de son procès-verbal.",
      argsSchema: {
        assemblyType: z.enum(["ordinaire", "extraordinaire"]).default("ordinaire"),
        date: z.string().describe("Date prévue de l’assemblée"),
        priorities: z.string().optional(),
      },
    },
    async ({ assemblyType, date, priorities }) => {
      requireMcpAccess(principal, "mcp:read", "manager");
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Prépare l’assemblée générale ${assemblyType} de l’APEL Notre Dame des Flots (RNA W853001441) prévue le ${date}.

1. Consulte les événements, tâches, adhérents et documents utiles avec les outils MCP disponibles.
2. Propose un ordre du jour réaliste.
3. Dresse la liste des pièces et décisions à préparer.
4. Après l’AG, crée un procès-verbal au statut brouillon dans le volet Documents.
${priorities ? `Priorités indiquées : ${priorities}` : ""}`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "review_association_finances",
    {
      title: "Revue financière de l’association",
      description:
        "Analyse le journal comptable sans déclencher aucun paiement.",
      argsSchema: {
        period: z.string().describe("Période à analyser"),
      },
    },
    async ({ period }) => {
      requireMcpAccess(principal, "mcp:read", "admin");
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Analyse la comptabilité de l’APEL Notre Dame des Flots pour ${period}. Utilise la synthèse et les écritures comptables, signale les brouillons et justificatifs manquants, puis propose les contrôles à effectuer. Ne crée ni ne modifie aucune écriture sans confirmation explicite.`,
            },
          },
        ],
      };
    },
  );

  return server;
}
