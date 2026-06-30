/** Bande de vagues décorative (clin d'œil à « Notre Dame des Flots »). */
export function Waves({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M0,64 C180,110 360,18 540,40 C720,62 900,118 1080,96 C1260,74 1350,40 1440,52 L1440,120 L0,120 Z"
      />
    </svg>
  );
}
