import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

/** AWS is only the agent: a guardrail, a Bedrock role, and an optional spend alert. */
export class MopsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const guardrail = new bedrock.CfnGuardrail(this, "Guardrail", {
      name: "mops-free",
      description: "Free filters only. Paid prompt-attack filters stay off.",
      blockedInputMessaging: "Blocked by guardrail.",
      blockedOutputsMessaging: "Blocked by guardrail.",
      sensitiveInformationPolicyConfig: {
        regexesConfig: [
          {
            name: "AwsAccessKey",
            description: "AWS access key id",
            pattern: String.raw`AKIA[0-9A-Z]{16}`,
            action: "BLOCK",
          },
        ],
      },
      wordPolicyConfig: {
        wordsConfig: [
          {
            text: "reveal the system prompt",
            inputAction: "BLOCK",
            outputAction: "BLOCK",
            inputEnabled: true,
            outputEnabled: true,
          },
        ],
      },
    });

    const role = new iam.Role(this, "ApiRole", {
      roleName: "MopsApiRole",
      assumedBy: new iam.AccountRootPrincipal(),
      description: "Bedrock invoke and one guardrail. No other AWS services.",
    });
    const modelId = this.node.tryGetContext("modelId") as string | undefined;
    const resources = [guardrail.attrGuardrailArn];
    if (modelId) {
      resources.push(`arn:aws:bedrock:${this.region}::foundation-model/${modelId}`);
    }
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: modelId
          ? ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:ApplyGuardrail"]
          : ["bedrock:ApplyGuardrail"],
        resources,
      }),
    );

    const alertEmail = this.node.tryGetContext("alertEmail") as string | undefined;
    if (alertEmail) {
      new budgets.CfnBudget(this, "SpendAlert", {
        budget: {
          budgetName: "mops-one-dollar",
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: { amount: 1, unit: "USD" },
        },
        notificationsWithSubscribers: [
          {
            notification: { notificationType: "ACTUAL", comparisonOperator: "GREATER_THAN", threshold: 100 },
            subscribers: [{ subscriptionType: "EMAIL", address: alertEmail }],
          },
        ],
      });
    }

    new CfnOutput(this, "AppRoleArn", { value: role.roleArn });
    new CfnOutput(this, "GuardrailId", { value: guardrail.attrGuardrailId });
    new CfnOutput(this, "GuardrailVersion", { value: "DRAFT" });
  }
}
