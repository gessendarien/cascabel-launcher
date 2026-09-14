#!/usr/bin/env bash
# ──────────────────────────────────────────────
#  Cascabel Launcher — Linux Build Script
#  Builds the .AppImage (Linux)
#  and places the result in the output/ folder.
# ──────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

OUTPUT_DIR="$SCRIPT_DIR/output"
DIST_DIR="$SCRIPT_DIR/dist"

# ── Colors ──────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Helpers ─────────────────────────────────

# Load nvm if available (node installed via nvm isn't in PATH by default)
load_node_manager() {
  if [ -z "$(command -v node 2>/dev/null)" ]; then
    # Try nvm
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    # Try fnm
    command -v fnm &>/dev/null && eval "$(fnm env)" || true
  fi
}

load_node_manager
print_header() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║   ${BOLD}Cascabel Launcher — Linux Build${NC}${CYAN}        ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
  echo ""
}

check_dependencies() {
  if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    exit 1
  fi

  if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed.${NC}"
    exit 1
  fi

  local needs_install=false

  if [ ! -d "node_modules" ]; then
    needs_install=true
  elif ! npx electron -v &> /dev/null; then
    needs_install=true
  elif ! npx electron-builder --version &> /dev/null; then
    needs_install=true
  fi

  if [ "$needs_install" = true ]; then
    echo ""
    echo -e "${YELLOW}Missing required dependencies to build (including Electron and electron-builder).${NC}"
    read -rp "$(echo -e "${CYAN}Do you want to download and install them now? / ¿Deseas descargarlas e instalarlas ahora? [S/n]: ${NC}")" choice
    case "$choice" in
      [nN][oO]|[nN])
        echo -e "${RED}Build cancelled. Missing required dependencies.${NC}"
        exit 1
        ;;
      *)
        echo -e "${YELLOW}Downloading and installing dependencies...${NC}"
        npm install
        if ! npx electron -v &> /dev/null; then
          node node_modules/electron/install.js || true
        fi
        echo -e "${GREEN}✔ Dependencies installed successfully.${NC}"
        ;;
    esac
  fi
}

clean_output() {
  echo -e "${YELLOW}Cleaning output and dist directories...${NC}"
  rm -rf "$OUTPUT_DIR"
  rm -rf "$DIST_DIR"
  mkdir -p "$OUTPUT_DIR"
}

copy_artifacts() {
  if [ ! -d "$DIST_DIR" ]; then
    echo -e "${RED}Error: dist/ directory not found. Build may have failed.${NC}"
    exit 1
  fi

  mkdir -p "$OUTPUT_DIR"

  # Copy .AppImage files
  find "$DIST_DIR" -maxdepth 1 -name "*.AppImage" -exec cp {} "$OUTPUT_DIR/" \;
  local count
  count=$(find "$OUTPUT_DIR" -maxdepth 1 -name "*.AppImage" 2>/dev/null | wc -l)
  if [ "$count" -eq 0 ]; then
    find "$DIST_DIR" -name "*.AppImage" -exec cp {} "$OUTPUT_DIR/" \;
    count=$(find "$OUTPUT_DIR" -name "*.AppImage" 2>/dev/null | wc -l)
  fi

  if [ "$count" -eq 0 ]; then
    echo -e "${RED}No .AppImage files found in dist/.${NC}"
    exit 1
  fi

  # Make AppImage executable
  chmod +x "$OUTPUT_DIR"/*.AppImage

  echo ""
  echo -e "${GREEN}✔ Build artifacts copied to:${NC} ${BOLD}$OUTPUT_DIR/${NC}"
  echo ""
  echo -e "${CYAN}Contents:${NC}"
  ls -lh "$OUTPUT_DIR/"
}

build_linux() {
  echo ""
  echo -e "${CYAN}Building for Linux (.AppImage)...${NC}"
  echo ""
  npx electron-builder --linux --config.directories.output=dist
  copy_artifacts
}

# ── Main ────────────────────────────────────
print_header
check_dependencies
clean_output
build_linux

echo ""
echo -e "${GREEN}${BOLD}=======================================================${NC}"
echo -e "${GREEN}${BOLD}  BUILD COMPLETED SUCCESSFULLY!${NC}"
echo -e "${GREEN}${BOLD}=======================================================${NC}"
echo ""
echo -e "${GREEN}[OK] The build has finished successfully.${NC}"
echo -e "${GREEN}[OK] Your Linux AppImage is located in the output/ folder:${NC}"
echo -e "     ${BOLD}$OUTPUT_DIR${NC}"
echo ""
