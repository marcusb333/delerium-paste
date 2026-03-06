#!/bin/bash

# Local deployment script for delerium-paste (Bazel)
# This script sets up and runs the server locally with Bazel

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# PostgreSQL connection — requires a running PostgreSQL instance.
# Start one quickly with: docker compose up -d postgres
export DB_PATH="${DB_PATH:-jdbc:postgresql://localhost:5432/delerium}"
export DB_USER="${DB_USER:-delerium}"
export DB_PASSWORD="${DB_PASSWORD:-delerium}"

# Generate a pepper if not set (optional for local dev)
if [ -z "$DELETION_TOKEN_PEPPER" ]; then
    echo "ℹ️  DELETION_TOKEN_PEPPER not set. Using auto-generated pepper for local development."
    echo "   For production, set DELETION_TOKEN_PEPPER explicitly."
fi

# Check if Bazel is installed
if ! command -v bazel &> /dev/null; then
    echo "❌ Bazel not found. Please install Bazelisk first:"
    echo "   Run: ./scripts/setup-bazel.sh"
    exit 1
fi

echo "🚀 Starting delerium-paste (Bazel)..."
echo "   Database: ${DB_PATH}"
echo "   Port: 8080"
echo "   Access: http://localhost:8080"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Run the server with Bazel
exec bazel run //server:delerium_server
