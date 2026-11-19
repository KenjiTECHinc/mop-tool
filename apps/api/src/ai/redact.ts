/**
 * Ticket text is untrusted and may contain secrets a user pasted by mistake.
 * Redaction runs before anything is saved and before anything is sent to the model.
 * The original secret is not logged.
 */

const PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/g,
  /ASIA[0-9A-Z]{16}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}\b/g,
  /\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S+/gi,
  /(密碼|密码|口令)\s*[:：=]\s*\S+/g,
];

export interface Redaction {
  text: string;
  redacted: boolean;
}

export function redactSecrets(input: string): Redaction {
  let text = input;
  let redacted = false;
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      redacted = true;
      pattern.lastIndex = 0;
      text = text.replace(pattern, "[REDACTED]");
    }
  }
  return { text, redacted };
}

export function redactFields<T extends Record<string, unknown>>(value: T, keys: (keyof T)[]): { value: T; redacted: boolean } {
  let redacted = false;
  const next = { ...value };
  for (const key of keys) {
    const current = next[key];
    if (typeof current !== "string") continue;
    const result = redactSecrets(current);
    next[key] = result.text as T[keyof T];
    redacted = redacted || result.redacted;
  }
  return { value: next, redacted };
}
