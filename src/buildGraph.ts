import * as vscode from "vscode";
import { getSourceCalls, SourceCall } from "./getJsxComponent";

type UnifiedCall = {
  name: string;
  targetUri: vscode.Uri;
  targetRange: vscode.Range;
  callSiteUri: vscode.Uri;
  callSiteRange: vscode.Range;
  hierarchyItem?: vscode.CallHierarchyItem;
};

type NavigationLocation = {
  uri: vscode.Uri;
  range: vscode.Range;
};

export type BuildGraphOptions = {
  maxDepth?: number;
  hideDefaultJsFunctions?: boolean;
  hideReactHooks?: boolean;
  reactOnly?: boolean;
};

export type GraphNode = {
  name: string;
  uri: vscode.Uri;
  range: vscode.Range;
  declarationUri: vscode.Uri;
  declarationRange: vscode.Range;
  calls: GraphNode[];
};

export async function buildGraph(
  item: vscode.CallHierarchyItem,
  options: BuildGraphOptions = {},
): Promise<GraphNode> {
  const maxDepth = normalizeMaxDepth(options.maxDepth);
  const hideDefaultJsFunctions = options.hideDefaultJsFunctions ?? true;
  const hideReactHooks = options.hideReactHooks ?? true;
  const reactOnly = options.reactOnly ?? false;

  return buildGraphNode(
    item,
    new Set<string>(),
    0,
    maxDepth,
    hideDefaultJsFunctions,
    hideReactHooks,
    reactOnly,
  );
}

async function buildGraphNode(
  item: vscode.CallHierarchyItem,
  ancestors: Set<string>,
  depth: number,
  maxDepth: number,
  hideDefaultJsFunctions: boolean,
  hideReactHooks: boolean,
  reactOnly: boolean,
  navigation: NavigationLocation = { uri: item.uri, range: item.range },
): Promise<GraphNode> {
  const id = `${item.uri.toString()}:${item.range.start.line}:${item.name}`;
  const node = {
    name: item.name,
    uri: navigation.uri,
    range: navigation.range,
    declarationUri: item.uri,
    declarationRange: item.range,
    calls: [],
  } satisfies GraphNode;

  if (ancestors.has(id) || depth >= maxDepth) {
    return node;
  }

  const branchAncestors = new Set(ancestors);
  branchAncestors.add(id);

  const normalCalls = reactOnly
    ? []
    : ((await vscode.commands.executeCommand<
        vscode.CallHierarchyOutgoingCall[]
      >("vscode.provideOutgoingCalls", item)) ?? []);

  const sourceCalls = await getSourceCalls(item, { jsxOnly: reactOnly });

  const calls: GraphNode[] = [];
  const unifiedCalls = mergeCalls(
    normalCalls,
    sourceCalls,
    item.uri,
    hideDefaultJsFunctions,
    hideReactHooks,
  );

  for (const call of unifiedCalls) {
    const callSite = {
      uri: call.callSiteUri,
      range: call.callSiteRange,
    };

    if (isNodeModule(call.targetUri)) {
      calls.push({
        name: call.name,
        uri: callSite.uri,
        range: callSite.range,
        declarationUri: call.targetUri,
        declarationRange: call.targetRange,
        calls: [],
      });

      continue;
    }

    if (call.hierarchyItem) {
      calls.push(
        await buildGraphNode(
          call.hierarchyItem,
          branchAncestors,
          depth + 1,
          maxDepth,
          hideDefaultJsFunctions,
          hideReactHooks,
          reactOnly,
          callSite,
        ),
      );
      continue;
    }

    const hierarchyItems = await vscode.commands.executeCommand<
      vscode.CallHierarchyItem[]
    >("vscode.prepareCallHierarchy", call.targetUri, call.targetRange.start);

    if (!hierarchyItems?.length) {
      calls.push({
        name: call.name,
        uri: callSite.uri,
        range: callSite.range,
        declarationUri: call.targetUri,
        declarationRange: call.targetRange,
        calls: [],
      });

      continue;
    }

    calls.push(
      await buildGraphNode(
        hierarchyItems[0],
        branchAncestors,
        depth + 1,
        maxDepth,
        hideDefaultJsFunctions,
        hideReactHooks,
        reactOnly,
        callSite,
      ),
    );
  }

  return {
    ...node,
    calls,
  };
}

function normalizeMaxDepth(maxDepth: number | undefined) {
  if (maxDepth === undefined || !Number.isFinite(maxDepth)) {
    return 10;
  }

  return Math.max(0, Math.floor(maxDepth));
}

function isNodeModule(uri: vscode.Uri) {
  return uri.fsPath.includes("node_modules");
}

function isDefaultJsFunctionUri(uri: vscode.Uri) {
  const normalizedPath = uri.fsPath.replaceAll("\\", "/");

  return /(?:^|\/)lib\.[^/]+\.d\.ts$/i.test(normalizedPath);
}

function isReactHook(name: string, uri: vscode.Uri) {
  if (name !== "use" && !/^use[A-Z0-9]/.test(name)) {
    return false;
  }

  const normalizedPath = uri.fsPath.replaceAll("\\", "/");

  return /\/node_modules\/(?:@types\/)?react(?:-dom)?(?:\/|$)/i.test(
    normalizedPath,
  );
}

function getOccurrenceId(
  targetUri: vscode.Uri,
  callSiteUri: vscode.Uri,
  callSiteRange: vscode.Range,
) {
  const { start, end } = callSiteRange;

  return [
    targetUri.toString(),
    callSiteUri.toString(),
    start.line,
    start.character,
    end.line,
    end.character,
  ].join(":");
}

function mergeCalls(
  normalCalls: vscode.CallHierarchyOutgoingCall[],
  sourceCalls: SourceCall[],
  callerUri: vscode.Uri,
  hideDefaultJsFunctions: boolean,
  hideReactHooks: boolean,
): UnifiedCall[] {
  const calls: UnifiedCall[] = [];
  const seenOccurrences = new Set<string>();

  function addCall(call: UnifiedCall) {
    const id = getOccurrenceId(
      call.targetUri,
      call.callSiteUri,
      call.callSiteRange,
    );

    // The language provider and the JSX fallback may report the same source
    // occurrence. Only that overlap is ignored; separate calls are preserved.
    if (seenOccurrences.has(id)) {
      return;
    }

    seenOccurrences.add(id);
    calls.push(call);
  }

  for (const call of normalCalls) {
    const target = call.to;

    if (hideDefaultJsFunctions && isDefaultJsFunctionUri(target.uri)) {
      continue;
    }

    if (hideReactHooks && isReactHook(target.name, target.uri)) {
      continue;
    }

    for (const callSiteRange of call.fromRanges) {
      addCall({
        name: target.name,
        targetUri: target.uri,
        targetRange: target.range,
        callSiteUri: callerUri,
        callSiteRange,
        hierarchyItem: target,
      });
    }
  }

  for (const call of sourceCalls) {
    if (hideDefaultJsFunctions && isDefaultJsFunctionUri(call.uri)) {
      continue;
    }

    if (hideReactHooks && isReactHook(call.name, call.uri)) {
      continue;
    }

    addCall({
      name: call.name,
      targetUri: call.uri,
      targetRange: call.range,
      callSiteUri: callerUri,
      callSiteRange: call.callSiteRange,
    });
  }

  return calls.sort((left, right) => {
    const leftStart = left.callSiteRange.start;
    const rightStart = right.callSiteRange.start;

    return (
      leftStart.line - rightStart.line ||
      leftStart.character - rightStart.character
    );
  });
}
