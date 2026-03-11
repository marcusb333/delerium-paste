#!/bin/bash
# Fill PR description: replaces {describe} in the PR template using Claude API.
#
# Usage:
#   ./scripts/fill-pr-description.sh [BASE_BRANCH] [ANTHROPIC_API_KEY]
#
# Examples:
#   ./scripts/fill-pr-description.sh               # compares against main, reads $ANTHROPIC_API_KEY
#   ./scripts/fill-pr-description.sh develop        # compares against develop
#   ./scripts/fill-pr-description.sh main mykey123  # explicit key
#
# Output:
#   Prints the filled PR description to stdout.
#   Use with gh pr create:
#     ./scripts/fill-pr-description.sh | gh pr create --body-file -
#   Or update an open PR:
#     ./scripts/fill-pr-description.sh | gh pr edit --body-file -

set -e

BASE_BRANCH="${1:-main}"
# Allow key override as second arg for convenience
if [ -n "${2}" ]; then
  export ANTHROPIC_API_KEY="${2}"
fi

TEMPLATE_FILE=".github/pull_request_template.md"

# ── Validation ─────────────────────────────────────────────────────────────

if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "Error: PR template not found at $TEMPLATE_FILE" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/anthropic-api.sh
source "$SCRIPT_DIR/lib/anthropic-api.sh"

# ── Gather context ──────────────────────────────────────────────────────────

echo "Gathering diff against $BASE_BRANCH..." >&2

CURRENT_BRANCH=$(git branch --show-current)
COMMITS=$(git log "origin/$BASE_BRANCH..HEAD" --oneline 2>/dev/null || git log "main..HEAD" --oneline 2>/dev/null || echo "(no commits found)")
CHANGED_FILES=$(git diff --name-only "origin/$BASE_BRANCH...HEAD" 2>/dev/null || git diff --name-only "main...HEAD" 2>/dev/null || echo "(unable to determine changed files)")
# Limit diff to 300 lines to stay within token budget
DIFF=$(git diff "origin/$BASE_BRANCH...HEAD" 2>/dev/null || git diff "main...HEAD" 2>/dev/null || echo "(no diff)")
DIFF_TRUNCATED=$(echo "$DIFF" | head -300)
DIFF_LINES=$(echo "$DIFF" | wc -l | tr -d ' ')

TEMPLATE_CONTENT=$(cat "$TEMPLATE_FILE")

# ── Build prompt ────────────────────────────────────────────────────────────

PROMPT="You are writing a PR description for a zero-knowledge encrypted paste system (Delirium).

Your job is to replace the \`{describe}\` placeholder in the template below with a well-structured description based on the provided git context.

Replace \`{describe}\` with ONLY these two sections (no other changes to the template):

## Summary
[1–3 sentences explaining what changed and why. Be specific and concise.]

## Changes
- [Grouped, bulleted list. Group by area (e.g. Frontend, Backend, Tests, Config) when multiple areas are touched. Each bullet should describe a meaningful change, not just list filenames.]

Rules:
- Do NOT include the test plan — it is already in the template.
- Do NOT add extra sections or modify anything outside \`{describe}\`.
- If the change touches security-critical code (crypto, key handling, auth, sanitization), mention it explicitly in the Summary.
- Keep the tone direct and professional. No filler phrases.

---

**Branch:** $CURRENT_BRANCH
**Base:** $BASE_BRANCH

**Commits:**
$COMMITS

**Changed files:**
$CHANGED_FILES

**Diff** (first $DIFF_LINES lines shown, truncated at 300):
\`\`\`diff
$DIFF_TRUNCATED
\`\`\`

---

**Template to fill:**
$TEMPLATE_CONTENT

Output the complete template with \`{describe}\` replaced. Output nothing else."

# ── Call Claude API ─────────────────────────────────────────────────────────

echo "Calling Claude API..." >&2

FILLED=$(call_claude "$PROMPT" "claude-haiku-4-5-20251001" 1024)

echo "Done." >&2
echo ""
echo "$FILLED"
