import { App } from "aws-cdk-lib";
import { MopsStack } from "../lib/stack.js";

const app = new App();
new MopsStack(app, "MopsStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-southeast-2",
  },
});
