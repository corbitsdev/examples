export function parseDiligenceInput(
  text: string,
): { company: string; website: string } | undefined {
  const match = text.match(/https?:\/\/[^\s<>()|]+/iu);
  if (match === null) return undefined;

  const rawWebsite = match[0].replace(/[.,;!?]+$/u, "");
  let website: string;
  try {
    website = new URL(rawWebsite).toString().replace(/\/$/u, "");
  } catch {
    return undefined;
  }

  const company = text
    .replace(/<https?:\/\/[^|>]+(?:\|[^>]+)?>/gu, " ")
    .replace(match[0], " ")
    .replace(/^\s*(?:<@[A-Z0-9]+>|@[\w.-]+)\s*/iu, "")
    .replace(/^[\s|:—–-]+|[\s|:—–-]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

  return company === "" ? undefined : { company, website };
}
