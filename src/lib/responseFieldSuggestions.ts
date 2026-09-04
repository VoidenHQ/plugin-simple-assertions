/**
 * Response-derived autocomplete suggestions for the assertions table's
 * "Field" column (issue #548: parse response bodies to help build
 * assertions; autocomplete based on response structure).
 *
 * Reads the last response stored for the tab the assertions table lives in
 * and turns it into concrete `body.<path>` / `header.<Name>` (response
 * headers) / `requestHeader.<Name>` (headers actually sent) suggestions, on
 * top of the fixed keyword list already registered in plugin.ts.
 *
 * Known limitation: useResponseStore.getResponse(tabId) returns the
 * *latest* section's response for the tab, not necessarily the section the
 * assertions table being edited belongs to (a doc can have multiple
 * request sections). Fine for the common single-request-per-tab case;
 * revisit with section-aware lookup (getResponsesForTab) if multi-section
 * accuracy turns out to matter.
 */

import { parse as losslessParse, isLosslessNumber } from "lossless-json";
// Host-provided store — resolved at runtime via the plugin's build shim
// (see build.mjs's CORE_EXPORTS), same pattern voiden-stitch/voiden-mcp-tool
// already use to read live app state from a plugin.
import { useResponseStore } from "@/core/request-engine/stores/responseStore";

export interface FieldSuggestion {
  label: string;
  description?: string;
}

// Exported so ResponseFieldPicker.tsx (issue #548's "generate from response"
// panel on the assertions table itself) can reuse the same caps/flattening
// instead of a second copy.
export const MAX_PATHS = 200;
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 3; // sample only the first few items of long arrays

/** JSON identifiers can be dotted directly; everything else needs bracket + quotes. */
const isSafeIdentifier = (key: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);

/**
 * Flatten a parsed JSON value into a list of `{ path, value }` leaves/nodes,
 * e.g. `{ data: [{ id: 1 }] }` -> `data`, `data[0]`, `data[0].id`.
 * Capped on depth and total path count so a huge/deeply-nested response
 * body can't stall the UI while typing.
 */
export function flattenJsonPaths(value: unknown): Array<{ path: string; value: unknown }> {
  const results: Array<{ path: string; value: unknown }> = [];

  const walk = (node: unknown, path: string, depth: number) => {
    if (results.length >= MAX_PATHS) return;
    if (path) results.push({ path, value: node });

    if (depth >= MAX_DEPTH || node === null || node === undefined) return;
    if (isLosslessNumber(node)) return; // leaf — don't descend into its internals

    if (Array.isArray(node)) {
      const limit = Math.min(node.length, MAX_ARRAY_ITEMS);
      for (let i = 0; i < limit && results.length < MAX_PATHS; i++) {
        walk(node[i], `${path}[${i}]`, depth + 1);
      }
      return;
    }

    if (typeof node === "object") {
      for (const key of Object.keys(node as Record<string, unknown>)) {
        if (results.length >= MAX_PATHS) break;
        const segment = isSafeIdentifier(key) ? `.${key}` : `["${key.replace(/"/g, '\\"')}"]`;
        walk((node as Record<string, unknown>)[key], `${path}${segment}`, depth + 1);
      }
    }
  };

  walk(value, "", 0);
  return results;
}

/** Short, human-readable preview of a leaf value for the suggestion's description. */
function previewValue(value: unknown): string {
  const text = isLosslessNumber(value)
    ? value.toString()
    : typeof value === "string"
      ? JSON.stringify(value)
      : JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

/** Find the `response-body` node's raw body string inside a stored responseDoc. */
export function getResponseBodyString(responseDoc: any): string | null {
  const responseDocNode = responseDoc?.content?.find((n: any) => n?.type === "response-doc");
  const bodyNode = responseDocNode?.content?.find((n: any) => n?.type === "response-body");
  const body = bodyNode?.attrs?.body;
  return typeof body === "string" ? body : null;
}

/** Find the `response-headers` node's header list inside a stored responseDoc. */
export function getResponseHeaders(responseDoc: any): Array<{ key: string; value: string }> {
  const responseDocNode = responseDoc?.content?.find((n: any) => n?.type === "response-doc");
  const headersNode = responseDocNode?.content?.find((n: any) => n?.type === "response-headers");
  return Array.isArray(headersNode?.attrs?.headers) ? headersNode.attrs.headers : [];
}

/** Find the `request-headers` node's header list (headers actually sent) inside a stored responseDoc. */
export function getRequestHeaders(responseDoc: any): Array<{ key: string; value: string }> {
  const responseDocNode = responseDoc?.content?.find((n: any) => n?.type === "response-doc");
  const headersNode = responseDocNode?.content?.find((n: any) => n?.type === "request-headers");
  return Array.isArray(headersNode?.attrs?.headers) ? headersNode.attrs.headers : [];
}

/**
 * Build Field-column suggestions from the given tab's last response, if any.
 * Returns [] (never throws) when there's no response yet or the body isn't
 * valid JSON — callers should treat this as "nothing extra to add".
 */
export function getResponseFieldSuggestions(tabId: string | undefined): FieldSuggestion[] {
  if (!tabId) return [];

  let responseDoc: any;
  try {
    responseDoc = useResponseStore?.getState?.()?.getResponse?.(tabId)?.responseDoc;
  } catch {
    return [];
  }
  if (!responseDoc) return [];

  const suggestions: FieldSuggestion[] = [];

  for (const header of getResponseHeaders(responseDoc)) {
    if (!header?.key) continue;
    suggestions.push({
      label: `header.${header.key}`,
      description: previewValue(header.value ?? ""),
    });
  }

  for (const header of getRequestHeaders(responseDoc)) {
    if (!header?.key) continue;
    suggestions.push({
      label: `requestHeader.${header.key}`,
      description: previewValue(header.value ?? ""),
    });
  }

  const bodyText = getResponseBodyString(responseDoc);
  if (bodyText) {
    try {
      const parsed = losslessParse(bodyText);
      for (const { path, value } of flattenJsonPaths(parsed)) {
        suggestions.push({
          label: `body${path}`,
          description: previewValue(value),
        });
      }
    } catch {
      // Not JSON (or malformed) — body./header. keyword suggestions from
      // plugin.ts's static list still cover this case, so just skip.
    }
  }

  return suggestions;
}
