export const BOOK_PRIMARY_CONTENT_FIELD = "Contenu V1";
export const BOOK_CONTINUATION_FIELD = "Contenu V1 — suite";

function value(fields, key) {
  return String(fields?.[key] ?? "").trim();
}

export function bookContent(fields = {}) {
  const primary = value(fields, BOOK_PRIMARY_CONTENT_FIELD);
  const continuation = value(fields, BOOK_CONTINUATION_FIELD);
  if (!primary) return continuation;
  if (!continuation) return primary;
  return `${primary}\n\n${continuation}`;
}

export function hasBookContent(fields = {}) {
  return Boolean(bookContent(fields));
}

export function bookContentParts(fields = {}) {
  const primary = value(fields, BOOK_PRIMARY_CONTENT_FIELD);
  const continuation = value(fields, BOOK_CONTINUATION_FIELD);
  return {
    primary,
    continuation,
    primary_characters: primary.length,
    continuation_characters: continuation.length,
    total_characters: bookContent(fields).length,
  };
}
