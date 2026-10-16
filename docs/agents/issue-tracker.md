# Issue Tracker: GitHub

Issues and PRDs for this repository live in GitHub Issues. Use the `gh` CLI for all GitHub operations.

Repository: `EduardKakosyan/claude-hackathon-volta-sep26`.

This configuration applies only to this repository, not the separate Keeper checkout or the organization's Linear workspace.

## Conventions

- Pass `--repo EduardKakosyan/claude-hackathon-volta-sep26` explicitly when operating outside this checkout.
- Create issues with `gh issue create --title "..." --body "..."`. Use a quoted heredoc for multiline bodies.
- Read tickets with `gh issue view <number> --comments`; inspect their labels and current state before updating.
- List issues with `gh issue list`, using appropriate state and label filters.
- Comment with `gh issue comment <number> --body "..."`.
- Apply or remove labels with `gh issue edit <number> --add-label "..." --remove-label "..."`.
- Close issues with `gh issue close <number> --comment "..."`.
- Check for existing issues before creating duplicates.
- Use `docs/agents/triage-labels.md` for triage roles. Preserve unrelated labels.
- Follow the invoked skill's review and approval requirements.

## Skill Instructions

When a skill says "publish to the issue tracker", create a GitHub issue.

When a skill says "fetch the relevant ticket", read the GitHub issue and its comments.

Do not create a Linear issue or local markdown ticket as a fallback.
