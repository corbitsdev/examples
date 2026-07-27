// The triage agent.
//
// One @intx/agent instance, no tools, one turn per message. It reads a
// message the way the recipient would — sender, subject, body — and
// returns the three values the mailbox schema reserves for triage:
// `priority`, `classification`, `status`.
//
// The allowed values are not invented here. The mailbox's triage
// vocabulary is the HOST's — the core ships none — so the same list that
// is handed to `mountMailbox` is handed to this agent. The prompt, the
// validation and the route's `?priority=` enum therefore agree by
// construction: widen the host's vocabulary and the agent widens with it.

import {
  createAgent,
  createDefaultDirectorRegistry,
  defineAgent,
  type BaseEnv,
} from "@intx/agent";
import { noopAuditStore, permissiveAuthorize } from "@intx/agent/testing";
import { createIsogitStore } from "@intx/storage-isogit";
import type { MailboxVocabulary } from "@corbits/mailbox-core";

import type { Source } from "@corbits/example-kit/inference";

export type TriageInput = {
  from: string;
  subject: string;
  body: string;
};

export type Triage = {
  priority: string;
  classification: string;
  status: string;
};

// Classification is a free-text column in the core, which makes it
// unbounded. An example that lets a small model free-associate produces a
// different taxonomy on every run, so this application — not the core —
// fixes its own vocabulary. That choice belongs here: a different
// product would pick a different set against the same column.
export const CLASSIFICATIONS = [
  "billing",
  "legal",
  "operations",
  "security",
  "personal",
  "other",
] as const;

const quoted = (values: readonly string[]) =>
  values.map((v) => `"${v}"`).join(", ");

const systemPrompt = (vocabulary: MailboxVocabulary) =>
  [
    "You triage email for a busy operator.",
    "Reply with a single JSON object and nothing else — no prose, no markdown fence.",
    "The object has exactly three string keys:",
    `  "priority": one of ${quoted(vocabulary.priorities)}`,
    `  "classification": one of ${quoted(CLASSIFICATIONS)}`,
    `  "status": one of ${quoted(vocabulary.statuses)}`,
    "Priorities are listed most urgent first.",
  ].join("\n");

function isClassification(value: string): boolean {
  return (CLASSIFICATIONS as readonly string[]).includes(value);
}

/**
 * Pull the first balanced JSON object out of a reply. Small local models
 * routinely wrap JSON in a ```json fence or a sentence of preamble, so
 * an example that only accepts a bare object would report a model
 * failure that is really a formatting one.
 */
function extractJSONObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseTriage(
  reply: string,
  vocabulary: MailboxVocabulary,
): Triage | null {
  const parsed = extractJSONObject(reply);
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const priority = record.priority;
  const classification = record.classification;
  const status = record.status;
  if (
    typeof priority !== "string" ||
    typeof classification !== "string" ||
    typeof status !== "string"
  ) {
    return null;
  }
  if (!vocabulary.priorities.includes(priority)) return null;
  if (!vocabulary.statuses.includes(status)) return null;
  if (!isClassification(classification)) return null;
  return { priority, classification, status };
}

export type TriageAgent = {
  triage: (input: TriageInput) => Promise<Triage | null>;
  close: () => Promise<void>;
};

/**
 * Build the triage agent against `source` and `workdir`.
 *
 * Every message gets its own send on the same agent, so the audit trail
 * and context store are shared — this is one triager working an inbox,
 * not a new agent per message.
 */
export async function createTriageAgent(opts: {
  source: Source;
  workdir: string;
  vocabulary: MailboxVocabulary;
}): Promise<TriageAgent> {
  const { source, workdir, vocabulary } = opts;

  const definition = defineAgent({
    id: "inbox-triage",
    systemPrompt: systemPrompt(vocabulary),
    tools: [],
    capabilities: [],
    inference: {
      sources: [{ provider: source.provider, model: source.model }],
    },
  });

  const storage = await createIsogitStore(workdir);
  const env: BaseEnv = {
    sources: [source],
    defaultSource: source.id,
    storage,
    workdir,
    audit: noopAuditStore(),
    authorize: permissiveAuthorize(),
    directors: createDefaultDirectorRegistry(),
  };

  const agent = await createAgent(definition, env);

  return {
    async triage(input) {
      const prompt = [
        `From: ${input.from}`,
        `Subject: ${input.subject}`,
        "",
        input.body,
      ].join("\n");

      // One retry with the failure named. A small model that returns prose
      // on the first turn usually complies once told exactly what was
      // wrong; a second failure is a real failure and is reported as one
      // rather than papered over with a default.
      const first = await agent.send(prompt);
      const parsedFirst = parseTriage(first.reply, vocabulary);
      if (parsedFirst !== null) return parsedFirst;

      const retry = await agent.send(
        "That was not a valid triage object. Reply with ONLY the JSON " +
          "object, using exactly the three keys and the allowed values.",
      );
      return parseTriage(retry.reply, vocabulary);
    },
    close: () => agent.close(),
  };
}
