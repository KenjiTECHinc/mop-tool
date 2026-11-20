# Mops

An AI-assisted ticket desk. The React app, the API, SQLite, and login run on your machine. Amazon Bedrock and Guardrails stay in AWS.

Authorization is enforced in the API. The model never decides what a user may do, write tools only create a pending action, and ticket text is treated as untrusted data. Admin users do not receive ticket content, including in the audit log.

## Trust ladder

- Level 1, this build: the assistant can read and propose. Every write waits for confirmation.
- Level 2, later: low-risk comments and status changes could run with undo.
- Level 3, later: proactive suggestions and scheduled digests.
- Deletes and bulk creates always wait for confirmation.

## Prerequisites

- Node.js 22 or newer
- An AWS account that can call Bedrock in your `AWS_REGION` (the example uses `ap-southeast-2`)
- A 30-day long-term Bedrock API key for local and demo use

## Setup

```bash
npm install
cp .env.example .env
```

Fill `SESSION_SECRET`, `TOTP_KEY`, `AWS_BEARER_TOKEN_BEDROCK`, and `BEDROCK_MODEL_ID`. Optional guardrail steps and the IAM controls for the key are in [infra/README.md](infra/README.md).

### Bedrock API key

Create a **long-term** key in the Amazon Bedrock console: API keys, Long-term API keys, expiration **30 days**. Put the value only in `AWS_BEARER_TOKEN_BEDROCK` in `.env`. The API also needs `AWS_REGION` and `BEDROCK_MODEL_ID`. Leave `AWS_PROFILE` and `APP_ROLE_ARN` empty unless you intentionally want SigV4 instead of the key.

This is a temporary local/demo exception to **SEC-4** in [artifacts/PRD-v1-1.md](artifacts/PRD-v1-1.md). SEC-4 says local access uses IAM Identity Center or a short-lived role, never a long-lived key. A 30-day Bedrock API key is allowed here so the demo can run without SSO. It is not the production pattern.

The key is read only by `apps/api`. It is not sent to `apps/web`, and the server does not log it. `.env` is gitignored. Do not commit the key.

To rotate or revoke it: in the Bedrock console open API keys, select the key, then Deactivate, Reset, or Delete. You can also call `aws iam update-service-specific-credential` or `aws iam delete-service-specific-credential` with the key's `ServiceSpecificCredentialId`. Put the new value in `.env` and restart the API. A deactivated or deleted key stops working immediately.

Before you commit, run [gitleaks](https://github.com/gitleaks/gitleaks) so a pasted key does not land in git:

```bash
gitleaks detect --source . --redact
```

```bash
npm run seed
npm run dev
```

The UI is http://localhost:5173 and the API is http://127.0.0.1:3001.

The session cookie is HttpOnly and SameSite=Strict. The browser sends `X-Mops-Request: 1` on writes. The language choice before login may stay in localStorage. Passwords and the session id do not.

`data/mops.sqlite` is gitignored. On Windows, keep that disk encrypted with BitLocker. The audit table rejects updates and deletes, and the same events are appended to `data/audit.log` without ticket text.

## Demo users

`npm run seed` prints Ada's authenticator URI once. Set `DEMO_PASSWORD` in `.env` (12 to 200 characters; see `.env.example`) to give every seeded user that password. Seed then prints a warning that the shared password is for the local demo only. Leave `DEMO_PASSWORD` unset and seed prints a random password for each person once.

- ada.admin@mops.example, Admin/IT, T1, English, Sandbox, TOTP required
- chris.chen@mops.example, CTO, T2, English, Apollo, Helios, and Nexus
- maya.chen@mops.example, Product Manager, T2, English, Apollo and Helios
- sam.lee@mops.example, Developer, T3, Traditional Chinese, Apollo
- jordan.wu@mops.example, Developer, T3, English, Apollo and Nexus
- riley.park@mops.example, Developer, T3, English, Helios

APOLLO-5 has an English comment that tries to instruct the assistant. APOLLO-8 has the same kind of comment in Chinese.

## Scripts

- `npm test` checks permissions, redaction, lockout, session expiry, T1 one-time codes, and the audit triggers.
- `npm run check:i18n` fails when the English and Traditional Chinese files diverge.
- `npm run eval` sends the bilingual prompt set through the real orchestrator and spends Bedrock credits.
- `npm run check:aws` checks `AWS_BEARER_TOKEN_BEDROCK`, `AWS_REGION`, and `BEDROCK_MODEL_ID` with one short Converse call. It does not call STS. Bedrock API keys cannot call `GetCallerIdentity`.
- `npm audit` before you present the project.

## Architecture

```text
Browser (Vite, :5173) -- cookie --> API (Fastify, 127.0.0.1:3001)
  argon2id, sessions, TOTP for T1
  authorize() and the service layer
  SQLite file and append-only audit log
  BedrockRuntimeClient ConverseStream (AWS_BEARER_TOKEN_BEDROCK)
  ApplyGuardrail on the same client when GUARDRAIL_ID is set
```

Only the prompt, role-filtered tool definitions, redacted ticket excerpts, and the language preference are sent to Bedrock. Passwords, sessions, and the database stay local.

## Assumptions

- A developer may comment on and change the status of any ticket in a member project.
- A product manager or CTO may edit and delete tickets only in member projects.
- Comments cannot be edited or deleted.
- A job title containing "CTO" selects the short cross-project briefing.
- Chinese means Traditional Chinese.
- The visual layout follows the design guidelines: a top header, not a left rail.
- Authentication, data access, and secrets sit behind local implementations so they can later move to Cognito, DynamoDB, and Secrets Manager without rewriting ticket rules.
