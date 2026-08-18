// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { buildGraph } from "./buildGraph";
import { getGraphHtml } from "./CallsDiagramView";

export function activate(context: vscode.ExtensionContext) {
  const showCallsCommand = vscode.commands.registerCommand(
    "showCallsDiagram.show",
    () => showDiagram(context, false),
  );
  const showReactComponentsCommand = vscode.commands.registerCommand(
    "showCallsDiagram.showReactComponents",
    () => showDiagram(context, true),
  );

  context.subscriptions.push(showCallsCommand, showReactComponentsCommand);
}

async function showDiagram(
  context: vscode.ExtensionContext,
  reactOnly: boolean,
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  if (reactOnly && editor.document.languageId !== "typescriptreact") {
    return;
  }

  const position = editor.selection.active;

  const callItems = await vscode.commands.executeCommand<
    vscode.CallHierarchyItem[]
  >("vscode.prepareCallHierarchy", editor.document.uri, position);

  if (!callItems?.length) {
    vscode.window.showInformationMessage("No function found at this position.");
    return;
  }

  const root = callItems[0];
  const configuration = vscode.workspace.getConfiguration("showCallsDiagram");
  const maxDepth = configuration.get<number>("maxDepth", 10);
  const hideDefaultJsFunctions = configuration.get<boolean>(
    "hideDefaultJsFunctions",
    true,
  );
  const hideReactHooks = configuration.get<boolean>("hideReactHooks", true);

  const graph = await buildGraph(root, {
    maxDepth,
    hideDefaultJsFunctions,
    hideReactHooks,
    reactOnly,
  });

  const panel = vscode.window.createWebviewPanel(
    "showCallsDiagram",
    reactOnly ? `React components: ${root.name}` : `Calls: ${root.name}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
    },
  );

  panel.webview.onDidReceiveMessage(
    async (message: unknown) => {
      if (!isOpenFunctionMessage(message)) {
        return;
      }

      try {
        const document = await vscode.workspace.openTextDocument(
          vscode.Uri.parse(message.uri, true),
        );
        const position = document.validatePosition(
          new vscode.Position(message.line, message.character),
        );

        await vscode.window.showTextDocument(document, {
          viewColumn: editor.viewColumn,
          selection: new vscode.Range(position, position),
          preview: true,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);

        vscode.window.showErrorMessage(`Unable to open function: ${reason}`);
      }
    },
    undefined,
    context.subscriptions,
  );

  panel.webview.html = getGraphHtml(graph);
}

export function deactivate() {}

type OpenFunctionMessage = {
  type: "openFunction";
  uri: string;
  line: number;
  character: number;
};

function isOpenFunctionMessage(message: unknown): message is OpenFunctionMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const candidate = message as Partial<OpenFunctionMessage>;

  return (
    candidate.type === "openFunction" &&
    typeof candidate.uri === "string" &&
    Number.isInteger(candidate.line) &&
    Number.isInteger(candidate.character) &&
    (candidate.line ?? -1) >= 0 &&
    (candidate.character ?? -1) >= 0
  );
}
