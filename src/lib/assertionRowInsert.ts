/**
 * Row-insertion helpers for the assertions-table (issue #548, "Feature
 * Suggestions" section: "Add one-click assertion generation directly from
 * the response" / "Automatically convert response values into assertions").
 *
 * Used by ResponseFieldPicker.tsx, which renders directly inside the
 * assertions-table's own node view (AssertionsTable.tsx) — so unlike an
 * earlier version of this feature, there's no cross-plugin/cross-editor
 * bridging needed here: the picker already has the live `editor`, and the
 * exact `node`/`getPos()` of the table it should append into, straight from
 * its own NodeViewProps. No "which tab/section is this" guesswork.
 */

const cellJson = (text?: string) => ({
  type: "tableCell",
  content: [text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" }],
});

/** Build one Description/Field/Operator/Expected-Value tableRow, matching insertAssertionsTable()'s row shape (utils.ts). */
export function buildAssertionRowJson(row: {
  description?: string;
  field: string;
  operator: string;
  expectedValue: string;
}) {
  return {
    type: "tableRow",
    content: [
      cellJson(row.description),
      cellJson(row.field),
      cellJson(row.operator),
      cellJson(row.expectedValue),
    ],
  };
}

/**
 * Field-column (2nd cell) text of every row already in this assertions-table
 * — lets a caller skip re-adding a field that's already asserted instead of
 * piling up duplicate rows every time "Generate assertions" (or the same
 * leaf's "+") is clicked again for a response that hasn't changed.
 */
export function getExistingFields(tableNode: any): Set<string> {
  const fields = new Set<string>();
  const table = tableNode?.firstChild; // assertions-table's one child is the real `table` node
  if (!table) return fields;
  table.forEach((row: any) => {
    if (row.childCount < 2) return; // malformed row — no Field cell to read
    const fieldCell = row.child(1); // 0=Description, 1=Field, 2=Operator, 3=Expected Value
    let text = "";
    fieldCell.descendants((n: any) => {
      if (n.isText) text += n.text;
    });
    text = text.trim();
    if (text) fields.add(text);
  });
  return fields;
}

/** True when every cell in `row` has no non-whitespace text — same "empty row" definition pipelineHook.ts's extractTableData() already skips. */
function isRowEmpty(row: any): boolean {
  let hasText = false;
  row.descendants((n: any) => {
    if (n.isText && n.text.trim()) hasText = true;
  });
  return !hasText;
}

/**
 * Append `rowJson` as the new last row of the assertions-table at `tablePos`
 * (its node view's own getPos()) / `tableNode` (its own `node`) — first
 * dropping any fully-empty rows (e.g. insertAssertionsTable()'s trailing
 * "type your own" blank row), so generating from the response doesn't leave
 * a dangling blank row sitting alongside the generated ones.
 *
 * Replaces the table's entire row content in one shot (kept rows + the new
 * one) rather than deleting empty rows and inserting the new row as two
 * separate operations: the table's content schema requires at least one
 * tableRow, so deleting the *only* row on its own (the case where that row
 * was the empty placeholder) would leave the table transiently below that
 * minimum — a plain delete step can't produce that, so ProseMirror's own
 * schema-repair silently pads a fresh blank row right back in, defeating
 * the whole point. A single replace of [kept rows..., new row] is always
 * >=1 row post-replace, so that minimum is never actually violated.
 */
export function appendRowToTable(editor: any, tablePos: number, tableNode: any, rowJson: any): boolean {
  const currentTable = editor.state.doc.nodeAt(tablePos) ?? tableNode;
  const realTable = currentTable?.firstChild; // assertions-table's one child is the real `table` node
  if (!realTable) return false;

  const keptRowsJson: any[] = [];
  realTable.forEach((row: any) => {
    if (!isRowEmpty(row)) keptRowsJson.push(row.toJSON());
  });

  const tableContentStart = tablePos + 2; // past assertions-table's own open token + table's open token
  const tableContentEnd = tableContentStart + realTable.content.size;

  editor.chain().insertContentAt({ from: tableContentStart, to: tableContentEnd }, [...keptRowsJson, rowJson]).run();
  return true;
}
