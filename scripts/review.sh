#!/bin/sh
# The skills' entry point. It checks one thing, that Node.js 18 or later is on
# PATH, and then hands every argument to review.mjs unchanged.
#
# Why it exists: Claude Code aborts a skill when its injected command fails, so
# a bare `node …` with no Node installed (exit 127) showed the user a shell
# error and Claude never saw the skill's instructions. Here the prerequisite
# failure is a plain, deterministic message on stdout with exit 0, so the skill
# loads and Claude can relay it. It is never a review: it says NOT RUN.
# A genuine review failure still exits non-zero from review.mjs.
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

not_run() {
  echo "DeepSweep review NOT RUN: this plugin needs Node.js 18 or later on PATH ($1)."
  echo "Nothing was reviewed. Install Node.js 18 or later, restart Claude Code so it sees the new PATH, then run /deepsweep:review again."
  exit 0
}

command -v node >/dev/null 2>&1 || not_run "no node command was found"
major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null) || not_run "node did not report a version"
case "$major" in
  ''|*[!0-9]*) not_run "node did not report a version" ;;
esac
[ "$major" -ge 18 ] || not_run "found Node.js $major"

exec node "$here/review.mjs" "$@"
