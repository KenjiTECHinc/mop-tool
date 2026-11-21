import { warnDemoTotpBypass } from "./auth/demo-totp.js";
import { createBedrock } from "./aws.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
warnDemoTotpBypass(config.DEMO_TOTP_BYPASS);
const bedrock = createBedrock(config);
const app = await buildApp(config, bedrock);

await app.listen({ port: config.PORT, host: config.HOST });
