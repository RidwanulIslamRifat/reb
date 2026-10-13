/** Replacement text for anything secret (SPEC 14). */
export const REDACTED = "[REDACTED]";

// Names of fields whose value is always secret, e.g. "Authorization", "set-cookie", "api_key", "accessToken".
const SECRET_KEY = /authorization|cookie|token|api[-_]?key|secret|password|passwd/i;

// Secret-looking pieces inside ordinary text, with what to put in their place.
// Labels such as "Bearer" or "token=" are kept so a reader still sees what was removed.
const SECRET_TEXT: Array<[RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED}`],
  [
    /\b((?:access_|refresh_|id_)?token|api[-_]?key|apikey|secret|password|sig|signature)=[^&\s"']+/gi,
    `$1=${REDACTED}`,
  ],
  // Secret-looking query values in addresses, for example ?session=... or &auth_code=...
  [
    /([?&][\w-]*(?:token|key|secret|password|passwd|auth|session|sig|signature|code|credential)[\w-]*)=[^&\s"'#]+/gi,
    `$1=${REDACTED}`,
  ],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, REDACTED],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, REDACTED],
];

export function redactText(text: string): string {
  return SECRET_TEXT.reduce(
    (out, [pattern, replacement]) => out.replace(pattern, replacement),
    text,
  );
}

/**
 * Returns a copy of `value` with secrets replaced by [REDACTED]: the whole value of any
 * secret-named field, and secret-looking text (bearer tokens, key=value secrets, JWTs) anywhere.
 */
export function redact<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      // HAR-style headers: { name: "Authorization", value: "..." }
      const namedSecret =
        key === "value" && typeof (value as { name?: unknown }).name === "string"
          ? SECRET_KEY.test((value as { name: string }).name)
          : false;
      out[key] = SECRET_KEY.test(key) || namedSecret ? REDACTED : walk(inner);
    }
    return out;
  }
  return value;
}
