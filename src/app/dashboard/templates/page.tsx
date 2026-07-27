import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyTemplatesPage() {
  redirect("/dashboard/events/templates");
}
