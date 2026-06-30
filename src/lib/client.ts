type ApiOptions = {
  method?: "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
};

/** Erreur HTTP qui conserve le code (ex. 409 conflit) et le corps de réponse. */
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Petit client fetch côté navigateur : envoie du JSON et remonte les erreurs. */
export async function api<T = { ok: true }>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "POST",
    headers: { "Content-Type": "application/json" },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data && typeof data.error === "string" && data.error) ||
      "Une erreur est survenue.";
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}
