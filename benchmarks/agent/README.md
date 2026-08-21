# Manual agent evaluation

Run the ten tasks in `tasks.json` twice: once with the normal `hint apply` block and CLI, once with the same `.hint` knowledge concatenated into one agent instruction file. Keep model, date, agent version, repository commit, and information content equal. Record pass/fail, input/output tokens, turns, and wall time under `results/<version>/agent-<model>-<date>.json`. This suite costs model tokens and is therefore never part of CI; publish both arms and say “in this run”.
