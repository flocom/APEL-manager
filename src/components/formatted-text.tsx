import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";

function formatInline(line: string, lineIndex: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  const boldPattern = /\*\*([^\n]+?)\*\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = boldPattern.exec(line)) !== null) {
    if (match.index > cursor) {
      nodes.push(line.slice(cursor, match.index));
    }
    nodes.push(
      <strong key={`bold-${lineIndex}-${match.index}`} className="font-bold">
        {match[1]}
      </strong>,
    );
    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) {
    nodes.push(line.slice(cursor));
  }

  return nodes;
}

/**
 * Rend uniquement le gras `**texte**` et les retours à la ligne.
 * Le texte reste échappé par React : aucun HTML utilisateur n'est injecté.
 */
export function FormattedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  return (
    <p className={cn("break-words", className)}>
      {lines.map((line, index) => (
        <Fragment key={`line-${index}`}>
          {formatInline(line, index)}
          {index < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </p>
  );
}
