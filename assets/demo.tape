# Records the CLI demo used in the README.
#
#   vhs assets/demo.tape        (or: npm run demo:record)
#
# Run from the repository root. Needs vhs (https://github.com/charmbracelet/vhs),
# which also needs ttyd and ffmpeg. Uses the local `local` template, so no API
# keys or network access are needed. Writes assets/demo.gif.

Output assets/demo.gif

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 680
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms
Set WindowBar Colorful

# Setup, not recorded: run the repo's CLI as `rag-pipeline` in a scratch
# directory with three small policy documents.
Hide
Type `export REPO="$PWD" DEMO="$(mktemp -d)"` Enter
Type `rag-pipeline() { node "$REPO/bin/cli.js" "$@"; }` Enter
Type `cd "$DEMO" && mkdir docs && export PS1='$ '` Enter
Type `printf '# Vacation policy\n\nFull-time employees receive twenty days of paid vacation per year. Unused days carry over until the end of March.\n' > docs/vacation.md` Enter
Type `printf '# Remote work policy\n\nEmployees may work remotely up to three days per week with manager approval. Core hours are 10:00 to 15:00.\n' > docs/remote-work.md` Enter
Type `printf '# Expenses\n\nSubmit receipts within thirty days. Travel above 500 EUR needs pre-approval from finance.\n' > docs/expenses.md` Enter
Type "clear" Enter
Show

Type "ls docs" Sleep 400ms Enter
Sleep 1s

Type "rag-pipeline init --no-interactive" Sleep 400ms Enter
Sleep 1.5s

Type "rag-pipeline ingest ./docs" Sleep 400ms Enter
Sleep 2s

Type `rag-pipeline query "How many vacation days do I get?" --top-k 2` Sleep 400ms Enter
Sleep 4s

# Cleanup, not recorded.
Hide
Type `cd "$REPO" && rm -rf "$DEMO"` Enter
