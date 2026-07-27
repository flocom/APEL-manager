import { NextResponse } from "next/server";

import {
  handleApiError,
  requireApiRole,
} from "@/lib/auth/guards";
import { readUpload, uploadScopeFromId } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; name: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id, name } = await params;
    const scope = uploadScopeFromId(id);
    await requireApiRole(scope === "accounting" ? "admin" : "manager");
    const file = await readUpload(id, name);
    const fallbackName = file.filename.replace(/["\\\r\n]/g, "_");

    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.data.byteLength),
        "Content-Disposition": `${file.inline ? "inline" : "attachment"}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
