import { redirect } from "next/navigation";

// La vue calendrier a été fusionnée dans « Événements » (onglet Calendrier).
export default function CalendarRedirect() {
  redirect("/dashboard/events?vue=calendrier");
}
