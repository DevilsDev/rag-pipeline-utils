# Records the CLI demo used in the README.
#
#   vhs assets/demo.tape        (or: npm run demo:record)
#
# Run from the repository root; it uses and then deletes .demo/. Needs vhs
# (https://github.com/charmbracelet/vhs), which also needs ttyd and ffmpeg.
# Uses the `local` template, so no API keys or network access are needed.
# Writes assets/demo.gif.

Output assets/demo.gif

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 680
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms
Set WindowBar Colorful

# Setup, not recorded: run the repo's CLI as `rag-pipeline` in .demo/ (git
# ignored) with three small policy documents. Paths stay relative so this also
# works when vhs on Windows starts WSL's bash, where only node.exe exists.
Hide
Type `rm -rf .demo && mkdir -p .demo/docs && cd .demo && export PS1='$ '` Enter
Type `command -v node >/dev/null || node() { node.exe "$@"; }` Enter
Type `rag-pipeline() { node ../bin/cli.js "$@"; }` Enter
Type `printf '# Vacation policy\n\nFull-time employees receive twenty days of paid vacation per year. Unused days carry over to March.\n' > docs/vacation.md` Enter
Type `printf '# Remote work policy\n\nEmployees may work remotely up to three days per week with manager approval. Core hours are 10:00 to 15:00.\n' > docs/remote-work.md` Enter
Type `printf '# Expenses\n\nSubmit receipts within thirty days. Travel above 500 EUR needs pre-approval from finance.\n' > docs/expenses.md` Enter
Sleep 1s
Wait+Line@60s /^\$$/
Type "clear" Enter
Sleep 300ms
Show

# Each command waits for the prompt to come back before the next one is
# typed; keystrokes sent while a command runs would go to that command.
Type "ls docs" Sleep 400ms Enter
Sleep 1s
Wait+Line@60s /^\$$/
Sleep 1s

Type "rag-pipeline init --no-interactive" Sleep 400ms Enter
Sleep 1s
Wait+Line@60s /^\$$/
Sleep 1.5s

Type "rag-pipeline ingest ./docs" Sleep 400ms Enter
Sleep 1s
Wait+Line@60s /^\$$/
Sleep 1.5s

Type `rag-pipeline query "How many vacation days do I get?" --top-k 2` Sleep 400ms Enter
Sleep 1s
Wait+Line@60s /^\$$/
Sleep 4s

# Cleanup, not recorded.
Hide
Type `cd .. && rm -rf .demo` Enter
Sleep 1s
