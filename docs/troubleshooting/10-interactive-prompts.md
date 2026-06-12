# Interactive prompts when scripting

## Symptom

`hint config` asks for a project name and description while running in a script or pipeline.

## Cause

When no `hint.yml` exists and stdin is a terminal, `hint config` asks for the project name and description interactively (on stderr; stdout still carries only the agent prompt). In non-interactive environments (CI, piped stdin) it creates a default `hint.yml` without asking.

## Fix

For unattended use, pipe stdin from `/dev/null` or pre-create `hint.yml`. Answers can also be piped line-by-line: name, description, then `Y`/`n` for the default hintbook.
