#!/bin/bash
# scripts/lib/anthropic-api.sh — shared helper for calling the Anthropic Messages API.
#
# Source this file, then call:
#   call_claude "<prompt>" [model] [max_tokens]
#
# Returns the response text on stdout. Exits 1 on error.
#
# Dependencies: curl, jq
# Environment: ANTHROPIC_API_KEY must be set (or passed as ANTHROPIC_API_KEY before sourcing)

# Validate shared dependencies once at source time
if ! command -v jq &>/dev/null; then
  echo "Error: jq is required. Install with: brew install jq  or  apt install jq" >&2
  exit 1
fi

# Default model — callers can override via the second argument to call_claude
ANTHROPIC_DEFAULT_MODEL="${ANTHROPIC_DEFAULT_MODEL:-claude-haiku-4-5-20251001}"

# call_claude <prompt> [model] [max_tokens]
#
# Sends a single-turn message to the Anthropic API and prints the assistant reply.
# Exits 1 if the API call fails or the response cannot be parsed.
call_claude() {
  local prompt="$1"
  local model="${2:-$ANTHROPIC_DEFAULT_MODEL}"
  local max_tokens="${3:-1024}"
  local api_key="${ANTHROPIC_API_KEY}"

  if [ -z "$api_key" ]; then
    echo "Error: ANTHROPIC_API_KEY is not set." >&2
    exit 1
  fi

  local payload
  payload=$(jq -n \
    --arg model "$model" \
    --argjson max_tokens "$max_tokens" \
    --arg content "$prompt" \
    '{model: $model, max_tokens: $max_tokens, messages: [{role: "user", content: $content}]}')

  local response
  response=$(curl -sf https://api.anthropic.com/v1/messages \
    -H "x-api-key: $api_key" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "$payload") || {
    echo "Error: Anthropic API request failed." >&2
    exit 1
  }

  local text
  text=$(echo "$response" | jq -r '.content[0].text' 2>/dev/null)

  if [ -z "$text" ] || [ "$text" = "null" ]; then
    echo "Error: unexpected API response:" >&2
    echo "$response" >&2
    exit 1
  fi

  echo "$text"
}
