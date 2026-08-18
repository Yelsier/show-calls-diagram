# Show Calls Diagram

Explore TypeScript code visually. Show Calls Diagram builds an interactive tree of outgoing function calls and React component relationships directly inside VS Code.

## Features

- Shows every call occurrence instead of collapsing calls to the same function.
- Opens the exact call site when you select a node.
- Adds a compact declaration button next to every non-root node.
- Follows local functions and components recursively while safely stopping cycles.
- Provides a React-only component tree for TSX files.
- Supports configurable depth and noise filters for standard JavaScript APIs and React hooks.

## Usage

1. Open a TypeScript (`.ts`) or TSX (`.tsx`) file.
2. Place the cursor inside the function or component you want to inspect.
3. Open the editor context menu and choose one of the diagram commands.

The main node button opens the source location for that specific call. The small arrow button opens the called function's declaration. The root has no declaration button because its main button already points to its declaration.

## Commands

| Command | Availability | Description |
| --- | --- | --- |
| `Show Calls Diagram: Show Calls Diagram` | TypeScript and TSX | Displays outgoing functions and components. |
| `Show Calls Diagram: Show React Components Diagram` | TSX only | Displays only components referenced through JSX. |

## Requirements

- VS Code 1.125.0 or newer.
- A TypeScript or TSX file supported by VS Code's TypeScript language service.

## Extension settings

| Setting | Default | Description |
| --- | --- | --- |
| `showCallsDiagram.maxDepth` | `10` | Maximum number of call levels expanded below the selected function. Use `0` to display only the root. |
| `showCallsDiagram.hideDefaultJsFunctions` | `true` | Hides standard JavaScript and browser APIs such as `map`, `filter`, and `replaceState`. |
| `showCallsDiagram.hideReactHooks` | `true` | Hides React and React DOM hooks such as `useState`, `useEffect`, and `useMemo`. Custom hooks remain visible. |

Settings are read whenever a new diagram is generated.

## How analysis works

The extension combines VS Code's call hierarchy and definition providers with TSX syntax analysis. Imported functions can be displayed when their definitions are available. Dependencies in `node_modules` are shown as leaf nodes to keep diagrams focused and fast.

## Limitations

- Dynamic calls that cannot be resolved by the TypeScript language service may not appear.
- Functions created at runtime, including React state setters, are displayed as leaves because they have no source body to expand.
- The React-only command recognizes JSX components by the standard uppercase naming convention.

## Privacy

Analysis runs locally through VS Code's extension and language APIs. The extension does not send source code or telemetry to an external service.

## Release notes

See the extension's Changelog tab for version history.

## Source and support

- [Source code](https://github.com/Yelsier/show-calls-diagram)
- [Report an issue](https://github.com/Yelsier/show-calls-diagram/issues)
