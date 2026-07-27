import { registerOAuthClient } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return registerOAuthClient(request);
}
