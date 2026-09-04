/**
 * Response Field Picker
 *
 * Collapsible panel rendered inside the assertions-table's own node view
 * (AssertionsTable.tsx) — issue #548's "Add one-click assertion generation
 * directly from the response" / "Automatically convert response values into
 * assertions", moved to live on the assertions table itself rather than in
 * the response body viewer, since the table already has everything it
 * needs (its own `editor`/`node`/`getPos()`) without any cross-plugin or
 * cross-editor bridging.
 *
 * Covers all three sources an assertion can actually check against
 * (assertionEngine.ts's extractFieldValue): the response body (`body.<path>`,
 * a JSON tree), the response headers (`header.<Name>`), and the request
 * headers actually sent (`requestHeader.<Name>`) — not just the body.
 *
 * Shows the *last response for this table's own request section* (not just
 * "the tab's latest response" — a multi-request .void file can have one
 * assertions-table per section, so this reads useResponseStore reactively
 * keyed by this table's own computed sectionIndex, correctly re-rendering
 * when a new response comes in).
 */

import * as React from "react";
import { Check, CheckCheck, ChevronDown, ChevronRight, Plus, Sparkles, X } from "lucide-react";
import { isLosslessNumber, parse as losslessParse } from "lossless-json";
// Host-provided store — resolved at runtime via the plugin's build shim
// (see build.mjs's CORE_EXPORTS), same pattern responseFieldSuggestions.ts
// already uses.
import { useResponseStore } from "@/core/request-engine/stores/responseStore";
import {
  getRequestHeaders,
  getResponseBodyString,
  getResponseHeaders,
  MAX_PATHS,
} from "../lib/responseFieldSuggestions";
import { appendRowToTable, buildAssertionRowJson, getExistingFields } from "../lib/assertionRowInsert";

/** Result of trying to add one field: added a new row, skipped because that
 * field already has a row, or the insert itself failed. */
type AddFieldOutcome = "added" | "duplicate" | "failed";

const MAX_ARRAY_ITEMS_GENERATE = 3; // how many array items "Generate all" samples
const AUTO_COLLAPSE_CHILD_COUNT = 20; // objects/arrays past this size start collapsed

/**
 * Section index of the position `pos` (an assertions-table node's own
 * getPos()) — same convention as extractSectionIndex()/requestOrchestrator.ts:
 * section 0 is everything before the first request-separator; section N
 * (N>=1) starts at the Nth separator.
 */
export function sectionIndexForPos(doc: any, pos: number): number {
  let count = 0;
  doc.forEach((child: any, offset: number) => {
    if (offset < pos && child.type.name === "request-separator") count++;
  });
  return count;
}

const isSafeIdentifier = (key: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);

function childSegment(key: string | number, isArrayIndex: boolean): string {
  if (isArrayIndex) return `[${key}]`;
  const k = String(key);
  return isSafeIdentifier(k) ? `.${k}` : `["${k.replace(/"/g, '\\"')}"]`;
}

function isScalar(v: unknown): boolean {
  return v === null || v === undefined || typeof v !== "object";
}

function formatScalar(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return JSON.stringify(v);
  if (isLosslessNumber(v)) return (v as any).toString();
  return String(v);
}

/**
 * The string the assertion engine's `equals` operator will actually compare
 * against — it does `String(actualValue) === expectedValue`
 * (assertionEngine.ts). Note: for a `null` leaf this will never match — the
 * engine treats null/undefined actualValue as never-equal, a pre-existing
 * engine quirk, not something generated rows work around.
 */
function assertableString(v: unknown): string {
  if (v === null) return "null";
  if (isLosslessNumber(v)) return (v as any).toString();
  return String(v);
}

type RowStatus = { state: "idle" | "ok" | "error" };
type Leaf = { path: string; value: unknown };

export interface ResponseFieldPickerProps {
  editor: any;
  node: any;
  getPos: () => number;
}

function collectBodyLeaves(value: unknown, path: string): Leaf[] {
  const results: Leaf[] = [];
  const walk = (node: unknown, p: string, depth: number) => {
    if (results.length >= MAX_PATHS) return;
    if (isScalar(node)) {
      if (p !== path) results.push({ path: p, value: node });
      return;
    }
    if (depth >= 6) return;
    if (Array.isArray(node)) {
      const limit = Math.min(node.length, MAX_ARRAY_ITEMS_GENERATE);
      for (let i = 0; i < limit && results.length < MAX_PATHS; i++) {
        walk(node[i], `${p}${childSegment(i, true)}`, depth + 1);
      }
      return;
    }
    for (const key of Object.keys(node as Record<string, unknown>)) {
      if (results.length >= MAX_PATHS) break;
      walk((node as Record<string, unknown>)[key], `${p}${childSegment(key, false)}`, depth + 1);
    }
  };
  walk(value, path, 0);
  return results;
}

export const ResponseFieldPicker: React.FC<ResponseFieldPickerProps> = ({ editor, node, getPos }) => {
  const [expanded, setExpanded] = React.useState(false);
  const tabId: string | undefined = editor?.storage?.tabId;

  // Section this table belongs to is a live document position, not a fixed
  // prop — recompute on every render (cheap: one top-level doc.forEach).
  const sectionIndex = React.useMemo(() => {
    try {
      return sectionIndexForPos(editor.state.doc, getPos());
    } catch {
      return 0;
    }
  }, [editor, getPos, node]);

  // Reactive: re-renders as soon as this section's response changes (e.g.
  // the user runs the request while this panel is open).
  const sectionResponse = useResponseStore((s) => (tabId ? s.responses[tabId]?.[sectionIndex] : undefined));

  const parsedBody = React.useMemo(() => {
    const bodyText = getResponseBodyString(sectionResponse?.responseDoc);
    if (!bodyText) return null;
    try {
      return losslessParse(bodyText);
    } catch {
      return null;
    }
  }, [sectionResponse]);

  const responseHeaders = React.useMemo(() => getResponseHeaders(sectionResponse?.responseDoc), [sectionResponse]);
  const requestHeaders = React.useMemo(() => getRequestHeaders(sectionResponse?.responseDoc), [sectionResponse]);

  const bodyLeaves = React.useMemo(() => (parsedBody !== null ? collectBodyLeaves(parsedBody, "body") : []), [parsedBody]);
  const responseHeaderLeaves = React.useMemo(
    () => responseHeaders.filter((h) => h?.key).map((h): Leaf => ({ path: `header.${h.key}`, value: h.value ?? "" })),
    [responseHeaders]
  );
  const requestHeaderLeaves = React.useMemo(
    () => requestHeaders.filter((h) => h?.key).map((h): Leaf => ({ path: `requestHeader.${h.key}`, value: h.value ?? "" })),
    [requestHeaders]
  );

  const hasAnything = parsedBody !== null || responseHeaders.length > 0 || requestHeaders.length > 0;

  // Field-column text of every row already in this table — recomputed
  // whenever the table's own node changes (including right after this same
  // picker appends a row), so re-opening "Generate" on an unchanged
  // response can't pile up duplicate rows.
  const existingFields = React.useMemo(() => getExistingFields(node), [node]);

  const handleAddField = React.useCallback(
    (field: string, expectedValue: string): AddFieldOutcome => {
      if (existingFields.has(field)) return "duplicate";
      const rowJson = buildAssertionRowJson({
        description: `Assert ${field}`,
        field,
        operator: "equals",
        expectedValue,
      });
      return appendRowToTable(editor, getPos(), node, rowJson) ? "added" : "failed";
    },
    [editor, getPos, node, existingFields]
  );

  const toggleButtonRef = React.useRef<HTMLButtonElement>(null);

  // Escape collapses the whole panel and returns focus to its toggle,
  // wherever inside it the user currently has focus — a plain click-only
  // affordance has no equivalent "back out" gesture for a keyboard user.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setExpanded(false);
      toggleButtonRef.current?.focus();
    }
  };

  if (!hasAnything && !expanded) {
    // Nothing to offer yet and the user hasn't opened it — stay out of the way.
    return null;
  }

  return (
    <div className="border-t border-border" style={{ userSelect: "text" }} contentEditable={false} onKeyDown={handleKeyDown}>
      <button
        ref={toggleButtonRef}
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-comment hover:bg-active transition-colors"
        style={{ cursor: "pointer" }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Sparkles size={12} />
        Generate from response
      </button>
      {expanded && (
        hasAnything ? (
          <div className="text-xs" style={{ fontFamily: "var(--font-family-mono)" }}>
            <FieldGroup title="Request Headers" leaves={requestHeaderLeaves} existingFields={existingFields} onAddField={handleAddField} defaultCollapsed>
              {requestHeaders.filter((h) => h?.key).map((h) => (
                <TreeNode
                  key={h.key}
                  value={h.value ?? ""}
                  path={`requestHeader.${h.key}`}
                  label={h.key}
                  depth={0}
                  existingFields={existingFields}
                  onAddField={handleAddField}
                />
              ))}
            </FieldGroup>
            <FieldGroup title="Response Headers" leaves={responseHeaderLeaves} existingFields={existingFields} onAddField={handleAddField} defaultCollapsed>
              {responseHeaders.filter((h) => h?.key).map((h) => (
                <TreeNode
                  key={h.key}
                  value={h.value ?? ""}
                  path={`header.${h.key}`}
                  label={h.key}
                  depth={0}
                  existingFields={existingFields}
                  onAddField={handleAddField}
                />
              ))}
            </FieldGroup>
            <FieldGroup title="Body" leaves={bodyLeaves} existingFields={existingFields} onAddField={handleAddField}>
              {parsedBody !== null && (
                <TreeNode value={parsedBody} path="body" depth={0} existingFields={existingFields} onAddField={handleAddField} />
              )}
            </FieldGroup>
          </div>
        ) : (
          <div className="px-3 py-2 text-xs text-comment" style={{ opacity: 0.7 }}>
            No response for this request yet — run it to generate assertions from it.
          </div>
        )
      )}
    </div>
  );
};

/**
 * One "Body" / "Response Headers" / "Request Headers" section: an
 * independently collapsible header bar with a field count + "Generate all"
 * bulk button, and whatever rows the caller renders below it (a flat
 * header-row list, or the nested body TreeNode) when expanded. Hidden
 * entirely when this group has nothing at all (e.g. no request headers were
 * sent).
 *
 * The collapse toggle and "Generate all" are two separate, independently
 * focusable <button>s (not a div-with-onClick) so Tab reaches both and
 * Enter/Space activates whichever has focus — same reasoning as TreeNode's
 * expand toggle below.
 */
const FieldGroup: React.FC<{
  title: string;
  leaves: Leaf[];
  existingFields: Set<string>;
  onAddField: (field: string, expectedValue: string) => AddFieldOutcome;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}> = ({ title, leaves, existingFields, onAddField, children, defaultCollapsed = false }) => {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const [status, setStatus] = React.useState<RowStatus>({ state: "idle" });
  const newLeaves = React.useMemo(() => leaves.filter((l) => !existingFields.has(l.path)), [leaves, existingFields]);
  const allAsserted = leaves.length > 0 && newLeaves.length === 0;

  const handleGenerateAll = () => {
    if (newLeaves.length === 0) return;
    let addedAny = false;
    for (const leaf of newLeaves) {
      if (onAddField(leaf.path, assertableString(leaf.value)) === "added") addedAny = true;
    }
    setStatus({ state: addedAny ? "ok" : "error" });
    window.setTimeout(() => setStatus({ state: "idle" }), 2000);
  };

  if (leaves.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between px-1 py-0.5 border-t border-border">
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded text-comment hover:bg-active transition-colors text-left"
          style={{ cursor: "pointer" }}
        >
          {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
          <span style={{ opacity: 0.7 }}>
            {title} — {leaves.length >= MAX_PATHS ? `first ${MAX_PATHS}` : leaves.length}
            {newLeaves.length !== leaves.length && !allAsserted ? ` (${newLeaves.length} new)` : ""}
          </span>
        </button>
        <button
          onClick={handleGenerateAll}
          disabled={allAsserted}
          className={`flex items-center gap-1 px-2 py-0.5 rounded ${allAsserted ? "text-comment opacity-50" : "text-comment hover:bg-active"}`}
          style={{ cursor: allAsserted ? "default" : "pointer" }}
          title={allAsserted ? `Every field in ${title} already has an assertion` : `Add an assertion row for every new field in ${title}`}
        >
          {allAsserted ? (
            <CheckCheck size={11} />
          ) : status.state === "ok" ? (
            <Check size={11} className="text-status-success" />
          ) : status.state === "error" ? (
            <X size={11} className="text-status-error" />
          ) : (
            <Plus size={11} />
          )}
          {allAsserted ? "All asserted" : "Generate all"}
        </button>
      </div>
      {!collapsed && <div className="px-2 py-1 max-h-64 overflow-auto">{children}</div>}
    </div>
  );
};

const TreeNode: React.FC<{
  value: unknown;
  path: string;
  label?: string;
  depth: number;
  existingFields: Set<string>;
  onAddField: (field: string, expectedValue: string) => AddFieldOutcome;
}> = ({ value, path, label, depth, existingFields, onAddField }) => {
  const isObj = !isScalar(value);
  const isArray = Array.isArray(value);
  const entries: Array<[string | number, unknown, boolean]> = isObj
    ? isArray
      ? (value as unknown[]).map((v, i) => [i, v, true] as [number, unknown, boolean])
      : Object.keys(value as object).map((k) => [k, (value as any)[k], false] as [string, unknown, boolean])
    : [];
  const [collapsed, setCollapsed] = React.useState(entries.length > AUTO_COLLAPSE_CHILD_COUNT);
  const [status, setStatus] = React.useState<RowStatus>({ state: "idle" });
  const alreadyAsserted = existingFields.has(path);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (alreadyAsserted) return;
    const outcome = onAddField(path, assertableString(value));
    setStatus({ state: outcome === "added" ? "ok" : "error" });
    window.setTimeout(() => setStatus({ state: "idle" }), 2000);
  };

  if (!isObj) {
    return (
      <div className="flex items-center gap-1.5 py-0.5 group" style={{ paddingLeft: depth * 14 }}>
        {label !== undefined && <span className="text-accent">{label}</span>}
        {label !== undefined && <span className="text-comment">:</span>}
        <span style={{ opacity: 0.85 }}>{formatScalar(value)}</span>
        <button
          onClick={handleAdd}
          disabled={alreadyAsserted}
          aria-label={alreadyAsserted ? `Already asserted: ${path}` : `Add assertion for ${path}`}
          className={`px-1 rounded text-comment transition-opacity ${
            alreadyAsserted ? "opacity-60" : "opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-active"
          }`}
          style={{ cursor: alreadyAsserted ? "default" : "pointer" }}
          title={alreadyAsserted ? `Already asserted: ${path}` : `Add assertion for ${path}`}
        >
          {alreadyAsserted ? (
            <CheckCheck size={11} />
          ) : status.state === "ok" ? (
            <Check size={11} className="text-status-success" />
          ) : status.state === "error" ? (
            <X size={11} className="text-status-error" />
          ) : (
            <Plus size={11} />
          )}
        </button>
      </div>
    );
  }

  return (
    <div>
      {entries.length > 0 ? (
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="w-full flex items-center gap-1 py-0.5 rounded text-left hover:bg-active"
          style={{ paddingLeft: depth * 14, cursor: "pointer" }}
        >
          {collapsed ? <ChevronRight size={11} className="text-comment" /> : <ChevronDown size={11} className="text-comment" />}
          {label !== undefined && <span className="text-accent">{label}</span>}
          {label !== undefined && <span className="text-comment">:</span>}
          <span className="text-comment" style={{ opacity: 0.7 }}>
            {isArray ? `Array(${entries.length})` : `Object(${entries.length})`}
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: depth * 14 }}>
          <span style={{ width: 11, display: "inline-block" }} />
          {label !== undefined && <span className="text-accent">{label}</span>}
          {label !== undefined && <span className="text-comment">:</span>}
          <span className="text-comment" style={{ opacity: 0.7 }}>
            {isArray ? "Array(0)" : "Object(0)"}
          </span>
        </div>
      )}
      {!collapsed &&
        entries.map(([key, v, isIdx]) => (
          <TreeNode
            key={String(key)}
            value={v}
            path={`${path}${childSegment(key, isIdx)}`}
            label={String(key)}
            depth={depth + 1}
            existingFields={existingFields}
            onAddField={onAddField}
          />
        ))}
    </div>
  );
};
