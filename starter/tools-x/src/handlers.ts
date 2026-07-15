import { type as arkType } from "arktype";
import type { ToolCall, ToolResult } from "@intx/types/runtime";

import type { XAPIClient } from "./client";
import {
  buildUserRequest,
  DATE_TIME_ARGUMENTS,
  UNIQUE_ARRAY_ARGUMENTS,
  USER_OPERATIONS,
} from "./users/operations";

export type XToolHandler = (
  call: ToolCall,
  signal: AbortSignal,
) => Promise<ToolResult>;

function validationError(callId: string, message: string): ToolResult {
  return {
    callId,
    content: { error: message, code: "invalid_arguments" },
    isError: true,
  };
}

function findDuplicateArrayArgument(
  args: Record<string, unknown>,
): string | undefined {
  for (const name of UNIQUE_ARRAY_ARGUMENTS) {
    const value = args[name];
    if (Array.isArray(value) && new Set(value).size !== value.length) {
      return name;
    }
  }
  return undefined;
}

function isValidUTCDateTime(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(value);
  if (match === null) return false;
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

function findInvalidDateTimeArgument(
  args: Record<string, unknown>,
): string | undefined {
  for (const name of DATE_TIME_ARGUMENTS) {
    const value = args[name];
    if (typeof value === "string" && !isValidUTCDateTime(value)) return name;
  }
  return undefined;
}

export function createUserToolHandlers(
  client: XAPIClient,
): ReadonlyMap<string, XToolHandler> {
  return new Map(
    USER_OPERATIONS.map((operation) => [
      operation.name,
      async (call: ToolCall, signal: AbortSignal): Promise<ToolResult> => {
        const parsed = operation.input(call.arguments);
        if (parsed instanceof arkType.errors) {
          return validationError(call.id, parsed.summary);
        }

        const args = parsed as Record<string, unknown>;
        const duplicateName = findDuplicateArrayArgument(args);
        if (duplicateName !== undefined) {
          return validationError(
            call.id,
            `${JSON.stringify(duplicateName)} must not contain duplicate values`,
          );
        }
        const invalidDateName = findInvalidDateTimeArgument(args);
        if (invalidDateName !== undefined) {
          return validationError(
            call.id,
            `${JSON.stringify(invalidDateName)} must be a valid UTC calendar timestamp`,
          );
        }

        const content = await client.request(
          buildUserRequest(operation, args),
          signal,
        );
        return { callId: call.id, content };
      },
    ]),
  );
}
