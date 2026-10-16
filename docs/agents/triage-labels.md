# Triage Labels

Map canonical triage roles to these GitHub labels.

| Canonical role | GitHub label | Meaning |
| --- | --- | --- |
| needs-triage | needs-triage | Maintainer needs to evaluate |
| needs-info | needs-info | Waiting on reporter |
| ready-for-agent | ready-for-agent | Fully specified for autonomous implementation |
| ready-for-human | ready-for-human | Requires human implementation |
| wontfix | wontfix | Will not be actioned |

Use the mapped label when a skill refers to a triage role.

These labels describe triage disposition, not implementation progress or issue type. Preserve unrelated labels such as `bug`, `enhancement`, and `documentation`.

When transitioning roles, remove superseded triage-role labels and apply the new role. A `ready-for-agent` issue must contain enough context and acceptance criteria to implement without further clarification.

Check label existence before applying labels. Do not silently create alternative names.
