import React from "react";

/**
 * Pictogrammes des cartes « temps forts » : une couleur principale et une
 * touche d'accent, formes simples et sobres, lisibles en petit.
 */

/** Cœur centré en (x, y), de largeur ~2s. */
export function heartPath(x: number, y: number, s: number): string {
  return `M ${x} ${y + s * 0.9} C ${x - s * 1.25} ${y + s * 0.1}, ${x - s * 0.95} ${y - s * 0.95}, ${x} ${y - s * 0.35} C ${x + s * 0.95} ${y - s * 0.95}, ${x + s * 1.25} ${y + s * 0.1}, ${x} ${y + s * 0.9} Z`;
}

/** Étoile à cinq branches (points pour <polygon>). */
export function starPoints(x: number, y: number, r: number, inner = 0.5, rotation = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = (Math.PI * i) / 5 - Math.PI / 2 + rotation;
    pts.push(`${(x + rad * Math.cos(a)).toFixed(1)},${(y + rad * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

export type BadgeIconKind =
  | "star"
  | "heart"
  | "gift"
  | "bus"
  | "book"
  | "ball"
  | "music"
  | "sun"
  | "tree"
  | "cake"
  | "people"
  | "coin"
  | "calendar";

const KEYWORDS: [BadgeIconKind, RegExp][] = [
  ["tree", /no[eë]l|sapin/i],
  ["bus", /sortie|voyage|visite|excursion|classe (verte|de neige|de mer|d[ée]couverte)|transport|mus[ée]e|\bcar\b|bus/i],
  ["book", /livre|biblioth|lecture|bcd|dictionnaire|manuel|conte/i],
  ["cake", /g[aâ]teau|go[uû]ter|anniversaire|cr[eê]pe|galette|repas|petit[- ]d[ée]j|chocolat|p[aâ]tisserie/i],
  ["ball", /sport|ballon|jeu|cour\b|r[ée]cr[ée]|tournoi|olympiade|piscine|foot|v[ée]lo|course/i],
  ["music", /spectacle|chorale|musique|concert|danse|th[ée][aâ]tre|chant|carnaval|bal\b|boum|boom/i],
  ["sun", /kermesse|f[eê]te|[ée]t[ée]|jardin|potager|pique[- ]nique|plein air|nature/i],
  ["gift", /cadeau|jouet|tombola|lot|mat[ée]riel|achat|offert|don|p[eè]re no[eë]l/i],
  ["coin", /€|euro|budget|financ|argent|recette/i],
  ["people", /famille|parent|adh[ée]rent|membre|b[ée]n[ée]vole|enfant|[ée]l[eè]ve/i],
  ["calendar", /[ée]v[ée]nement|rendez-vous|date|ann[ée]e|mois|matin[ée]e/i],
];

/** Pictogramme le plus parlant pour un texte, sinon une étoile ou un cœur. */
export function iconForText(text: string, fallbackIndex = 0): BadgeIconKind {
  // « Père Noël » : un cadeau plutôt qu'un sapin.
  if (/p[eè]re no[eë]l/i.test(text)) return "gift";
  for (const [kind, re] of KEYWORDS) if (re.test(text)) return kind;
  return fallbackIndex % 2 === 0 ? "star" : "heart";
}

export const BadgeIcon: React.FC<{ kind: BadgeIconKind; color: string; accent: string; size: number }> = ({ kind, color, accent, size }) => {
  const body = (() => {
    switch (kind) {
      case "star":
        return <polygon points={starPoints(50, 53, 40, 0.48)} fill={color} strokeLinejoin="round" stroke={color} strokeWidth={6} />;
      case "heart":
        return <path d={heartPath(50, 52, 36)} fill={color} />;
      case "gift":
        return (
          <>
            <rect x={18} y={46} width={64} height={42} rx={6} fill={color} />
            <rect x={14} y={32} width={72} height={18} rx={5} fill={color} />
            <rect x={45} y={32} width={10} height={56} fill={accent} />
            <path d="M50 32 C34 12 20 28 47 32 M50 32 C66 12 80 28 53 32" stroke={accent} strokeWidth={6} fill="none" strokeLinecap="round" />
          </>
        );
      case "bus":
        return (
          <>
            <rect x={12} y={24} width={76} height={52} rx={12} fill={color} />
            {[20, 42, 64].map((x) => (
              <rect key={x} x={x} y={32} width={16} height={16} rx={4} fill="#ffffff" />
            ))}
            <rect x={12} y={58} width={76} height={6} fill={accent} />
            <circle cx={30} cy={78} r={9} fill={color} stroke="#ffffff" strokeWidth={4} />
            <circle cx={70} cy={78} r={9} fill={color} stroke="#ffffff" strokeWidth={4} />
          </>
        );
      case "book":
        return (
          <>
            <path d="M50 30 Q30 20 12 26 L12 80 Q30 74 50 84 Z" fill={color} />
            <path d="M50 30 Q70 20 88 26 L88 80 Q70 74 50 84 Z" fill={color} opacity={0.75} />
            <path d="M50 30 L50 84" stroke={accent} strokeWidth={4} />
          </>
        );
      case "ball":
        return (
          <>
            <circle cx={50} cy={52} r={38} fill={color} />
            <path d="M16 40 Q50 56 84 40 M22 72 Q50 58 78 72 M50 14 Q38 52 50 90" stroke="#ffffff" strokeWidth={5} fill="none" />
          </>
        );
      case "music":
        return (
          <>
            <path d="M36 74 L36 26 L80 16 L80 64" stroke={color} strokeWidth={8} fill="none" strokeLinejoin="round" />
            <ellipse cx={26} cy={76} rx={14} ry={11} fill={color} transform="rotate(-20 26 76)" />
            <ellipse cx={70} cy={66} rx={14} ry={11} fill={accent} transform="rotate(-20 70 66)" />
          </>
        );
      case "sun":
        return (
          <>
            {Array.from({ length: 8 }, (_, i) => (
              <rect key={i} x={46} y={6} width={8} height={16} rx={4} fill={accent} transform={`rotate(${i * 45} 50 50)`} />
            ))}
            <circle cx={50} cy={50} r={24} fill={color} />
          </>
        );
      case "tree":
        return (
          <>
            <rect x={45} y={74} width={10} height={16} rx={2} fill={accent} />
            <polygon points="50,12 80,52 20,52" fill={color} strokeLinejoin="round" stroke={color} strokeWidth={6} />
            <polygon points="50,32 86,76 14,76" fill={color} strokeLinejoin="round" stroke={color} strokeWidth={6} />
            <circle cx={50} cy={12} r={6} fill={accent} />
          </>
        );
      case "cake":
        return (
          <>
            <rect x={18} y={50} width={64} height={36} rx={8} fill={color} />
            <path d="M18 60 Q26 68 34 60 Q42 68 50 60 Q58 68 66 60 Q74 68 82 60 V56 H18 Z" fill="#ffffff" />
            <rect x={46} y={28} width={8} height={22} rx={3} fill={color} opacity={0.8} />
            <path d="M50 12 Q57 21 50 27 Q43 21 50 12 Z" fill={accent} />
          </>
        );
      case "people":
        return (
          <>
            <circle cx={32} cy={36} r={12} fill={color} />
            <path d="M14 82 Q14 54 32 54 Q50 54 50 82 Z" fill={color} />
            <circle cx={68} cy={36} r={12} fill={color} opacity={0.75} />
            <path d="M50 82 Q50 54 68 54 Q86 54 86 82 Z" fill={color} opacity={0.75} />
            <path d={heartPath(50, 26, 9)} fill={accent} />
          </>
        );
      case "coin":
        return (
          <>
            <circle cx={50} cy={50} r={38} fill={color} />
            <path d="M62 36 A17 17 0 1 0 62 64" stroke="#ffffff" strokeWidth={7} fill="none" strokeLinecap="round" />
            <path d="M30 46 L54 46 M30 56 L54 56" stroke="#ffffff" strokeWidth={6} strokeLinecap="round" />
          </>
        );
      case "calendar":
        return (
          <>
            <rect x={14} y={22} width={72} height={64} rx={10} fill={color} />
            <rect x={22} y={40} width={56} height={38} rx={4} fill="#ffffff" />
            <rect x={28} y={12} width={8} height={18} rx={4} fill={color} />
            <rect x={64} y={12} width={8} height={18} rx={4} fill={color} />
            <path d={heartPath(50, 58, 12)} fill={accent} />
          </>
        );
    }
  })();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
      {body}
    </svg>
  );
};
