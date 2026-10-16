# Domain Docs

This repository uses a multi-context documentation layout.

## Before Exploring

- Read root `CONTEXT-MAP.md` when present, then the context files relevant to the task.
- Read root `docs/adr/` for relevant cross-component decisions.
- Read component-level ADRs for the area being changed.
- If the map is absent, use the proposed paths below when they exist.
- If root `CONTEXT.md` exists, also read it for shared terminology.

If these files or directories do not exist, proceed silently. Do not invent documentation or require it before doing work. The `grill-with-docs` skill can create it as terminology and decisions are resolved.

## Proposed Layout

- `CONTEXT-MAP.md`: index of contexts and their documentation paths.
- `CONTEXT.md`: optional shared terminology.
- `docs/adr/`: cross-component architectural decisions.
- `app/CONTEXT.md`: beach-map application terminology, including related API and supporting code.
- `app/docs/adr/`: application-specific decisions.
- `autonomy/CONTEXT.md`: DGX autonomy terminology.
- `autonomy/docs/adr/`: autonomy-specific decisions.

These paths are conventions, not a claim that the files currently exist. A future `CONTEXT-MAP.md` is authoritative if it specifies different paths.

## Consumer Rules

Use glossary terms consistently in issue titles, hypotheses, tests, and refactor proposals.

If a needed concept is absent from the glossary, reconsider invented terminology or note the gap for `grill-with-docs`.

Surface conflicts with existing ADRs explicitly rather than silently overriding decisions.

This layout does not cover the separate Keeper checkout.
