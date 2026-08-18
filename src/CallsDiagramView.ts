import { GraphNode } from "./buildGraph";

export function getGraphHtml(graph: GraphNode): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />

        <style>
          body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 20px;
          }

          .node {
            display: inline-block;
            padding: 8px 12px;
            line-height: 18px;

            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 6px;

            cursor: pointer;
          }

          .node:hover {
            background: var(--vscode-list-hoverBackground);
          }

          .node-row {
            display: flex;
            align-items: center;
            gap: 5px;
            width: max-content;
            padding-top: 6px;
          }

          .declaration-button {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            padding: 0;

            color: var(--vscode-foreground);
            background: transparent;
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 4px;
            cursor: pointer;
          }

          .declaration-button:hover {
            background: var(--vscode-list-hoverBackground);
          }

          .children {
            margin-left: 30px;
            padding-left: 15px;
          }

          .children > .tree-item {
            position: relative;
          }

          .children > .tree-item::before {
            content: "";
            position: absolute;
            top: 0;
            left: -15px;
            width: 15px;
            height: 24px;
            box-sizing: border-box;
            border-left: 1px solid var(--vscode-editorWidget-border);
            border-bottom: 1px solid var(--vscode-editorWidget-border);
          }

          .children > .tree-item:not(:last-child)::after {
            content: "";
            position: absolute;
            top: 24px;
            bottom: 0;
            left: -15px;
            border-left: 1px solid var(--vscode-editorWidget-border);
          }
        </style>
      </head>

      <body>
        ${renderNode(graph, true)}

        <script>
          const vscode = acquireVsCodeApi();

          document
            .querySelectorAll("[data-open-location]")
            .forEach(element => {
              element.addEventListener("click", () => {
                vscode.postMessage({
                  type: "openFunction",
                  uri: element.dataset.uri,
                  line: Number(element.dataset.line),
                  character: Number(element.dataset.character)
                });
              });
            });
        </script>
      </body>
    </html>
  `;
}

function renderNode(node: GraphNode, isRoot = false): string {
  return `
    <div class="tree-item">
      <div class="node-row">
        <div
          class="node"
          data-open-location
          data-uri="${node.uri.toString()}"
          data-line="${node.range.start.line}"
          data-character="${node.range.start.character}"
          title="Go to call"
        >
          ${escapeHtml(node.name)}
        </div>

        ${
          isRoot
            ? ""
            : `
              <button
                class="declaration-button"
                data-open-location
                data-uri="${node.declarationUri.toString()}"
                data-line="${node.declarationRange.start.line}"
                data-character="${node.declarationRange.start.character}"
                title="Go to declaration"
                aria-label="Go to declaration of ${escapeHtml(node.name)}"
              >
                &#8599;
              </button>
            `
        }
      </div>

      ${
        node.calls.length > 0
          ? `
            <div class="children">
              ${node.calls.map((call) => renderNode(call)).join("")}
            </div>
          `
          : ""
      }
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
