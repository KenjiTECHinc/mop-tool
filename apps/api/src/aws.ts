import { BedrockRuntimeClient, type BedrockRuntimeClientConfig } from "@aws-sdk/client-bedrock-runtime";
import { fromIni, fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import type { AppConfig } from "./config.js";

type BedrockAuthConfig = Pick<AppConfig, "AWS_REGION" | "AWS_PROFILE" | "APP_ROLE_ARN">;

/**
 * True when the operator set an IAM profile or role. That pair is an explicit
 * SigV4 override. Otherwise the SDK authenticates with AWS_BEARER_TOKEN_BEDROCK.
 */
export function usesIamOverride(config: Pick<AppConfig, "AWS_PROFILE" | "APP_ROLE_ARN">): boolean {
  return Boolean(config.AWS_PROFILE) || Boolean(config.APP_ROLE_ARN);
}

/**
 * Client options for ConverseStream and ApplyGuardrail.
 *
 * Bearer path: credentials are omitted and httpBearerAuth is preferred.
 * @aws-sdk/client-bedrock-runtime resolves signing name "bedrock" to the
 * AWS_BEARER_TOKEN_BEDROCK environment variable (see getBearerTokenEnvKey).
 * The key is not copied onto the client config.
 *
 * Preferring the bearer scheme matters: the auth middleware uses the first
 * scheme and does not fall through when SigV4 credentials fail or when
 * ambient IAM credentials exist.
 */
export function bedrockClientConfig(config: BedrockAuthConfig): BedrockRuntimeClientConfig {
  if (!usesIamOverride(config)) {
    return {
      region: config.AWS_REGION,
      maxAttempts: 3,
      authSchemePreference: ["httpBearerAuth"],
    };
  }
  const source = config.AWS_PROFILE ? fromIni({ profile: config.AWS_PROFILE }) : undefined;
  const credentials = config.APP_ROLE_ARN
    ? fromTemporaryCredentials({
        params: { RoleArn: config.APP_ROLE_ARN, RoleSessionName: "mops-api" },
        masterCredentials: source,
        clientConfig: { region: config.AWS_REGION },
      })
    : source;
  return { region: config.AWS_REGION, credentials, maxAttempts: 3 };
}

/** Bedrock Runtime is the only AWS client. The API key stays in the process environment. */
export function createBedrock(config: BedrockAuthConfig): BedrockRuntimeClient {
  return new BedrockRuntimeClient(bedrockClientConfig(config));
}
