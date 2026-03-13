export function formatErrorMessage(error: unknown, fallback = "Xatolik yuz berdi") {
  if (!error) return fallback;

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : null;
    const details = typeof record.details === "string" ? record.details : null;
    const hint = typeof record.hint === "string" ? record.hint : null;
    const code = typeof record.code === "string" ? record.code : null;

    const parts = [message, details, hint ? `Hint: ${hint}` : null, code ? `Code: ${code}` : null]
      .filter(Boolean)
      .map((item) => String(item));

    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  return fallback;
}
