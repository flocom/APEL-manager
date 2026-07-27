/** Retire le sous-ensemble Markdown accepté dans les descriptions riches. */
export function toPlainText(value: string): string {
  return value.replace(/\*\*([^\n]+?)\*\*/g, "$1");
}
