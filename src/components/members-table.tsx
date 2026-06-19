"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Select } from "@/components/ui";
import { api } from "@/lib/client";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { Role } from "@/lib/db/schema";
import { formatShortDate } from "@/lib/dates";

interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

const ROLES: Role[] = ["member", "manager", "admin"];

export function MembersTable({
  members,
  currentUserId,
}: {
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function changeRole(id: string, role: Role) {
    setError(null);
    setBusyId(id);
    try {
      await api(`/api/members/${id}`, { method: "PATCH", body: { role } });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Supprimer le compte de ${name} ?`)) return;
    setError(null);
    setBusyId(id);
    try {
      await api(`/api/members/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Membre</th>
              <th className="px-4 py-3 font-medium">Rôle</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">
                Inscrit le
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => {
              const isSelf = m.id === currentUserId;
              return (
                <tr key={m.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">
                      {m.name}
                      {isSelf && (
                        <span className="ml-1 text-xs text-slate-400">(vous)</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{m.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={m.role}
                      disabled={busyId === m.id || isSelf}
                      onChange={(e) => changeRole(m.id, e.target.value as Role)}
                      className="w-auto"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">
                    {formatShortDate(m.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => remove(m.id, m.name)}
                        disabled={busyId === m.id}
                        className="text-xs font-medium text-slate-400 hover:text-red-600 disabled:opacity-50"
                      >
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
