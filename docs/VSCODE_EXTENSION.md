# VS Code Extension

## Overview

Proton ships with a VS Code extension located in `vscode-extension/`.

Current extension identity:

- package name: `proton-language-support`
- publisher: `magnificent-language`
- version: `1.5.5`

The extension currently provides:

- `.ptn` language registration
- Proton syntax highlighting
- hover information for keywords and discovered symbols
- diagnostic checks powered by `protonc`
- Proton file icons through a dedicated icon theme

## Running the Extension Locally

Open the repository root in VS Code and use the built-in debug configuration:

1. Open **Run and Debug**
2. Select `Run Proton VS Code Extension`
3. Press `F5`

This launches an Extension Development Host.

The repo includes:

- `.vscode/launch.json`
- `.vscode/tasks.json`
- `scripts/build-vscode-extension.mjs`

So pressing `F5` rebuilds `vscode-extension/extension.js` before the Extension Development Host starts.

## Using the Language in the Host

Once the Extension Development Host opens:

1. Open a `.ptn` file
2. VS Code should automatically assign the `proton` language mode
3. If needed, manually switch the language mode to `Proton`

## File Icons

File icons are separate from language registration.

To enable the Proton file icon theme in the Extension Development Host:

1. Open Command Palette
2. Run `Preferences: File Icon Theme`
3. Select `Proton File Icons`

If the icon looks stale after changes:

1. Switch to another file icon theme
2. Switch back to `Proton File Icons`
3. Run `Developer: Reload Window`

## Diagnostics Behavior

The extension validates the current editor buffer, not just the saved file on disk.

That means parser/typechecker errors should reflect what you are actively typing, including unsaved changes.

This uses:

- `protonc check-stdin`
- `protonc inspect-stdin`

## Packaging a VSIX

From `vscode-extension/`, package the extension with:

```bash
vsce package -o proton-language-1.5.5.vsix
```

The repository already includes:

- `.vscodeignore`
- extension-local `LICENSE`

So the packaged extension stays reasonably lean.

## Installing the VSIX

You can install the packaged extension with:

```bash
code --install-extension proton-language-1.5.5.vsix
```

Or through the VS Code UI:

1. Open Extensions
2. Open the `...` menu
3. Choose `Install from VSIX...`

## Current Boundaries

- diagnostics are powered by the current CLI/compiler, not a separate language server
- icon rendering size is ultimately constrained by VS Code’s file icon slot
- extension packaging works locally, but marketplace publishing metadata is still minimal
