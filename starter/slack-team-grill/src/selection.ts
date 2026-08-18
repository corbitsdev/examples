import type { OptionId } from "./types";

export type TeamGrillSelection = {
  sessionId: string;
  round: number;
  optionId: OptionId;
};

export function selectionValue(selection: TeamGrillSelection): string {
  if (selection.sessionId === "" || selection.sessionId.includes(":")) {
    throw new Error("Team Grill session id must be non-empty and contain no colon");
  }
  if (!Number.isInteger(selection.round) || selection.round < 1) {
    throw new Error("Team Grill round must be a positive integer");
  }
  return `${selection.sessionId}:${String(selection.round)}:${selection.optionId}`;
}

export function parseSelectionValue(
  value: string | undefined,
): TeamGrillSelection | undefined {
  if (value === undefined) return undefined;
  const match = /^([^:]+):([1-9]\d*):(a|b|c)$/.exec(value);
  if (match === null) return undefined;
  const round = Number(match[2]);
  if (!Number.isSafeInteger(round)) return undefined;
  return {
    sessionId: match[1]!,
    round,
    optionId: match[3] as OptionId,
  };
}
