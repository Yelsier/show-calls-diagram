import * as vscode from "vscode";
import ts from "typescript";

export type SourceCall = {
  name: string;
  uri: vscode.Uri;
  range: vscode.Range;
  callSiteRange: vscode.Range;
};

type SourceCallOptions = {
  jsxOnly?: boolean;
};

export async function getSourceCalls(
  item: vscode.CallHierarchyItem,
  options: SourceCallOptions = {},
): Promise<SourceCall[]> {
  const document = await vscode.workspace.openTextDocument(item.uri);

  const sourceFile = ts.createSourceFile(
    document.fileName,
    document.getText(),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const start = document.offsetAt(item.range.start);
  const end = document.offsetAt(item.range.end);
  const selectionStart = document.offsetAt(item.selectionRange.start);
  const rootCallable = findRootCallable(sourceFile, selectionStart);

  const result: SourceCall[] = [];

  async function addReference(name: string, reference: ts.Node) {
    const position = document.positionAt(reference.getStart(sourceFile));

    const definitions = await vscode.commands.executeCommand<
      (vscode.Location | vscode.LocationLink)[]
    >("vscode.executeDefinitionProvider", document.uri, position);

    const definition = definitions?.[0];

    if (!definition) {
      return;
    }

    const isLocation = definition instanceof vscode.Location;
    const uri = isLocation ? definition.uri : definition.targetUri;
    const range = isLocation
      ? definition.range
      : (definition.targetSelectionRange ?? definition.targetRange);
    const callSiteRange =
      !isLocation && definition.originSelectionRange
        ? definition.originSelectionRange
        : new vscode.Range(
            position,
            document.positionAt(reference.getEnd()),
          );

    result.push({ name, uri, range, callSiteRange });
  }

  async function visit(node: ts.Node) {
    if (node.getEnd() < start || node.getStart(sourceFile) > end) {
      return;
    }

    if (
      node !== rootCallable &&
      ts.isFunctionLike(node) &&
      isIndependentCallable(node) &&
      !containsPosition(getCallableOwner(node), selectionStart, sourceFile)
    ) {
      return;
    }

    let tagName: ts.JsxTagNameExpression | undefined;

    if (ts.isJsxOpeningElement(node)) {
      tagName = node.tagName;
    }

    if (ts.isJsxSelfClosingElement(node)) {
      tagName = node.tagName;
    }

    if (tagName) {
      const name = tagName.getText(sourceFile);

      if (/^[A-Z]/.test(name)) {
        await addReference(name, tagName);
      }
    }

    if (!options.jsxOnly && ts.isCallExpression(node)) {
      const reference = getCallableReference(node.expression);

      if (reference) {
        await addReference(reference.getText(sourceFile), reference);
      }
    }

    for (const child of node.getChildren(sourceFile)) {
      await visit(child);
    }
  }

  await visit(sourceFile);

  return result;
}

function getCallableReference(expression: ts.Expression): ts.Node | undefined {
  if (ts.isIdentifier(expression)) {
    return expression;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name;
  }

  if (ts.isElementAccessExpression(expression) && expression.argumentExpression) {
    return expression.argumentExpression;
  }

  return undefined;
}

function findRootCallable(
  sourceFile: ts.SourceFile,
  selectionStart: number,
): ts.SignatureDeclaration | undefined {
  let result: ts.SignatureDeclaration | undefined;
  let resultSize = Number.POSITIVE_INFINITY;

  function visit(node: ts.Node) {
    if (ts.isFunctionLike(node)) {
      const owner = getCallableOwner(node);
      const ownerStart = owner.getStart(sourceFile);
      const ownerEnd = owner.getEnd();

      if (ownerStart <= selectionStart && selectionStart < ownerEnd) {
        const size = ownerEnd - ownerStart;

        if (size < resultSize) {
          result = node;
          resultSize = size;
        }
      }
    }

    node.forEachChild(visit);
  }

  visit(sourceFile);

  return result;
}

function containsPosition(
  node: ts.Node,
  position: number,
  sourceFile: ts.SourceFile,
) {
  return node.getStart(sourceFile) <= position && position < node.getEnd();
}

function getCallableOwner(node: ts.SignatureDeclaration): ts.Node {
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    (ts.isVariableDeclaration(node.parent) ||
      ts.isPropertyAssignment(node.parent)) &&
    node.parent.initializer === node
  ) {
    return node.parent;
  }

  return node;
}

function isIndependentCallable(node: ts.SignatureDeclaration) {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  ) {
    return true;
  }

  return (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    (ts.isVariableDeclaration(node.parent) ||
      ts.isPropertyAssignment(node.parent)) &&
    node.parent.initializer === node
  );
}
