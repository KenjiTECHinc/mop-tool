# AWS setup for the agent

The app, database, and login run on your machine. AWS is only used for the assistant: Bedrock and one guardrail.

## Deploy

```bash
cd infra
npx cdk bootstrap
npx cdk deploy -c alertEmail=you@example.com -c modelId=your-mantle-model-id
```

`modelId` is optional. Without it, the role can only call `bedrock:ApplyGuardrail` on this guardrail. The chat itself uses the Bedrock API key in `.env`, not this role.

Copy `GuardrailId` into `GUARDRAIL_ID`. Leave `GUARDRAIL_VERSION` as `DRAFT` until you publish one.

Do not create a CloudTrail trail. The account's 90-day event history already records Bedrock calls. A trail would write those events to S3.

The guardrail uses a regex and a word filter, which are the free filters. Prompt-attack detection bills per text unit and stays off. Chinese jailbreaks are stopped by the tool list, `authorize()`, and confirmation, not by that word filter.

## Local secrets

Generate `SESSION_SECRET` and `TOTP_KEY` yourself and put them only in `.env`. Then:

```bash
npm run seed
npm run dev
```

`seed` creates `data/mops.sqlite` and prints Ada's TOTP URI once. With `DEMO_PASSWORD` unset, it prints a random password for each demo user once. With `DEMO_PASSWORD` set, every seeded user shares that password and seed prints a warning that this is for the local demo only.
