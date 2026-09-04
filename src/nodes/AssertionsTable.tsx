/* eslint-disable react/display-name */
import { mergeAttributes, Node, NodeViewProps } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { ResponseFieldPicker } from "../components/ResponseFieldPicker";

// Base table wrapper node for assertions
const TableWrapperNode = Node.create({
  name: "assertions-table-wrapper",
  group: "block",
  content: "table",
  parseHTML() {
    return [{ tag: "assertions-table-wrapper" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "assertions-table-wrapper",
      mergeAttributes(HTMLAttributes, {
        class: "w-full overflow-auto",
      }),
      0,
    ];
  },
});

const createNodeView =
  (title: string, RequestBlockHeader: any, openFile?: (relativePath: string) => Promise<void>) =>
  ({ editor, node, getPos }: NodeViewProps) => {
    const isEditable = !node?.attrs?.importedFrom;
    return (
      <NodeViewWrapper spellCheck="false" className="my-3">
        <div className="rounded-md border overflow-hidden" style={{ borderColor: 'var(--ui-line)' }}>
          <RequestBlockHeader
            title={title}
            editor={editor}
            blockType="assertions-table"
            importedDocumentId={node.attrs.importedFrom}
          />
          <div
            className="w-full max-w-full assertions-table-container"
            contentEditable={editor.isEditable && isEditable}
            suppressContentEditableWarning
            style={{ pointerEvents: !isEditable ? "none" : "unset" }}
          >
            <NodeViewContent />
          </div>
          {/* issue #548: generate assertion rows straight from this section's
              response, right where the table lives — imported/read-only
              tables skip it, same as the table content itself above. */}
          {isEditable && <ResponseFieldPicker editor={editor} node={node} getPos={getPos} />}
        </div>
      </NodeViewWrapper>
    );
  };

// Factory function to create assertions table node
export const createAssertionsTableNodeView = (
  RequestBlockHeader: any,
  openFile?: (relativePath: string) => Promise<void>
) => {
  const AssertionsTable = TableWrapperNode.extend({
    name: "assertions-table",
    addAttributes() {
      return {
        importedFrom: {
          default: "",
        },
      };
    },
    parseHTML() {
      return [{ tag: "assertions-table" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["assertions-table", mergeAttributes(HTMLAttributes), 0];
    },
    addNodeView() {
      return ReactNodeViewRenderer(createNodeView("SIMPLE-ASSERTIONS", RequestBlockHeader, openFile), {
        stopEvent: () => false,
      });
    },
  });

  return AssertionsTable;
};
