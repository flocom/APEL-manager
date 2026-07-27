import {
  oauthAuthorizationServerMetadata,
  oauthMetadataOptions,
} from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return oauthAuthorizationServerMetadata(request);
}

export function OPTIONS() {
  return oauthMetadataOptions();
}
