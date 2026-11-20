import { createBedrock } from "./aws.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const bedrock = createBedrock(config);
const app = await buildApp(config, bedrock);

await app.listen({ port: config.PORT, host: config.HOST });
