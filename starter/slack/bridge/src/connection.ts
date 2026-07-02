export type SlackConnectionConfig = {
  port: number;
  signingSecret: string;
  botToken: string;
  appToken?: string;
};

export function resolveSlackConnection(
  env: NodeJS.ProcessEnv,
  opts: { defaultPort?: number } = {},
):
  | {
      config: SlackConnectionConfig;
      error?: undefined;
    }
  | { config?: undefined; error: string } {
  const signingSecret = env.SLACK_SIGNING_SECRET;
  const botToken = env.SLACK_BOT_TOKEN;
  const appToken = env.SLACK_APP_TOKEN;

  if (signingSecret === undefined || signingSecret === "") {
    return { error: "SLACK_SIGNING_SECRET is not set.\n" };
  }
  if (botToken === undefined || botToken === "") {
    const appTokenNote =
      appToken === undefined || appToken === ""
        ? ""
        : " The xapp token is an app-level token; this starter still needs the xoxb Bot User OAuth Token to post replies.";
    return {
      error:
        "SLACK_BOT_TOKEN is not set. Install the app and export its xoxb token." +
        appTokenNote +
        "\n",
    };
  }

  const portText = env.PORT ?? String(opts.defaultPort ?? 3001);
  const port = Number(portText);
  if (!/^[0-9]+$/.test(portText) || port <= 0 || port > 65535) {
    return { error: `PORT="${portText}" is not a valid port.\n` };
  }

  return {
    config: {
      port,
      signingSecret,
      botToken,
      appToken: appToken === "" ? undefined : appToken,
    },
  };
}
