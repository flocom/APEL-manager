type ApiOptions = {
  method?: "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
};

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
    throw new Error(
      (data && typeof data.error === "string" && data.error) ||
        "Une erreur est survenue.",
    );
  }
  return data as T;
}
