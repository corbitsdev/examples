export type ValidatedPost = Readonly<{
  text: string;
  characterCount: number;
  limit: 280;
}>;

export function validatePost(input: unknown): ValidatedPost {
  if (typeof input !== "string") {
    throw new Error("draft step must return post text");
  }

  const text = input.trim().normalize("NFC");
  if (text === "") throw new Error("draft must contain non-empty post text");

  const characterCount = Array.from(text).length;
  if (characterCount > 280) {
    throw new Error(
      `draft exceeds the local character limit (${String(characterCount)}/280)`,
    );
  }

  return Object.freeze({ text, characterCount, limit: 280 });
}

export function requireValidatedPost(input: unknown): ValidatedPost {
  if (
    !isRecord(input) ||
    typeof input.text !== "string" ||
    typeof input.characterCount !== "number" ||
    input.limit !== 280
  ) {
    throw new Error("publish input must be validated post text");
  }

  const post = validatePost(input.text);
  if (post.characterCount !== input.characterCount) {
    throw new Error("publish input character count does not match its text");
  }
  return post;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
