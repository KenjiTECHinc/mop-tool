# AWS setup for the agent

The app, database, and login run on your machine. AWS is only used for the assistant: Bedrock and one guardrail.

## Deploy

```bash
cd infra
npx cdk bootstrap
npx cdk deploy -c alertEmail=you@example.com -c modelId=your-bedrock-model-id
```

`modelId` is optional. Without it, the role can only call `bedrock:ApplyGuardrail` on this guardrail. Chat and guardrails use the Bedrock API key in `.env` unless `AWS_PROFILE` or `APP_ROLE_ARN` is set. That role is the optional SigV4 path. A Bedrock API key cannot call STS, so `npm run check:aws` does not call `GetCallerIdentity`.

Copy `GuardrailId` into `GUARDRAIL_ID`. Leave `GUARDRAIL_VERSION` as `DRAFT` until you publish one.

Do not create a CloudTrail trail. The account's 90-day event history already records Bedrock calls. A trail would write those events to S3.

The guardrail uses a regex and a word filter, which are the free filters. Prompt-attack detection bills per text unit and stays off. Chinese jailbreaks are stopped by the tool list, `authorize()`, and confirmation, not by that word filter.

## Local secrets

Generate `SESSION_SECRET` and `TOTP_KEY` yourself and put them only in `.env`. Then:

```bash
npm run seed
npm run dev
```

`seed` creates `data/mops.sqlite`. Ada (T1) needs a real TOTP code unless `DEMO_TOTP_BYPASS=true`, which accepts `000000` and makes the API log a startup warning. The flag is off by default. With `DEMO_PASSWORD` unset, seed prints a random password for each demo user once. With `DEMO_PASSWORD` set, every seeded user shares that password and seed prints a warning that this is for the local demo only.

## Bedrock API key (local/demo)

The running API authenticates to Amazon Bedrock with `AWS_BEARER_TOKEN_BEDROCK`, `AWS_REGION`, and `BEDROCK_MODEL_ID`. No `OPENAI_*` variables and no `openai` SDK.

Create a long-term key for 30 days (Bedrock console: API keys, Long-term API keys, or `aws iam create-service-specific-credential --service-name bedrock.amazonaws.com --credential-age-days 30`). Put the `ServiceApiKeyValue` only in the untracked `.env`. `.env` is listed in `.gitignore`. The key stays in the API process. It is never written to logs and never sent to the web app.

This is a temporary local/demo exception to **SEC-4** in [artifacts/PRD-v1-1.md](../artifacts/PRD-v1-1.md). SEC-4 forbids long-lived access keys and calls for IAM Identity Center or a short-lived role. The 30-day key exists so a developer can run the demo without SSO. Prefer the `APP_ROLE_ARN` role above when you are ready to drop the exception.

Rotate or revoke the key from the Bedrock console (Deactivate, Reset, or Delete) or with `aws iam update-service-specific-credential` and `aws iam delete-service-specific-credential`. Then replace `AWS_BEARER_TOKEN_BEDROCK` and restart the API. Deactivate or delete takes effect immediately.

### Recommended IAM controls

Attach these limits to the identity that is allowed to mint and use the key. `CallWithBearerToken` is what lets that identity call Bedrock with the key. Cap the lifetime at 30 days so a longer key cannot be created.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "MintThirtyDayBedrockKeys",
      "Effect": "Allow",
      "Action": "iam:CreateServiceSpecificCredential",
      "Resource": "*",
      "Condition": {
        "NumericLessThanEquals": { "iam:ServiceSpecificCredentialAgeDays": "30" },
        "StringEquals": { "iam:ServiceSpecificCredentialServiceName": "bedrock.amazonaws.com" }
      }
    },
    {
      "Sid": "UseLongTermBedrockKeys",
      "Effect": "Allow",
      "Action": "bedrock:CallWithBearerToken",
      "Resource": "*",
      "Condition": {
        "StringEquals": { "bedrock:bearerTokenType": "LONG_TERM" }
      }
    },
    {
      "Sid": "UseLongTermBedrockMantleKeys",
      "Effect": "Allow",
      "Action": "bedrock-mantle:CallWithBearerToken",
      "Resource": "*",
      "Condition": {
        "StringEquals": { "bedrock-mantle:bearerTokenType": "LONG_TERM" }
      }
    }
  ]
}
```

The two `CallWithBearerToken` actions are separate statements. IAM ANDs every condition key in a statement, and `StringEquals` fails when a key is missing from the request, so pairing `bedrock:bearerTokenType` with `bedrock-mantle:bearerTokenType` would deny both calls. `bedrock:bearerTokenType` applies to `bedrock:CallWithBearerToken`. `bedrock-mantle:bearerTokenType` applies to `bedrock-mantle:CallWithBearerToken`. The value is `LONG_TERM` for this demo key and `SHORT_TERM` for a session key. Keep the IAM user that owns the long-term key limited to the one model and this guardrail (`bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`, and `bedrock:ApplyGuardrail` on those ARNs) in addition to the bearer-token actions above.

Run [gitleaks](https://github.com/gitleaks/gitleaks) before every commit so the key is not committed by mistake:

```bash
gitleaks detect --source . --redact
```
