import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromIni } from "@aws-sdk/credential-providers";

loadDotenv({ path: resolve(process.cwd(), ".env") });

const region = process.env.AWS_REGION || "ap-southeast-2";
const missing = ["OPENAI_BASE_URL", "OPENAI_API_KEY"].filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

const credentials = process.env.AWS_PROFILE ? fromIni({ profile: process.env.AWS_PROFILE }) : undefined;
const sts = new STSClient({ region, credentials });
const identity = await sts.send(new GetCallerIdentityCommand({}));
console.log(`caller ${identity.Arn}`);

const models = await fetch(`${process.env.OPENAI_BASE_URL}/models`, {
  headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
});
if (!models.ok) throw new Error(`models ${models.status}`);
const body = (await models.json()) as { data?: { id: string }[] };
console.log(`bedrock models ${body.data?.length ?? 0}`);
console.log("check:aws did not call responses.create");
