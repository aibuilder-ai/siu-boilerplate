#!/usr/bin/env bash
# test-template.sh — Automated template validation in a /tmp sandbox
#
# Usage:
#   pnpm test:template                                  # test all templates, base only
#   pnpm test:template cloudflare-monorepo              # test specific template, base only
#   pnpm test:template cloudflare-monorepo --addons     # test base + each addon + all addons combined
#   pnpm test:template --addons                         # test all templates with addons
#   pnpm test:template --full                           # test all templates, base + install + build
#   pnpm test:template cloudflare-monorepo --full --addons
#
# Flags:
#   --full      Run full scaffold with install, typecheck, and build (slow, requires network)
#   --addons    Also test each addon individually and all addons combined
#   --keep      Don't clean up temp directories on success (useful for debugging)

set -eo pipefail

# ── Colors ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ── Globals ─────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI="$REPO_ROOT/dist/index.js"
SANDBOX_ROOT="$REPO_ROOT/.sandbox/siu-test-$$"
PASS_COUNT=0
FAIL_COUNT=0
FAILURES=()

# ── Parse args ──────────────────────────────────────────────────────
TEMPLATE_ID=""
FLAG_FULL=false
FLAG_ADDONS=false
FLAG_KEEP=false

for arg in "$@"; do
  case "$arg" in
    --full)   FLAG_FULL=true ;;
    --addons) FLAG_ADDONS=true ;;
    --keep)   FLAG_KEEP=true ;;
    -*)       echo -e "${RED}Unknown flag: $arg${RESET}"; exit 1 ;;
    *)        TEMPLATE_ID="$arg" ;;
  esac
done

# ── Helpers ─────────────────────────────────────────────────────────
pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo -e "  ${GREEN}PASS${RESET} $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  FAILURES+=("$1")
  echo -e "  ${RED}FAIL${RESET} $1"
}

section() {
  echo ""
  echo -e "${CYAN}${BOLD}── $1 ──${RESET}"
}

cleanup() {
  if [ "$FLAG_KEEP" = true ]; then
    echo -e "\n${DIM}Keeping sandbox (--keep): $SANDBOX_ROOT${RESET}"
    return
  fi
  rm -rf "$SANDBOX_ROOT" 2>/dev/null || true
}
trap cleanup EXIT

# Scaffold a project into SANDBOX_ROOT/<name>.
# Usage: scaffold_to <project-name> [cli-flags...]
# Always passes --yes to skip interactive prompts (TTY not available in subshell).
# The project is created inside SANDBOX_ROOT so the CLI receives a clean package name.
scaffold_to() {
  local project_name="$1"; shift
  local dest="$SANDBOX_ROOT/$project_name"
  rm -rf "$dest"
  mkdir -p "$SANDBOX_ROOT"
  (cd "$SANDBOX_ROOT" && node "$CLI" "$project_name" --yes "$@" 2>&1)
}

# ── Discover templates ──────────────────────────────────────────────
get_templates() {
  local templates_dir="$REPO_ROOT/dist/templates"
  if [ ! -d "$templates_dir" ]; then
    echo -e "${RED}dist/templates not found. Run pnpm build first.${RESET}" >&2
    exit 1
  fi
  for d in "$templates_dir"/*/; do
    local name
    name="$(basename "$d")"
    [[ "$name" == _* ]] && continue
    [ -f "$d/template.json" ] && echo "$name"
  done
}

get_addons() {
  local template_id="$1"
  local template_json="$REPO_ROOT/dist/templates/$template_id/template.json"
  node -e "
    const t = require('$template_json');
    console.log(Object.keys(t.addons || {}).join('\n'));
  " 2>/dev/null
}

# ── Phase: Build CLI ────────────────────────────────────────────────
section "Building CLI"
(cd "$REPO_ROOT" && pnpm build 2>&1) | tail -1
echo -e "  ${GREEN}CLI built${RESET}"

# ── Phase: CLI metadata ────────────────────────────────────────────
section "CLI metadata"
LIST_OUTPUT=$(node "$CLI" --list templates 2>&1) || true
if [ -n "$LIST_OUTPUT" ]; then
  pass "--list templates"
else
  fail "--list templates returned no output"
fi

# ── Determine which templates to test ───────────────────────────────
if [ -n "$TEMPLATE_ID" ]; then
  TEMPLATES=("$TEMPLATE_ID")
else
  TEMPLATES=()
  while IFS= read -r line; do TEMPLATES+=("$line"); done < <(get_templates)
fi

if [ ${#TEMPLATES[@]} -eq 0 ]; then
  echo -e "${RED}No templates found.${RESET}"
  exit 1
fi

echo -e "\n${DIM}Templates to test: ${TEMPLATES[*]}${RESET}"
echo -e "${DIM}Sandbox: $SANDBOX_ROOT${RESET}"

# ── Test each template ──────────────────────────────────────────────
for tmpl in "${TEMPLATES[@]}"; do

  # ── Check addon listing ──
  ADDON_OUTPUT=$(node "$CLI" --list addons -t "$tmpl" 2>&1) || true
  if [ -n "$ADDON_OUTPUT" ]; then
    pass "$tmpl: --list addons"
  else
    fail "$tmpl: --list addons"
  fi

  # ── Phase 3: Dry-run scaffold (no install) ──
  section "$tmpl — dry-run (no install)"
  DRY_NAME="test-${tmpl}-dry"
  DEST="$SANDBOX_ROOT/$DRY_NAME"

  OUTPUT=$(scaffold_to "$DRY_NAME" -t "$tmpl" --no-git --no-install 2>&1) || {
    fail "$tmpl: scaffold --no-install exited non-zero"
    echo -e "${DIM}$OUTPUT${RESET}"
    continue
  }
  pass "$tmpl: scaffold --no-install"

  # Check .spinitup.json exists
  if [ -f "$DEST/.spinitup.json" ]; then
    pass "$tmpl: .spinitup.json exists"
  else
    fail "$tmpl: .spinitup.json missing"
  fi

  # Check no remaining {{projectName}}
  LEFTOVER=$(grep -r '{{projectName}}' "$DEST" 2>/dev/null || true)
  if [ -z "$LEFTOVER" ]; then
    pass "$tmpl: no {{projectName}} remaining"
  else
    fail "$tmpl: {{projectName}} found in output files"
    echo -e "${DIM}${LEFTOVER}${RESET}"
  fi

  # Check root package.json has correct name
  if [ -f "$DEST/package.json" ]; then
    PKG_NAME=$(node -e "console.log(require('$DEST/package.json').name || '')" 2>/dev/null)
    if [[ "$PKG_NAME" != *"{{"* ]]; then
      pass "$tmpl: package.json name resolved ($PKG_NAME)"
    else
      fail "$tmpl: package.json name still has template var ($PKG_NAME)"
    fi
  fi

  # ── Phase 4: Full scaffold with install ──
  if [ "$FLAG_FULL" = true ]; then
    section "$tmpl — full scaffold (with install)"
    FULL_NAME="test-${tmpl}-full"
    DEST_FULL="$SANDBOX_ROOT/$FULL_NAME"

    OUTPUT=$(scaffold_to "$FULL_NAME" -t "$tmpl" --no-git 2>&1) || {
      fail "$tmpl: scaffold with install exited non-zero"
      echo -e "${DIM}$OUTPUT${RESET}"
      continue
    }
    pass "$tmpl: scaffold with install"

    # node_modules exists
    if [ -d "$DEST_FULL/node_modules" ]; then
      pass "$tmpl: node_modules exists"
    else
      fail "$tmpl: node_modules missing after install"
    fi

    # typecheck
    if (cd "$DEST_FULL" && pnpm typecheck 2>&1) > /dev/null; then
      pass "$tmpl: typecheck"
    elif (cd "$DEST_FULL" && pnpm exec tsc --noEmit 2>&1) > /dev/null; then
      pass "$tmpl: typecheck (via tsc --noEmit)"
    else
      fail "$tmpl: typecheck failed"
    fi

    # build
    if (cd "$DEST_FULL" && pnpm build 2>&1) > /dev/null; then
      pass "$tmpl: build"
    else
      fail "$tmpl: build failed"
    fi
  fi

  # ── Phase 5-6: Addon tests ──
  if [ "$FLAG_ADDONS" = true ]; then
    ADDONS=()
    while IFS= read -r line; do [ -n "$line" ] && ADDONS+=("$line"); done < <(get_addons "$tmpl")

    if [ ${#ADDONS[@]} -eq 0 ]; then
      echo -e "  ${DIM}No addons for $tmpl, skipping addon tests${RESET}"
      continue
    fi

    # Test each addon individually
    for addon in "${ADDONS[@]}"; do
      [ -z "$addon" ] && continue

      section "$tmpl + $addon (individual)"
      ADDON_NAME="test-${tmpl}-${addon}"
      DEST_ADDON="$SANDBOX_ROOT/$ADDON_NAME"

      if [ "$FLAG_FULL" = true ]; then
        OUTPUT=$(scaffold_to "$ADDON_NAME" -t "$tmpl" -a "$addon" --no-git 2>&1) || {
          fail "$tmpl+$addon: scaffold exited non-zero"
          echo -e "${DIM}$OUTPUT${RESET}"
          continue
        }
        pass "$tmpl+$addon: scaffold"

        # typecheck
        if (cd "$DEST_ADDON" && pnpm typecheck 2>&1) > /dev/null; then
          pass "$tmpl+$addon: typecheck"
        else
          fail "$tmpl+$addon: typecheck failed"
        fi

        # build
        if (cd "$DEST_ADDON" && pnpm build 2>&1) > /dev/null; then
          pass "$tmpl+$addon: build"
        else
          fail "$tmpl+$addon: build failed"
        fi
      else
        # Dry-run only
        OUTPUT=$(scaffold_to "$ADDON_NAME" -t "$tmpl" -a "$addon" --no-git --no-install 2>&1) || {
          fail "$tmpl+$addon: scaffold --no-install exited non-zero"
          echo -e "${DIM}$OUTPUT${RESET}"
          continue
        }
        pass "$tmpl+$addon: scaffold --no-install"

        LEFTOVER=$(grep -r '{{projectName}}' "$DEST_ADDON" 2>/dev/null || true)
        if [ -z "$LEFTOVER" ]; then
          pass "$tmpl+$addon: no {{projectName}} remaining"
        else
          fail "$tmpl+$addon: {{projectName}} found in output files"
        fi
      fi
    done

    # Test all addons combined
    ALL_ADDONS=$(IFS=,; echo "${ADDONS[*]}")
    if [ -n "$ALL_ADDONS" ]; then
      section "$tmpl + ALL addons combined"
      ALL_NAME="test-${tmpl}-all-addons"
      DEST_ALL="$SANDBOX_ROOT/$ALL_NAME"

      if [ "$FLAG_FULL" = true ]; then
        OUTPUT=$(scaffold_to "$ALL_NAME" -t "$tmpl" -a "$ALL_ADDONS" --no-git 2>&1) || {
          fail "$tmpl+all: scaffold exited non-zero"
          echo -e "${DIM}$OUTPUT${RESET}"
          continue
        }
        pass "$tmpl+all: scaffold"

        if (cd "$DEST_ALL" && pnpm typecheck 2>&1) > /dev/null; then
          pass "$tmpl+all: typecheck"
        else
          fail "$tmpl+all: typecheck failed"
        fi

        if (cd "$DEST_ALL" && pnpm build 2>&1) > /dev/null; then
          pass "$tmpl+all: build"
        else
          fail "$tmpl+all: build failed"
        fi

        # Verify .spinitup.json lists all addons
        INSTALLED=$(node -e "
          const s = require('$DEST_ALL/.spinitup.json');
          console.log(s.installedAddons.sort().join(','));
        " 2>/dev/null)
        EXPECTED=$(echo "${ADDONS[*]}" | tr ' ' '\n' | sort | tr '\n' ',' | sed 's/,$//')
        if [ "$INSTALLED" = "$EXPECTED" ]; then
          pass "$tmpl+all: .spinitup.json lists all addons"
        else
          fail "$tmpl+all: .spinitup.json mismatch (got: $INSTALLED, expected: $EXPECTED)"
        fi
      else
        OUTPUT=$(scaffold_to "$ALL_NAME" -t "$tmpl" -a "$ALL_ADDONS" --no-git --no-install 2>&1) || {
          fail "$tmpl+all: scaffold --no-install exited non-zero"
          echo -e "${DIM}$OUTPUT${RESET}"
          continue
        }
        pass "$tmpl+all: scaffold --no-install"

        LEFTOVER=$(grep -r '{{projectName}}' "$DEST_ALL" 2>/dev/null || true)
        if [ -z "$LEFTOVER" ]; then
          pass "$tmpl+all: no {{projectName}} remaining"
        else
          fail "$tmpl+all: {{projectName}} found in output files"
        fi
      fi
    fi
  fi

done

# ── Summary ─────────────────────────────────────────────────────────
section "Summary"
echo -e "  ${GREEN}$PASS_COUNT passed${RESET}"

if [ $FAIL_COUNT -gt 0 ]; then
  echo -e "  ${RED}$FAIL_COUNT failed${RESET}"
  echo ""
  for f in "${FAILURES[@]}"; do
    echo -e "  ${RED}x${RESET} $f"
  done
  exit 1
else
  echo -e "\n  ${GREEN}${BOLD}All checks passed.${RESET}"
  exit 0
fi
