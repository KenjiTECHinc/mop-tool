import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { fromIni, fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import type { AppConfig } from "./config.js";

/** Bedrock is the only AWS client. The Responses API uses the bearer key, not this role. */
export function createBedrock(config: AppConfig): BedrockRuntimeClient {
  const source = config.AWS_PROFILE ? fromIni({ profile: config.AWS_PROFILE }) : undefined;
  const credentials = config.APP_ROLE_ARN
    ? fromTemporaryCredentials({
        params: { RoleArn: config.APP_ROLE_ARN, RoleSessionName: "mops-api" },
        masterCredentials: source,
        clientConfig: { region: config.AWS_REGION },
      })
    : source;
  return new BedrockRuntimeClient({ region: config.AWS_REGION, credentials, maxAttempts: 3 });
}
