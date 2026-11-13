import React from "react";

/**
 * Rendert een vertaalde tekst met lichte opmaak, zodat zinnen met nadruk niet in losse
 * vertaalstukjes geknipt hoeven te worden:
 * `**vet**`, `*cursief*` en `` `code` `` (underscores blijven gewoon tekst, voor namen als WHEA_ERROR).
 */
export function renderRich(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<em key={key++}>{m[2]}</em>);
    else out.push(<code key={key++}>{m[3]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export const RichText: React.FC<{ text: string }> = ({ text }) => <>{renderRich(text)}</>;
