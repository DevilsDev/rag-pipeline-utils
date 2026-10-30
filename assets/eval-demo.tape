# Records the evaluation demo used in the README.
#
#   vhs assets/eval-demo.tape        (or: npm run demo:record:eval)
#
# Run from the repository root; it copies assets/eval-demo/ to .demo-eval/
# (git ignored), runs there and deletes it. Needs vhs
# (https://github.com/charmbracelet/vhs), which also needs ttyd and ffmpeg.
# Offline: the local TF-IDF embedder and a stand-in LLM
# (assets/eval-demo/answer-llm.js), so no API keys or network access.
# Writes assets/eval-demo.gif.

Output assets/eval-demo.gif

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 1020
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms
Set WindowBar Colorful

# Setup, not recorded: run the repo's CLI as `rag-pipeline` in .demo-eval/
# and index the three documents. Paths stay relative so this also works when
# vhs on Windows starts WSL's bash, where only node.exe exists.
Hide
Type `rm -rf .demo-eval && cp -r assets/eval-demo .demo-eval && cd .demo-eval && export PS1='$ '` Enter
Type `command -v node >/dev/null || node() { node.exe "$@"; }` Enter
# WSL passes only the variables listed in WSLENV to node.exe.
Type `export WSLENV="DEMO_ANSWER${WSLENV:+:$WSLENV}"` Enter
Type `rag-pipeline() { node ../bin/cli.js "$@"; }` Enter
Type `rag-pipeline ingest ./docs >/dev/null` Enter
Sleep 1s
Wait+Line@60s /^\$$/
Type "clear" Enter
Sleep 300ms
Show

# Each command waits for the prompt to come back before the next one is
# typed; keystrokes sent while a command runs would go to that command.
Type "rag-pipeline eval tests.json --min faithfulness=0.8 --output main.json" Sleep 400ms Enter
Sleep 1s
Wait+Line@60s /^\$$/
Sleep 4s

Type "clear" Enter
Sleep 300ms
Type "# a change makes answers stop using the documents" Sleep 400ms Enter
Sleep 500ms
Type `DEMO_ANSWER="Ask your manager; the policy changes every year." \` Enter
Type "  rag-pipeline eval tests.json --baseline main.json" Sleep 400ms Enter
Sleep 1s
Wait+Line@60s /^\$$/
Sleep 1s

Type "echo $?" Sleep 400ms Enter
Sleep 1s
Wait+Line@60s /^\$$/
Sleep 4s

# Cleanup, not recorded.
Hide
Type `cd .. && rm -rf .demo-eval` Enter
Sleep 1s
