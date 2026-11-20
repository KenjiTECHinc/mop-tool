/**
 * The Bedrock SDK reads AWS_BEARER_TOKEN_BEDROCK itself. Zod's trim() only
 * changes the parsed config, so a trailing space or a Windows CR in .env
 * would be sent as the Bearer token unless it is written back to the environment.
 */
export function installBedrockBearerToken(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed) process.env.AWS_BEARER_TOKEN_BEDROCK = trimmed;
  return trimmed;
}

/** Remove every form of the key that might appear in an error: the raw env text and its trimmed value. */
export function redactBearerValues(message: string, ...secrets: Array<string | undefined>): string {
  const variants = new Set<string>();
  for (const secret of secrets) {
    if (!secret || !secret.trim()) continue;
    variants.add(secret);
    variants.add(secret.trim());
  }
  const ordered = [...variants].sort((left, right) => right.length - left.length);
  let redacted = message;
  for (const secret of ordered) redacted = redacted.split(secret).join("[REDACTED]");
  return redacted.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}
