# Security Policy

## Supported Version

Security fixes are currently targeted at the latest active line:

- `1.5.x`

Older versions should be upgraded before requesting a fix.

## What Counts as a Security Issue

Examples include:

- permission bypasses in Proton runtime helpers
- unsafe code generation that breaks stated security guarantees
- sandbox boundary escapes
- plugin behavior that exposes host functionality beyond documented scope

## Reporting

Please avoid posting exploit details in a public issue first.

Include:

- Proton version
- minimal `.ptn` reproduction
- expected behavior
- actual behavior
- impact assessment

## Current Security Boundaries

Proton has security-oriented semantics, but some features are still intentionally limited:

- plugins are curated and host-assisted
- sandboxing is modeled in generated runtime behavior, not isolated OS containers
- network and file capability checks depend on declared permissions and current runtime enforcement

Please read those boundaries before assuming a production isolation guarantee.
