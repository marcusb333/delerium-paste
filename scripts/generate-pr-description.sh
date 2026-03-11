#!/bin/bash
# Generate PR description from git changes — no AI/API required.
#
# Analyzes git diff, commits, and file types to produce a structured description
# with security notes for crypto/auth changes and a test checklist.
#
# Usage:
#   ./scripts/generate-pr-description.sh [BASE_BRANCH]
#
# Output:
#   Prints the generated PR description to stdout.
#   Use with gh:
#     ./scripts/generate-pr-description.sh | gh pr edit --body-file -

set -e

BASE_BRANCH="${1:-main}"

# ── Gather git context ────────────────────────────────────────────────────────

COMMITS=$(git log "origin/$BASE_BRANCH..HEAD" --oneline 2>/dev/null \
  || git log "$BASE_BRANCH..HEAD" --oneline 2>/dev/null \
  || echo "")

CHANGED_FILES=$(git diff --name-only "origin/$BASE_BRANCH...HEAD" 2>/dev/null \
  || git diff --name-only "$BASE_BRANCH...HEAD" 2>/dev/null \
  || echo "")

COMMIT_COUNT=$(printf '%s' "$COMMITS" | grep -c . 2>/dev/null || echo 0)
FILE_COUNT=$(printf '%s' "$CHANGED_FILES" | grep -c . 2>/dev/null || echo 0)

# ── Detect change type from commit prefixes ───────────────────────────────────

CHANGE_TYPE="chore"
if   printf '%s' "$COMMITS" | grep -qE " feat(\(.+\))?:";     then CHANGE_TYPE="feat"
elif printf '%s' "$COMMITS" | grep -qE " fix(\(.+\))?:";      then CHANGE_TYPE="fix"
elif printf '%s' "$COMMITS" | grep -qE " perf(\(.+\))?:";     then CHANGE_TYPE="perf"
elif printf '%s' "$COMMITS" | grep -qE " refactor(\(.+\))?:"; then CHANGE_TYPE="refactor"
elif printf '%s' "$COMMITS" | grep -qE " test(\(.+\))?:";     then CHANGE_TYPE="test"
elif printf '%s' "$COMMITS" | grep -qE " docs(\(.+\))?:";     then CHANGE_TYPE="docs"
elif printf '%s' "$COMMITS" | grep -qE " style(\(.+\))?:";    then CHANGE_TYPE="style"
fi

# ── Categorize changed files ──────────────────────────────────────────────────

FRONTEND_FILES=$(printf '%s\n' "$CHANGED_FILES" | grep "^client/src/" || true)
BACKEND_FILES=$(printf '%s\n'  "$CHANGED_FILES" | grep "^server/"     || true)
TEST_FILES=$(printf '%s\n'     "$CHANGED_FILES" | grep -E "(tests?/|\.test\.|\.spec\.)" || true)
STYLE_FILES=$(printf '%s\n'    "$CHANGED_FILES" | grep "^client/styles/" || true)
DOC_FILES=$(printf '%s\n'      "$CHANGED_FILES" | grep "^docs/"       || true)
CONFIG_FILES=$(printf '%s\n'   "$CHANGED_FILES" | grep -E \
  "(package\.json|docker-compose|Makefile|\.github/|Dockerfile|\.bazel|MODULE\.bazel|nginx)" || true)

OTHER_FILES=$(printf '%s\n' "$CHANGED_FILES" | grep -vE \
  "(^client/src/|^server/|tests?/|\.test\.|\.spec\.|^client/styles/|^docs/|package\.json|docker-compose|Makefile|\.github/|Dockerfile|\.bazel|MODULE\.bazel|nginx)" \
  || true)

# ── Security-critical detection ───────────────────────────────────────────────

SECURITY_FILES=$(printf '%s\n' "$CHANGED_FILES" | grep -E \
  "(client/src/core/crypto/|client/src/security\.ts|client/src/core/utils/sanitize\.ts|\
server/src/main/kotlin/(DataKeyManager|Storage|Pow|RateLimiter))" || true)

HAS_SECURITY=false
[ -n "$SECURITY_FILES" ] && HAS_SECURITY=true

# ── Build Changes section ─────────────────────────────────────────────────────

CHANGES_BODY=""

add_area() {
  local label="$1"
  local files="$2"
  if [ -n "$files" ]; then
    local names
    names=$(printf '%s\n' "$files" | sed 's|.*/||' | sort -u | head -8 | paste -sd ', ')
    CHANGES_BODY+="- **${label}:** ${names}"$'\n'
  fi
}

add_area "Frontend" "$FRONTEND_FILES"
add_area "Backend"  "$BACKEND_FILES"
add_area "Tests"    "$TEST_FILES"
add_area "Styles"   "$STYLE_FILES"
add_area "Config"   "$CONFIG_FILES"
add_area "Docs"     "$DOC_FILES"
add_area "Other"    "$OTHER_FILES"

[ -z "$CHANGES_BODY" ] && CHANGES_BODY="- No significant file changes detected"$'\n'

# ── Security section ──────────────────────────────────────────────────────────

SECURITY_SECTION=""
if [ "$HAS_SECURITY" = true ]; then
  SECURITY_SECTION=$'\n> ⚠️ **Security-critical files modified:**\n'
  while IFS= read -r f; do
    [ -n "$f" ] && SECURITY_SECTION+=$(printf '> - `%s`\n' "$f")
  done <<< "$SECURITY_FILES"
  SECURITY_SECTION+=$'\n'
fi

# ── Test checklist ────────────────────────────────────────────────────────────

CHECKLIST="- [ ] Tested manually against a local dev build
- [ ] \`make ci-quick\` passes (lint, typecheck, tests)"

if [ -n "$TEST_FILES" ]; then
  CHECKLIST+="
- [ ] New/updated tests reflect the change"
fi

if [ "$HAS_SECURITY" = true ]; then
  CHECKLIST+="
- [ ] \`docs/security/CHECKLIST.md\` reviewed
- [ ] 100% test coverage on all changed security-critical paths"
fi

# ── Changed files list ────────────────────────────────────────────────────────

FILE_LIST=$(printf '%s\n' "$CHANGED_FILES" | sed 's/^/- /' | head -50)
[ -z "$FILE_LIST" ] && FILE_LIST="_(no files)_"

TRUNCATED_NOTE=""
if [ "$FILE_COUNT" -gt 50 ]; then
  TRUNCATED_NOTE=$'\n'"_Showing first 50 of ${FILE_COUNT} files._"
fi

# ── Output ────────────────────────────────────────────────────────────────────

cat <<EOF
## Summary
${COMMIT_COUNT} commit(s) · ${FILE_COUNT} file(s) changed · ${CHANGE_TYPE}
${SECURITY_SECTION}
## Changes
${CHANGES_BODY}
## Test plan
${CHECKLIST}

## Changed files
<details>
<summary>${FILE_COUNT} file(s)</summary>

${FILE_LIST}${TRUNCATED_NOTE}
</details>
EOF
