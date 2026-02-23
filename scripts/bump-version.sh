#!/bin/bash
# scripts/bump-version.sh
# Automatically bumps version numbers across the entire codebase
#
# Usage:
#   ./scripts/bump-version.sh 1.0.7
#   ./scripts/bump-version.sh 1.0.7-alpha
#   ./scripts/bump-version.sh 1.0.7 --dry-run    # Preview changes without modifying files
#   ./scripts/bump-version.sh 1.0.7 --force       # Use regex patterns (handles out-of-sync files)
#   ./scripts/bump-version.sh 1.0.7 --force --dry-run

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if version argument is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Version number is required${NC}"
    echo "Usage: $0 <version> [--force] [--dry-run]"
    echo "Example: $0 1.0.7"
    echo "Example: $0 1.0.7-alpha"
    echo "Example: $0 1.0.7 --force  (regex-based, handles out-of-sync files)"
    exit 1
fi

NEW_VERSION="$1"
DRY_RUN=false
FORCE=false

# Parse flags
shift
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=true ;;
        --force)   FORCE=true ;;
        *) echo -e "${RED}Unknown flag: $1${NC}"; exit 1 ;;
    esac
    shift
done

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN MODE: No files will be modified${NC}"
fi

# Validate version format (semantic versioning: x.y.z or x.y.z-prerelease)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
    echo -e "${RED}Error: Invalid version format. Expected format: x.y.z or x.y.z-suffix (e.g., 1.0.7, 1.0.7-alpha)${NC}"
    exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(grep '"version":' client/package.json | head -1 | awk -F: '{ print $2 }' | sed 's/[", ]//g')

if [ -z "$CURRENT_VERSION" ]; then
    echo -e "${RED}Error: Could not determine current version from client/package.json${NC}"
    exit 1
fi

echo -e "${GREEN}Bumping version from ${CURRENT_VERSION} to ${NEW_VERSION}${NC}"
if [ "$FORCE" = true ]; then
    echo -e "${YELLOW}FORCE MODE: Using regex patterns to match any version in known locations${NC}"
fi
echo ""

# Version regex that matches any semver with optional pre-release suffix
# Used in --force mode to match versions that may be out of sync
VER_RE='[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?'

# Function to replace version in a file
replace_version() {
    local file="$1"
    local pattern="$2"
    local replacement="$3"
    local description="$4"

    if [ ! -f "$file" ]; then
        echo -e "${YELLOW}Warning: File not found: $file${NC}"
        return
    fi

    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[DRY RUN] Would update: $file${NC}"
        echo "  Pattern: $pattern"
        echo "  Replacement: $replacement"
        if grep -qE "$pattern" "$file" 2>/dev/null; then
            echo -e "  ${GREEN}✓ Match found${NC}"
        else
            echo -e "  ${RED}✗ No match found${NC}"
        fi
    else
        if sed -i.bak -E "s|$pattern|$replacement|g" "$file" 2>/dev/null; then
            rm -f "${file}.bak"
            echo -e "${GREEN}✓ Updated: $file${NC} ($description)"
        else
            echo -e "${RED}✗ Failed to update: $file${NC}"
        fi
    fi
}

if [ "$FORCE" = true ]; then
    # Force mode: use regex patterns to match any version-like string in known locations
    replace_version \
        "client/package.json" \
        "\"version\": \"${VER_RE}\"" \
        "\"version\": \"${NEW_VERSION}\"" \
        "package.json version"

    replace_version \
        "MODULE.bazel" \
        "version = \"${VER_RE}\"" \
        "version = \"${NEW_VERSION}\"" \
        "Bazel module version"

    for html_file in "client/index.html" "client/view.html" "client/delete.html"; do
        replace_version \
            "$html_file" \
            "version-display\">v${VER_RE}</a>" \
            "version-display\">v${NEW_VERSION}</a>" \
            "HTML version display"
    done

    replace_version \
        "client/tests/e2e/delete-paste.spec.ts" \
        "toContainText\('v${VER_RE}'\)" \
        "toContainText('v${NEW_VERSION}')" \
        "E2E test version assertion"

    replace_version \
        "server/docs/API.md" \
        "Current API version: \*\*${VER_RE}\*\*" \
        "Current API version: **${NEW_VERSION}**" \
        "API documentation version"
else
    # Normal mode: exact string matching against CURRENT_VERSION
    replace_version \
        "client/package.json" \
        "\"version\": \"${CURRENT_VERSION}\"," \
        "\"version\": \"${NEW_VERSION}\"," \
        "package.json version"

    replace_version \
        "MODULE.bazel" \
        "\"version\": \"${CURRENT_VERSION}\"," \
        "\"version\": \"${NEW_VERSION}\"," \
        "Bazel module version"

    for html_file in "client/index.html" "client/view.html" "client/delete.html"; do
        replace_version \
            "$html_file" \
            "class=\"version-display\">v${CURRENT_VERSION}</a>" \
            "class=\"version-display\">v${NEW_VERSION}</a>" \
            "HTML version display"
    done

    replace_version \
        "client/tests/e2e/delete-paste.spec.ts" \
        "toContainText('v${CURRENT_VERSION}');" \
        "toContainText('v${NEW_VERSION}');" \
        "E2E test version assertion"

    replace_version \
        "server/docs/API.md" \
        "Current API version: \*\*${CURRENT_VERSION}\*\*" \
        "Current API version: **${NEW_VERSION}**" \
        "API documentation version"
fi

echo ""
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}Dry run completed. No files were modified.${NC}"
    echo "Run without --dry-run to apply changes."
else
    echo -e "${GREEN}Version bump completed successfully!${NC}"
    echo ""
    echo "Updated files:"
    echo "  - client/package.json"
    echo "  - MODULE.bazel"
    echo "  - client/index.html"
    echo "  - client/view.html"
    echo "  - client/delete.html"
    echo "  - client/tests/e2e/delete-paste.spec.ts"
    echo "  - server/docs/API.md"
    echo ""
    echo "Next steps:"
    echo "  1. Review the changes: git diff"
    echo "  2. Commit the changes: git commit -am 'chore: bump version to v${NEW_VERSION}'"
    echo "  3. Create release branch: git checkout -b release/v${NEW_VERSION}"
fi
