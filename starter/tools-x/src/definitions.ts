import type { ToolDefinition } from "@intx/types/runtime";

import { USER_OPERATIONS } from "./users/operations";

export const TOOL_DEFINITIONS: ToolDefinition[] = USER_OPERATIONS.map(
  (operation) => ({
    name: operation.name,
    description: operation.description,
    inputSchema: operation.inputSchema,
  }),
);
