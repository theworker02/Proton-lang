# Contributing to Proton

## Development Setup

Proton currently targets Node 25+.

Useful commands:

```bash
npm test
node cli/protonc.ts check examples/main.ptn
node cli/protonc.ts analyze examples/phase5.ptn
node cli/protonc.ts run examples/phase5.ptn
node cli/protonc.ts inspect examples/phase5.ptn --json
node scripts/build-vscode-extension.mjs
```

Useful extension commands:

```bash
cd vscode-extension
vsce package -o proton-language-support-1.5.3.vsix
```

## Contribution Guidelines

When you add or change a language feature:

1. Update parser, typechecker, and code generation together when needed
2. Add or extend an example in `examples/`
3. Add or update a test in `tests/run-tests.ts`
4. Update documentation in `docs/`
5. Add a short entry to [`docs/CHANGELOG.md`](./CHANGELOG.md)

When you change the VS Code extension:

1. Update `vscode-extension/extension.ts`
2. Rebuild `vscode-extension/extension.js`
3. Verify the Extension Development Host still launches through `F5`
4. If packaging behavior changed, update [`docs/VSCODE_EXTENSION.md`](./VSCODE_EXTENSION.md)

## Style Expectations

- Prefer explicit language semantics over "magic"
- Keep docs honest about what is executable today versus what is metadata or advisory
- Favor small, readable examples over oversized showcase programs
- Preserve compatibility with the existing Phase 2 through Phase 5 test surface unless a breaking change is intentional

## Pull Request Checklist

- Tests pass locally
- Extension changes are rebuilt before packaging
- New syntax is documented
- Any new runtime behavior is covered by at least one example
- Changelog updated
- User-facing limitations are called out clearly

## Reporting Ideas and Bugs

Use the support channels in [SUPPORT.md](./SUPPORT.md). For security-sensitive reports, use [SECURITY.md](./SECURITY.md) instead of public issue threads.
