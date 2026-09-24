/**
 * Produces a deterministic representation for audit metadata. PostgreSQL's
 * JSONB type may reorder object keys, so ordinary JSON.stringify cannot be
 * used directly in a tamper-evident hash chain.
 */
function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJson(nestedValue)]),
    );
  }

  return value;
}

export function serializeAuditDetails(details: unknown): string {
  if (typeof details === 'string') {
    try {
      return JSON.stringify(sortJson(JSON.parse(details)));
    } catch {
      return details;
    }
  }

  return JSON.stringify(sortJson(details ?? {}));
}
