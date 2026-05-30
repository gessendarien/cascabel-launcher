#!/usr/bin/env bash
# ──────────────────────────────────────────────
#  Cascabel Launcher — Version Bump Script
#  Usage: ./bump_version.sh <new_version>
#  Example: ./bump_version.sh 1.2.0
# ──────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colors ──────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

# ── Validate input ──────────────────────────
NEW_VERSION="$1"

if [ -z "$NEW_VERSION" ]; then
  echo -e "${RED}Error: No version specified.${NC}"
  echo -e "Usage: ${BOLD}./bump_version.sh <new_version>${NC}"
  echo -e "Example: ${CYAN}./bump_version.sh 1.2.0${NC}"
  exit 1
fi

# Validate semver format (x.y.z)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${RED}Error: Version must follow semver format (e.g. 1.2.0)${NC}"
  exit 1
fi

# ── Get current version from package.json ───
CURRENT_VERSION=$(grep -oP '"version":\s*"\K[^"]+' package.json)

if [ -z "$CURRENT_VERSION" ]; then
  echo -e "${RED}Error: Could not read current version from package.json${NC}"
  exit 1
fi

if [ "$CURRENT_VERSION" = "$NEW_VERSION" ]; then
  echo -e "${YELLOW}Version is already ${BOLD}$NEW_VERSION${NC}${YELLOW}. Nothing to do.${NC}"
  exit 0
fi

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   ${BOLD}Cascabel Launcher — Version Bump${NC}${CYAN}     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Current version: ${YELLOW}${BOLD}$CURRENT_VERSION${NC}"
echo -e "  New version:     ${GREEN}${BOLD}$NEW_VERSION${NC}"
echo ""

UPDATED_FILES=()

# ── 1. package.json ─────────────────────────
if [ -f "package.json" ]; then
  sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
  UPDATED_FILES+=("package.json")
  echo -e "  ${GREEN}✔${NC} package.json"
fi

# ── 1b. package-lock.json ───────────────────
if [ -f "package-lock.json" ]; then
  sed -i "1,20s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package-lock.json
  UPDATED_FILES+=("package-lock.json")
  echo -e "  ${GREEN}✔${NC} package-lock.json"
fi

# ── 2. README.md ────────────────────────────
if [ -f "README.md" ]; then
  sed -i "s/Current version: $CURRENT_VERSION/Current version: $NEW_VERSION/" README.md
  UPDATED_FILES+=("README.md")
  echo -e "  ${GREEN}✔${NC} README.md"
fi

# ── 3. Website index.html (if it exists) ────
#    Looks for a version meta tag or visible text
WEBSITE_FILES=$(find . -name "index.html" -not -path "./node_modules/*" -not -path "./dist/*" -not -path "./output/*" -not -path "./src/index.html" 2>/dev/null || true)

for html_file in $WEBSITE_FILES; do
  if grep -q "$CURRENT_VERSION" "$html_file"; then
    sed -i "s/$CURRENT_VERSION/$NEW_VERSION/g" "$html_file"
    UPDATED_FILES+=("$html_file")
    echo -e "  ${GREEN}✔${NC} $html_file"
  fi
done

# ── 4. installer.nsh (if version is referenced) ─
if [ -f "installer.nsh" ] && grep -q "$CURRENT_VERSION" "installer.nsh"; then
  sed -i "s/$CURRENT_VERSION/$NEW_VERSION/g" installer.nsh
  UPDATED_FILES+=("installer.nsh")
  echo -e "  ${GREEN}✔${NC} installer.nsh"
fi

# ── Summary ─────────────────────────────────
echo ""
if [ ${#UPDATED_FILES[@]} -eq 0 ]; then
  echo -e "${YELLOW}No files were updated.${NC}"
else
  echo -e "${GREEN}${BOLD}Version bumped: $CURRENT_VERSION → $NEW_VERSION${NC}"
  echo -e "${CYAN}Updated ${#UPDATED_FILES[@]} file(s).${NC}"
fi

echo ""
echo -e "${YELLOW}Reminder: Don't forget to commit and tag the release:${NC}"
echo -e "  ${BOLD}git add -A${NC}"
echo -e "  ${BOLD}git commit -m \"bump: v$NEW_VERSION\"${NC}"
echo -e "  ${BOLD}git tag v$NEW_VERSION${NC}"
echo -e "  ${BOLD}git push origin main --tags${NC}"
echo ""
