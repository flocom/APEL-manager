import { exchangeOAuthToken } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return exchangeOAuthToken(request);
}
