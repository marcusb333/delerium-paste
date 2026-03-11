#!/bin/bash
# Review PR using Anthropic API
# Usage: ./scripts/review-pr-with-ai.sh <PR_NUMBER> [ANTHROPIC_API_KEY]

set -e

PR_NUMBER="${1}"
# Allow key override as second arg for convenience
if [ -n "${2}" ]; then
  export ANTHROPIC_API_KEY="${2}"
fi

if [ -z "$PR_NUMBER" ]; then
  echo "Usage: ./scripts/review-pr-with-ai.sh <PR_NUMBER> [ANTHROPIC_API_KEY]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/anthropic-api.sh
source "$SCRIPT_DIR/lib/anthropic-api.sh"

echo "Fetching PR #$PR_NUMBER..."

PR_TITLE=$(gh pr view "$PR_NUMBER" --json title --jq '.title')
PR_BODY=$(gh pr view "$PR_NUMBER" --json body --jq '.body')
PR_AUTHOR=$(gh pr view "$PR_NUMBER" --json author --jq '.author.login')
BASE_BRANCH=$(gh pr view "$PR_NUMBER" --json baseRefName --jq '.baseRefName')
HEAD_BRANCH=$(gh pr view "$PR_NUMBER" --json headRefName --jq '.headRefName')

echo "Getting PR diff..."
PR_DIFF=$(gh pr diff "$PR_NUMBER")
CHANGED_FILES=$(gh pr diff "$PR_NUMBER" --name-only | head -20)

GUIDELINES=""
if [ -f "CLAUDE.md" ]; then
  GUIDELINES=$(head -200 CLAUDE.md)
fi

REVIEW_PROMPT="You are reviewing a pull request for a zero-knowledge encrypted paste system.

**PR Details:**
- Title: $PR_TITLE
- Author: $PR_AUTHOR
- Base: $BASE_BRANCH → Head: $HEAD_BRANCH

**PR Description:**
$PR_BODY

**Changed Files:**
$CHANGED_FILES

**Repository Guidelines:**
$GUIDELINES

**Code Diff:**
\`\`\`
$PR_DIFF
\`\`\`

Please provide a comprehensive code review focusing on:

1. **Security (CRITICAL):**
   - Encryption/decryption correctness
   - Key handling (must never be sent to server)
   - Password handling
   - Input validation
   - Error messages that might leak data
   - Logging of sensitive information

2. **Code Quality:**
   - Adherence to project conventions
   - Code organization
   - Best practices

3. **Testing:**
   - Test coverage (minimum 85%, 100% for security code)
   - Edge cases
   - Security-critical paths tested

4. **Potential Issues:**
   - Bugs or logic errors
   - Race conditions
   - Performance concerns
   - Breaking changes

5. **Documentation:**
   - Code comments
   - PR description completeness

Provide specific, actionable feedback. Be constructive and helpful."

echo "Sending review request to Claude API..."

REVIEW_TEXT=$(call_claude "$REVIEW_PROMPT" "claude-opus-4-6" 4000)

echo "Review generated!"
echo ""
echo "--- Review ---"
echo "$REVIEW_TEXT"
echo "--- End Review ---"
echo ""

echo "Posting review as PR comment..."
gh pr comment "$PR_NUMBER" --body "$REVIEW_TEXT"

echo "Review posted to PR #$PR_NUMBER"
