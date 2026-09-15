import { truncateLine } from "@earendil-works/pi-coding-agent";

/** Derive the marker from the host helper so wording changes remain compatible. */
const LINE_CUT_MARKER = truncateLine("x", 0).text;

const NOTICE_OPENING = "\n\n[";
const NOTICE_CLOSING = "]";

/** Find host cuts because they may leave credential prefixes beyond complete value redaction. */
export function cutPositionsIn(text: string, truncated: boolean): number[] {
  const cuts: number[] = [];
  for (let index = text.indexOf(LINE_CUT_MARKER); index !== -1; index = text.indexOf(LINE_CUT_MARKER, index + 1)) {
    cuts.push(index);
  }
  if (truncated) cuts.push(noticeStart(text));
  return cuts;
}

export function reportsTruncation(details: unknown): boolean {
  const truncation = (details as { truncation?: { truncated?: unknown } } | undefined)?.truncation;
  return truncation?.truncated === true;
}

function noticeStart(text: string): number {
  if (!text.endsWith(NOTICE_CLOSING)) return text.length;
  const opening = text.lastIndexOf(NOTICE_OPENING);
  return opening === -1 ? text.length : opening;
}
