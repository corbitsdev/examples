import { defineTool, type BaseEnv } from "@intx/agent";

import type {
  GrillComplete,
  GrillOption,
  GrillQuestion,
  GrillReport,
  OptionId,
} from "./types";

export const PRESENT_QUESTION = "grill_present_question";
export const PRESENT_COMPLETE = "grill_present_complete";
export const PRESENT_REPORT = "grill_present_report";

type TurnEnv = BaseEnv & {
  round: number;
  sink: (value: GrillQuestion | GrillComplete) => void;
};

type ReportEnv = BaseEnv & {
  sink: (value: GrillReport) => void;
};

const optionIds: OptionId[] = ["a", "b", "c"];

export function createTurnTools() {
  return defineTool<TurnEnv>({
    id: "@corbits/example-team-grill/turn",
    requires: ["round", "sink"],
    factory: (env) => ({
      definitions: [
        {
          name: PRESENT_QUESTION,
          description:
            "Submit the next unresolved decision with exactly three concrete options and one recommendation.",
          inputSchema: {
            type: "object",
            properties: {
              question: { type: "string", minLength: 10, maxLength: 240 },
              context: { type: "string", minLength: 1, maxLength: 180 },
              options: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", enum: optionIds },
                    title: { type: "string", minLength: 1, maxLength: 55 },
                    detail: { type: "string", minLength: 1, maxLength: 140 },
                  },
                  required: ["id", "title", "detail"],
                  additionalProperties: false,
                },
              },
              recommendedOptionId: { type: "string", enum: optionIds },
            },
            required: [
              "question",
              "context",
              "options",
              "recommendedOptionId",
            ],
            additionalProperties: false,
          },
        },
        {
          name: PRESENT_COMPLETE,
          description:
            "Confirm that the finalized decisions now form a shared understanding and no decision branch remains unresolved.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
      ],
      async run(call) {
        try {
          if (call.name === PRESENT_COMPLETE) {
            const value: GrillComplete = { needsQuestion: false };
            env.sink(value);
            return success(call.id, value, "Shared understanding reached");
          }
          if (call.name !== PRESENT_QUESTION) {
            return failure(call.id, `Unknown tool ${call.name}`);
          }
          const options = requiredArray(call.arguments.options, "options").map(
            parseOption,
          );
          if (
            options.length !== 3 ||
            options.some((option, index) => option.id !== optionIds[index])
          ) {
            throw new Error("options must appear once each in a, b, c order");
          }
          const value: GrillQuestion = {
            needsQuestion: true,
            round: env.round,
            question: requiredString(call.arguments.question, "question"),
            context: requiredString(call.arguments.context, "context"),
            options: [
              requiredOption(options[0]),
              requiredOption(options[1]),
              requiredOption(options[2]),
            ],
            recommendedOptionId: requiredOptionId(
              call.arguments.recommendedOptionId,
              "recommendedOptionId",
            ),
          };
          env.sink(value);
          return success(call.id, value, "Question accepted");
        } catch (error) {
          return failure(call.id, errorMessage(error));
        }
      },
    }),
  });
}

export function createReportTools() {
  return defineTool<ReportEnv>({
    id: "@corbits/example-team-grill/report",
    requires: ["sink"],
    factory: (env) => ({
      definitions: [
        {
          name: PRESENT_REPORT,
          description:
            "Submit the final conclusion and any genuinely unresolved facts.",
          inputSchema: {
            type: "object",
            properties: {
              conclusion: {
                type: "string",
                minLength: 10,
                maxLength: 700,
              },
              openItems: {
                type: "array",
                maxItems: 5,
                items: { type: "string", minLength: 1, maxLength: 180 },
              },
            },
            required: ["conclusion", "openItems"],
            additionalProperties: false,
          },
        },
      ],
      async run(call) {
        try {
          if (call.name !== PRESENT_REPORT) {
            return failure(call.id, `Unknown tool ${call.name}`);
          }
          const value: GrillReport = {
            conclusion: requiredString(
              call.arguments.conclusion,
              "conclusion",
            ),
            openItems: requiredArray(call.arguments.openItems, "openItems").map(
              (item) => requiredString(item, "openItem"),
            ),
          };
          env.sink(value);
          return success(call.id, value, "Report accepted");
        } catch (error) {
          return failure(call.id, errorMessage(error));
        }
      },
    }),
  });
}

function parseOption(value: unknown): GrillOption {
  const record = requiredRecord(value, "option");
  return {
    id: requiredOptionId(record.id, "option.id"),
    title: requiredString(record.title, "option.title"),
    detail: requiredString(record.detail, "option.detail"),
  };
}

function requiredOption(value: GrillOption | undefined): GrillOption {
  if (value === undefined) throw new Error("all three options are required");
  return value;
}

function requiredOptionId(value: unknown, name: string): OptionId {
  if (typeof value !== "string" || !optionIds.includes(value as OptionId)) {
    throw new Error(`${name} must be a, b, or c`);
  }
  return value as OptionId;
}

function requiredRecord(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function success(callId: string, detail: unknown, content: string) {
  return { callId, content, detail };
}

function failure(callId: string, content: string) {
  return { callId, content, isError: true as const };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
