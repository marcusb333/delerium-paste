#!/bin/bash
# scripts/release.sh
# End-to-end release automation for Delerium Paste
#
# Usage:
#   ./scripts/release.sh [--patch|--minor|--major] [--dry-run] [--no-wait] [--continue] [--skip-docker]
#
# Phases:
#   1. Release PR   — strip pre-release suffix, bump version, open PR
#   2. Wait for merge — poll until PR is merged (or --no-wait to exit)
#   3. Post-merge   — tag, GitHub release, Docker push
#   4. Dev bump PR  — bump to next dev version (e.g., 1.2.0-alpha), open PR
#
# State is persisted in .release-state so --continue can resume after interruption.

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

STATE_FILE=".release-state"
POLL_INTERVAL=30
POLL_TIMEOUT=1800  # 30 minutes

# --- Argument parsing ---
BUMP_TYPE="patch"
DRY_RUN=false
NO_WAIT=false
CONTINUE=false
SKIP_DOCKER=false

while [ $# -gt 0 ]; do
    case "$1" in
        --patch)       BUMP_TYPE="patch" ;;
        --minor)       BUMP_TYPE="minor" ;;
        --major)       BUMP_TYPE="major" ;;
        --dry-run)     DRY_RUN=true ;;
        --no-wait)     NO_WAIT=true ;;
        --continue)    CONTINUE=true ;;
        --skip-docker) SKIP_DOCKER=true ;;
        *)
            echo -e "${RED}Unknown flag: $1${NC}"
            echo "Usage: $0 [--patch|--minor|--major] [--dry-run] [--no-wait] [--continue] [--skip-docker]"
            exit 1
            ;;
    esac
    shift
done

# --- Helper functions ---

die() {
    echo -e "${RED}Error: $1${NC}" >&2
    exit 1
}

info() {
    echo -e "${BLUE}→ $1${NC}"
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

save_state() {
    local key="$1" value="$2"
    if grep -q "^${key}=" "$STATE_FILE" 2>/dev/null; then
        sed -i.bak "s|^${key}=.*|${key}=${value}|" "$STATE_FILE"
        rm -f "${STATE_FILE}.bak"
    else
        echo "${key}=${value}" >> "$STATE_FILE"
    fi
}

load_state() {
    local key="$1"
    if [ -f "$STATE_FILE" ]; then
        grep "^${key}=" "$STATE_FILE" 2>/dev/null | cut -d= -f2 || true
    fi
}

cleanup_state() {
    rm -f "$STATE_FILE"
}

strip_prerelease() {
    echo "$1" | sed 's/-.*//'
}

compute_next_version() {
    local version="$1" bump="$2"
    local base
    base=$(strip_prerelease "$version")
    IFS='.' read -r major minor patch <<< "$base"

    case "$bump" in
        patch) echo "$major.$minor.$((patch + 1))" ;;
        minor) echo "$major.$((minor + 1)).0" ;;
        major) echo "$((major + 1)).0.0" ;;
    esac
}

# --- Error trap ---

on_error() {
    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}Release script failed!${NC}"
    echo ""
    if [ -f "$STATE_FILE" ]; then
        echo -e "${YELLOW}State saved in ${STATE_FILE}. Resume with:${NC}"
        echo "  ./scripts/release.sh --continue"
    fi
    echo ""
    echo "To abort and clean up:"
    echo "  rm -f ${STATE_FILE}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}
trap on_error ERR

# --- Preflight checks ---

preflight() {
    info "Running preflight checks..."

    if [ "$DRY_RUN" = false ]; then
        # Clean working tree
        if [ -n "$(git status --porcelain)" ]; then
            die "Working tree is not clean. Commit or stash your changes first."
        fi

        # On main and up-to-date
        local current_branch
        current_branch=$(git branch --show-current)
        if [ "$current_branch" != "main" ] && [ "$CONTINUE" = false ]; then
            die "Must be on 'main' branch (currently on '${current_branch}'). Run: git checkout main"
        fi

        if [ "$CONTINUE" = false ]; then
            git fetch origin main --quiet
            local behind
            behind=$(git rev-list --count HEAD..origin/main)
            if [ "$behind" -gt 0 ]; then
                die "Local main is ${behind} commit(s) behind origin/main. Run: git pull"
            fi
        fi
    else
        info "(dry-run: skipping working tree and branch checks)"
    fi

    # gh CLI authenticated
    if ! gh auth status >/dev/null 2>&1; then
        die "'gh' CLI is not authenticated. Run: gh auth login"
    fi

    # Docker available (unless skipping)
    if [ "$SKIP_DOCKER" = false ] && [ "$DRY_RUN" = false ]; then
        if ! docker info >/dev/null 2>&1; then
            die "Docker is not available. Start Docker or use --skip-docker."
        fi
    fi

    success "Preflight checks passed"
}

# --- Phase 1: Release PR ---

phase_release_pr() {
    info "Phase 1: Creating release PR..."

    # Get current version from package.json
    local current_version
    current_version=$(grep '"version":' client/package.json | head -1 | awk -F: '{ print $2 }' | sed 's/[", ]//g')

    # Strip pre-release suffix to get release version
    local release_version
    release_version=$(strip_prerelease "$current_version")

    if [ "$release_version" = "$current_version" ]; then
        warn "Current version ${current_version} has no pre-release suffix."
        warn "Will release as ${release_version}."
    fi

    # Compute next dev version
    local next_dev_version
    next_dev_version="$(compute_next_version "$release_version" "$BUMP_TYPE")-alpha"

    echo ""
    echo -e "${GREEN}Release plan:${NC}"
    echo "  Current version:  ${current_version}"
    echo "  Release version:  ${release_version}"
    echo "  Next dev version: ${next_dev_version}"
    echo "  Bump type:        ${BUMP_TYPE}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[DRY RUN] Would create release branch, bump to ${release_version}, and open PR${NC}"
        echo -e "${YELLOW}[DRY RUN] After merge: tag v${release_version}, create GitHub release, push Docker${NC}"
        echo -e "${YELLOW}[DRY RUN] Then bump to ${next_dev_version} and open dev bump PR${NC}"
        return 0
    fi

    # Save state
    save_state "RELEASE_VERSION" "$release_version"
    save_state "NEXT_DEV_VERSION" "$next_dev_version"
    save_state "BUMP_TYPE" "$BUMP_TYPE"
    save_state "PHASE" "release_pr"

    # Create release branch
    local branch="release/v${release_version}"
    info "Creating branch: ${branch}"
    git checkout -b "$branch"

    # Bump version with --force to handle out-of-sync files
    info "Bumping version to ${release_version}..."
    chmod +x scripts/bump-version.sh
    ./scripts/bump-version.sh "$release_version" --force

    # Commit and push
    git add -A
    git commit -m "chore: release v${release_version}"
    git push -u origin "$branch"

    # Open PR
    local pr_url
    pr_url=$(gh pr create \
        --title "release: v${release_version}" \
        --body "$(cat <<EOF
## Summary
Release v${release_version} — strips pre-release suffix and syncs version across all files.

## Changes
- Version bumped to ${release_version} in all codebase locations (package.json, MODULE.bazel, HTML files, e2e tests, API docs)

## Test plan
- [ ] CI passes (lint, typecheck, tests, coverage)
- [ ] Version is consistent across all files
EOF
)" \
        --base main \
        --head "$branch")

    # Extract PR number
    local pr_number
    pr_number=$(echo "$pr_url" | grep -o '[0-9]*$')

    save_state "PR_NUMBER" "$pr_number"
    save_state "PR_URL" "$pr_url"
    save_state "PHASE" "wait_for_merge"

    success "Release PR created: ${pr_url}"
    echo ""

    # Go back to main for the next phases
    git checkout main
}

# --- Phase 2: Wait for merge ---

phase_wait_for_merge() {
    local pr_number
    pr_number=$(load_state "PR_NUMBER")
    local release_version
    release_version=$(load_state "RELEASE_VERSION")

    if [ -z "$pr_number" ]; then
        die "No PR number found in state file. Cannot wait for merge."
    fi

    if [ "$NO_WAIT" = true ]; then
        echo ""
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}--no-wait specified. Release paused.${NC}"
        echo ""
        echo "Next steps:"
        echo "  1. Review and merge PR #${pr_number}"
        echo "  2. Resume with: ./scripts/release.sh --continue"
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        return 0
    fi

    info "Phase 2: Waiting for PR #${pr_number} to be merged..."
    echo "  (polling every ${POLL_INTERVAL}s, timeout ${POLL_TIMEOUT}s)"
    echo "  Press Ctrl+C to abort (resume later with --continue)"
    echo ""

    local elapsed=0
    while [ "$elapsed" -lt "$POLL_TIMEOUT" ]; do
        local state
        state=$(gh pr view "$pr_number" --json state --jq '.state')

        if [ "$state" = "MERGED" ]; then
            success "PR #${pr_number} has been merged!"
            save_state "PHASE" "post_merge"
            return 0
        elif [ "$state" = "CLOSED" ]; then
            die "PR #${pr_number} was closed without merging. Aborting release."
        fi

        echo -ne "\r  Waiting... (${elapsed}s / ${POLL_TIMEOUT}s) — PR state: ${state}  "
        sleep "$POLL_INTERVAL"
        elapsed=$((elapsed + POLL_INTERVAL))
    done

    echo ""
    die "Timed out waiting for PR #${pr_number} to be merged. Resume with: ./scripts/release.sh --continue"
}

# --- Phase 3: Post-merge (tag, release, docker) ---

phase_post_merge() {
    local release_version
    release_version=$(load_state "RELEASE_VERSION")

    info "Phase 3: Post-merge tasks for v${release_version}..."

    # Update main
    git checkout main
    git pull origin main

    # Create annotated tag
    local tag="v${release_version}"
    if git rev-parse "refs/tags/${tag}" >/dev/null 2>&1; then
        warn "Tag ${tag} already exists, skipping tag creation."
    else
        info "Creating annotated tag: ${tag}"
        git tag -a "$tag" -m "Release ${tag}"
        git push origin "$tag"
        success "Tag ${tag} pushed"
    fi

    # Create GitHub release
    local existing_release
    existing_release=$(gh release view "$tag" --json tagName --jq '.tagName' 2>/dev/null || true)
    if [ "$existing_release" = "$tag" ]; then
        warn "GitHub release for ${tag} already exists, skipping."
    else
        info "Creating GitHub release..."
        gh release create "$tag" \
            --title "Release ${tag}" \
            --generate-notes
        success "GitHub release created for ${tag}"
    fi

    # Docker push (multi-arch: linux/amd64 + linux/arm64)
    if [ "$SKIP_DOCKER" = false ]; then
        info "Building and pushing multi-arch Docker image..."
        make push-multiarch REGISTRY=marcusb333 TAG="$tag"
        success "Docker image pushed: marcusb333/delerium-server:${tag} (amd64 + arm64)"
    else
        warn "Skipping Docker push (--skip-docker)"
    fi

    save_state "PHASE" "dev_bump"
    success "Post-merge tasks complete"
}

# --- Phase 4: Dev bump PR ---

phase_dev_bump() {
    local release_version
    release_version=$(load_state "RELEASE_VERSION")
    local next_dev_version
    next_dev_version=$(load_state "NEXT_DEV_VERSION")

    info "Phase 4: Bumping to next dev version ${next_dev_version}..."

    # Make sure we're on main and up-to-date
    git checkout main
    git pull origin main

    # Create dev bump branch
    local branch="chore/bump-version-${next_dev_version}"
    info "Creating branch: ${branch}"
    git checkout -b "$branch"

    # Bump version with --force
    info "Bumping version to ${next_dev_version}..."
    ./scripts/bump-version.sh "$next_dev_version" --force

    # Commit and push
    git add -A
    git commit -m "chore: bump version to ${next_dev_version}"
    git push -u origin "$branch"

    # Open PR
    local pr_url
    pr_url=$(gh pr create \
        --title "chore: bump version to v${next_dev_version}" \
        --body "$(cat <<EOF
## Summary
Post-release version bump after v${release_version}. Sets version to ${next_dev_version} for ongoing development.

## Changes
- Version bumped to ${next_dev_version} in all codebase locations

## Test plan
- [ ] CI passes
EOF
)" \
        --base main \
        --head "$branch")

    success "Dev bump PR created: ${pr_url}"

    # Return to main and clean up
    git checkout main
    cleanup_state
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Release v${release_version} complete!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# --- Main ---

main() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Delerium Paste — Release Script${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}DRY RUN MODE — no changes will be made${NC}"
        echo ""
        preflight
        phase_release_pr
        return 0
    fi

    # Resume from state file
    if [ "$CONTINUE" = true ]; then
        if [ ! -f "$STATE_FILE" ]; then
            die "No ${STATE_FILE} found. Nothing to continue."
        fi

        local phase
        phase=$(load_state "PHASE")
        info "Resuming from phase: ${phase}"
        echo ""

        case "$phase" in
            release_pr)
                phase_release_pr
                phase_wait_for_merge
                [ "$NO_WAIT" = true ] && return 0
                phase_post_merge
                phase_dev_bump
                ;;
            wait_for_merge)
                phase_wait_for_merge
                [ "$NO_WAIT" = true ] && return 0
                phase_post_merge
                phase_dev_bump
                ;;
            post_merge)
                phase_post_merge
                phase_dev_bump
                ;;
            dev_bump)
                phase_dev_bump
                ;;
            *)
                die "Unknown phase: ${phase}"
                ;;
        esac
        return 0
    fi

    # Fresh release
    preflight
    phase_release_pr
    phase_wait_for_merge
    [ "$NO_WAIT" = true ] && return 0
    phase_post_merge
    phase_dev_bump
}

main
