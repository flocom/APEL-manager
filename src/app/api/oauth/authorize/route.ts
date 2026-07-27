import {
  authorizeOAuthGet,
  authorizeOAuthPost,
} from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return authorizeOAuthGet(request);
}

export async function POST(request: Request) {
  return authorizeOAuthPost(request);
}
