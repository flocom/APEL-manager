"use client";

import {
  Archive,
  BadgeCheck,
  FileCheck2,
  FilePenLine,
  FileText,
  Files,
  Pencil,
  Plus,
  Printer,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FileUploadField } from "@/components/file-upload-field";
import { ModuleStat } from "@/components/module-stat";
import { useToast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/client";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface DocumentMemberOption {
  id: string;
  name: string;
}

export interface AssociationDocumentView {
  id: string;
  type: "ag_minutes" | "attestation" | "other";
  status: "draft" | "final" | "archived";
  title: string;
  documentDate: string;
  content: string;
  memberId: string | null;
  fileUrl: string | null;
  version: number;
}

type DocumentTab = "ag_minutes" | "attestation";

const STATUS_LABELS: Record<AssociationDocumentView["status"], string> = {
  draft: "Brouillon",
  final: "Finalisé",
  archived: "Archivé",
};

const STATUS_COLORS = {
  draft: "amber",
  final: "sea",
  archived: "slate",
} as const;

export function DocumentsManager({
  documents,
  memberOptions,
}: {
  documents: AssociationDocumentView[];
  memberOptions: DocumentMemberOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<DocumentTab>("ag_minutes");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<
    "all" | AssociationDocumentView["status"]
  >("all");
  const [editor, setEditor] = useState<
    "new" | AssociationDocumentView | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<AssociationDocumentView | null>(null);
  const [deleting, setDeleting] = useState(false);

  const memberNames = useMemo(
    () => new Map(memberOptions.map((member) => [member.id, member.name])),
    [memberOptions],
  );
  const minuteCount = documents.filter(
    (document) => document.type === "ag_minutes",
  ).length;
  const attestationCount = documents.filter(
    (document) => document.type === "attestation",
  ).length;
  const finalCount = documents.filter(
    (document) => document.status === "final",
  ).length;
  const draftCount = documents.filter(
    (document) => document.status === "draft",
  ).length;

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return documents.filter((document) => {
      const memberName = document.memberId
        ? memberNames.get(document.memberId)
        : "";
      return (
        document.type === tab &&
        (status === "all" || document.status === status) &&
        (!normalizedQuery ||
          `${document.title} ${document.content} ${memberName ?? ""}`
            .toLocaleLowerCase("fr")
            .includes(normalizedQuery))
      );
    });
  }, [documents, memberNames, query, status, tab]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const body = {
      type: form.get("type"),
      status: form.get("status"),
      title: form.get("title"),
      documentDate: form.get("documentDate"),
      content: form.get("content") || "",
      memberId: form.get("memberId") || null,
      fileUrl: form.get("fileUrl") || null,
      ...(editor !== "new" && editor ? { version: editor.version } : {}),
    };

    try {
      if (editor === "new") {
        await api("/api/documents", { body });
        toast(
          tab === "ag_minutes"
            ? "Procès-verbal ajouté."
            : "Attestation ajoutée.",
        );
      } else if (editor) {
        await api(`/api/documents/${editor.id}`, {
          method: "PATCH",
          body,
        });
        toast("Document mis à jour.");
      }
      setEditor(null);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api(`/api/documents/${pendingDelete.id}`, { method: "DELETE" });
      toast("Document archivé.");
      setPendingDelete(null);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  }

  function printDocument(document: AssociationDocumentView) {
    const printWindow = window.open(
      `/api/documents/${document.id}?format=print`,
      "_blank",
    );
    if (printWindow) printWindow.opener = null;
    if (!printWindow) {
      toast(
        "Le navigateur a bloqué l'ouverture. Autorisez les fenêtres pour imprimer.",
        "error",
      );
    }
  }

  function changeTab(nextTab: DocumentTab) {
    setTab(nextTab);
    setEditor(null);
  }

  return (
    <div className="space-y-6">
      <section
        aria-label="Indicateurs des documents"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <ModuleStat
          label="PV d'AG"
          value={minuteCount}
          helper="Assemblées documentées"
          icon={FileText}
          tone="brand"
        />
        <ModuleStat
          label="Attestations"
          value={attestationCount}
          helper="Documents nominatifs"
          icon={BadgeCheck}
          tone="sea"
        />
        <ModuleStat
          label="Finalisés"
          value={finalCount}
          helper="Prêts à diffuser"
          icon={FileCheck2}
          tone="slate"
        />
        <ModuleStat
          label="Brouillons"
          value={draftCount}
          helper="À relire ou signer"
          icon={FilePenLine}
          tone="coral"
        />
      </section>

      <div
        role="tablist"
        aria-label="Type de documents"
        className="grid rounded-2xl border-2 border-slate-200 bg-slate-100 p-1 sm:w-fit sm:grid-cols-2"
      >
        <DocumentTabButton
          active={tab === "ag_minutes"}
          icon={FileText}
          label="PV d'AG"
          count={minuteCount}
          onClick={() => changeTab("ag_minutes")}
        />
        <DocumentTabButton
          active={tab === "attestation"}
          icon={BadgeCheck}
          label="Attestations"
          count={attestationCount}
          onClick={() => changeTab("attestation")}
        />
      </div>

      {editor && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b-2 border-slate-100 bg-brand-50 px-5 py-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">
                Registre documentaire
              </p>
              <h2 className="mt-1 text-xl font-bold text-brand-950">
                {editor === "new"
                  ? tab === "ag_minutes"
                    ? "Ajouter un procès-verbal"
                    : "Créer une attestation"
                  : "Modifier le document"}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setEditor(null)}
              disabled={submitting}
              className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Fermer le formulaire"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <DocumentForm
            document={editor === "new" ? null : editor}
            defaultType={tab}
            memberOptions={memberOptions}
            loading={submitting}
            onSubmit={save}
            onCancel={() => setEditor(null)}
          />
        </Card>
      )}

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <label htmlFor="documents-search" className="sr-only">
              Rechercher un document
            </label>
            <Input
              id="documents-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Titre, contenu ou adhérent…"
              className="pl-10"
            />
          </div>
          <label htmlFor="documents-status" className="sr-only">
            Filtrer par statut
          </label>
          <Select
            id="documents-status"
            value={status}
            onChange={(event) =>
              setStatus(
                event.target.value as
                  | "all"
                  | AssociationDocumentView["status"],
              )
            }
            className="lg:w-44"
          >
            <option value="all">Tous les statuts</option>
            <option value="draft">Brouillons</option>
            <option value="final">Finalisés</option>
            <option value="archived">Archivés</option>
          </Select>
          <Button
            type="button"
            icon={Plus}
            onClick={() => setEditor("new")}
            className="w-full lg:w-auto"
          >
            {tab === "ag_minutes" ? "Ajouter un PV" : "Créer une attestation"}
          </Button>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={tab === "ag_minutes" ? FileText : BadgeCheck}
          title={
            query || status !== "all"
              ? "Aucun document trouvé"
              : tab === "ag_minutes"
                ? "Aucun procès-verbal"
                : "Aucune attestation"
          }
          description={
            query || status !== "all"
              ? "Modifiez la recherche ou le filtre de statut."
              : tab === "ag_minutes"
                ? "Ajoutez le premier PV d'assemblée générale de l'association."
                : "Créez une attestation à partir de l'identité officielle de l'APEL."
          }
          action={
            !query && status === "all" ? (
              <Button
                type="button"
                size="sm"
                icon={Plus}
                onClick={() => setEditor("new")}
              >
                {tab === "ag_minutes"
                  ? "Ajouter le premier PV"
                  : "Créer la première attestation"}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="text-sm font-medium text-slate-500">
            {filtered.length} document{filtered.length > 1 ? "s" : ""}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {filtered.map((document) => (
              <DocumentCard
                key={document.id}
                document={document}
                memberName={
                  document.memberId
                    ? memberNames.get(document.memberId) ?? null
                    : null
                }
                onEdit={() => setEditor(document)}
                onDelete={() => setPendingDelete(document)}
                onPrint={() => printDocument(document)}
              />
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Archiver ce document ?"
        description={
          pendingDelete
            ? `Le document « ${pendingDelete.title} » restera consultable dans les archives.`
            : ""
        }
        confirmLabel="Archiver le document"
        loading={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}

function DocumentTabButton({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: typeof FileText;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        active
          ? "bg-brand-700 text-white"
          : "text-slate-600 hover:bg-white hover:text-slate-950",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
      <span
        className={cn(
          "rounded-md px-2 py-0.5 text-xs tabular-nums",
          active ? "bg-white/15 text-white" : "bg-white text-slate-500",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function DocumentCard({
  document,
  memberName,
  onEdit,
  onDelete,
  onPrint,
}: {
  document: AssociationDocumentView;
  memberName: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onPrint: () => void;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className={cn(
          "h-1.5",
          document.type === "ag_minutes" ? "bg-brand-600" : "bg-sea-500",
        )}
      />
      <div className="flex-1 p-5">
        <div className="flex items-start justify-between gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white",
              document.type === "ag_minutes"
                ? "bg-brand-700"
                : "bg-sea-600",
            )}
          >
            {document.type === "ag_minutes" ? (
              <FileText className="h-5 w-5" />
            ) : (
              <BadgeCheck className="h-5 w-5" />
            )}
          </span>
          <Badge color={STATUS_COLORS[document.status]}>
            {STATUS_LABELS[document.status]}
          </Badge>
        </div>
        <h3 className="mt-4 text-lg font-bold tracking-tight text-slate-950">
          {document.title}
        </h3>
        <p className="mt-1 text-sm font-medium text-slate-500">
          {formatShortDate(document.documentDate)}
        </p>
        {memberName && (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600">
            <UserRound className="h-4 w-4 text-brand-600" aria-hidden="true" />
            {memberName}
          </p>
        )}
        {document.content && (
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
            {document.content}
          </p>
        )}
        {document.fileUrl && (
          <a
            href={document.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-900 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Files className="h-4 w-4" aria-hidden="true" />
            Ouvrir le fichier joint
          </a>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 border-t-2 border-slate-100 bg-slate-50 p-4">
        <Button
          type="button"
          size="sm"
          variant="outline"
          icon={Printer}
          onClick={onPrint}
        >
          Imprimer
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          icon={Pencil}
          onClick={onEdit}
        >
          Modifier
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          icon={Archive}
          className="hover:!bg-coral-50 hover:!text-coral-800"
          onClick={onDelete}
          disabled={document.status === "archived"}
        >
          Archiver
        </Button>
      </div>
    </Card>
  );
}

function DocumentForm({
  document,
  defaultType,
  memberOptions,
  loading,
  onSubmit,
  onCancel,
}: {
  document: AssociationDocumentView | null;
  defaultType: DocumentTab;
  memberOptions: DocumentMemberOption[];
  loading: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Type" htmlFor="document-type">
          <Select
            id="document-type"
            name="type"
            defaultValue={document?.type ?? defaultType}
          >
            <option value="ag_minutes">PV d'assemblée générale</option>
            <option value="attestation">Attestation</option>
            <option value="other">Autre document</option>
          </Select>
        </Field>
        <Field label="Statut" htmlFor="document-status">
          <Select
            id="document-status"
            name="status"
            defaultValue={document?.status ?? "draft"}
          >
            <option value="draft">Brouillon</option>
            <option value="final">Finalisé</option>
            <option value="archived">Archivé</option>
          </Select>
        </Field>
        <Field label="Date du document" htmlFor="documentDate">
          <Input
            id="documentDate"
            name="documentDate"
            type="date"
            required
            defaultValue={
              document?.documentDate.slice(0, 10) ??
              new Date().toISOString().slice(0, 10)
            }
          />
        </Field>
        <Field label="Adhérent concerné" htmlFor="memberId">
          <Select
            id="memberId"
            name="memberId"
            defaultValue={document?.memberId ?? ""}
          >
            <option value="">Aucun</option>
            {memberOptions.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Titre"
          htmlFor="document-title"
          className="sm:col-span-2 lg:col-span-4"
        >
          <Input
            id="document-title"
            name="title"
            required
            defaultValue={document?.title}
            placeholder={
              defaultType === "ag_minutes"
                ? "PV de l'assemblée générale du…"
                : "Attestation de…"
            }
          />
        </Field>
        <Field
          label="Contenu"
          htmlFor="document-content"
          className="sm:col-span-2 lg:col-span-4"
          hint="Ce contenu sera repris dans la version imprimable."
        >
          <Textarea
            id="document-content"
            name="content"
            rows={10}
            defaultValue={document?.content ?? ""}
            placeholder="Rédigez ou collez le contenu du document…"
          />
        </Field>
        <FileUploadField
          label="Fichier signé"
          name="fileUrl"
          scope="document"
          defaultValue={document?.fileUrl}
          className="sm:col-span-2 lg:col-span-4"
        />
      </div>
      <div className="flex flex-col-reverse gap-2 border-t-2 border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Annuler
        </Button>
        <Button type="submit" loading={loading} icon={FileCheck2}>
          {document ? "Enregistrer les modifications" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
