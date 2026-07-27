import {
  oauthMetadataOptions,
  oauthProtectedResourceMetadata,
} from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return oauthProtectedResourceMetadata(request);
}

export function OPTIONS() {
  return oauthMetadataOptions();
}
