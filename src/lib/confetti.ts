/**
 * Petite explosion de confettis festive — chargée à la demande (import dynamique)
 * et respectueuse de « prefers-reduced-motion ». Palette bord de mer.
 */
export async function celebrate() {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const confetti = (await import("canvas-confetti")).default;
  const colors = ["#0a68e0", "#16a7a7", "#eda82f", "#ff7058"];
  confetti({ particleCount: 80, spread: 70, origin: { y: 0.7 }, colors });
  setTimeout(
    () =>
      confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 }, colors }),
    150,
  );
  setTimeout(
    () =>
      confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 }, colors }),
    300,
  );
}
