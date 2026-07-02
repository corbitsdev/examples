export type SlackThreadRef = {
  teamId: string | undefined;
  channel: string;
  threadTs: string;
};

export type SlackThreadSessionStore<TSession> = {
  get: (key: string) => TSession | undefined;
  set: (key: string, session: TSession) => void;
  delete: (key: string) => void;
  getActive: (key: string) => TSession | undefined;
};

export function createSlackThreadSessionStore<TSession>(
  isActive: (session: TSession) => boolean,
): SlackThreadSessionStore<TSession> {
  const sessions = new Map<string, TSession>();

  return {
    get: (key) => sessions.get(key),
    set: (key, session) => {
      sessions.set(key, session);
    },
    delete: (key) => {
      sessions.delete(key);
    },
    getActive: (key) => {
      const session = sessions.get(key);
      return session !== undefined && isActive(session) ? session : undefined;
    },
  };
}

export function slackThreadKey(thread: SlackThreadRef): string {
  return [thread.teamId ?? "unknown-team", thread.channel, thread.threadTs].join(
    "-",
  );
}

export function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 180);
}
