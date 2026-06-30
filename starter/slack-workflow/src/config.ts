import { join } from "node:path";

import {
  resolveSlackConnection,
  type SlackConnectionConfig,
} from "@corbits/example-slack-bridge";
import {
  resolveSource,
  type Source,
} from "@corbits/example-workflow-approval-flow";

export const SERVICE_NAME = "slack-workflow";

export type SlackWorkflowConfig = SlackConnectionConfig & {
  source: Source;
  contextRoot: string;
};

export function resolveConfig(
  env: NodeJS.ProcessEnv,
  contextRootOverride?: string,
):
  | {
      config: SlackWorkflowConfig;
      error?: undefined;
    }
  | { config?: undefined; error: string } {
  const slack = resolveSlackConnection(env);
  if (slack.error !== undefined) return { error: slack.error };

  const sourceResult = resolveSource(env);
  if (sourceResult.error !== undefined) return { error: sourceResult.error };

  return {
    config: {
      ...slack.config,
      source: sourceResult.source,
      contextRoot:
        contextRootOverride ?? join(process.cwd(), "tmp", SERVICE_NAME),
    },
  };
}
