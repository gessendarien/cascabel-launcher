#!/usr/bin/env bash
# ──────────────────────────────────────────────
#  Cascabel Launcher — Build Script
#  Builds the .exe (Windows) or .AppImage (Linux)
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
  echo -e "${CYAN}║   ${BOLD}Cascabel Launcher — Build Menu${NC}${CYAN}       ║${NC}"
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

  if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
  fi
}

clean_output() {
  echo -e "${YELLOW}Cleaning output directory...${NC}"
  rm -rf "$OUTPUT_DIR"
  mkdir -p "$OUTPUT_DIR"
}

copy_artifacts() {
  local platform="$1"

  if [ ! -d "$DIST_DIR" ]; then
    echo -e "${RED}Error: dist/ directory not found. Build may have failed.${NC}"
    exit 1
  fi

  mkdir -p "$OUTPUT_DIR"

  if [ "$platform" = "win" ]; then
    # Copy .exe files
    find "$DIST_DIR" -name "*.exe" -exec cp {} "$OUTPUT_DIR/" \;
    local count
    count=$(find "$OUTPUT_DIR" -name "*.exe" 2>/dev/null | wc -l)
    if [ "$count" -eq 0 ]; then
      echo -e "${RED}No .exe files found in dist/.${NC}"
      exit 1
    fi
  elif [ "$platform" = "linux" ]; then
    # Copy .AppImage files
    find "$DIST_DIR" -name "*.AppImage" -exec cp {} "$OUTPUT_DIR/" \;
    local count
    count=$(find "$OUTPUT_DIR" -name "*.AppImage" 2>/dev/null | wc -l)
    if [ "$count" -eq 0 ]; then
      echo -e "${RED}No .AppImage files found in dist/.${NC}"
      exit 1
    fi
    # Make AppImage executable
    chmod +x "$OUTPUT_DIR"/*.AppImage
  fi

  echo ""
  echo -e "${GREEN}✔ Build artifacts copied to:${NC} ${BOLD}$OUTPUT_DIR/${NC}"
  echo ""
  echo -e "${CYAN}Contents:${NC}"
  ls -lh "$OUTPUT_DIR/"
}

build_windows() {
  echo ""
  echo -e "${CYAN}Building for Windows (.exe)...${NC}"
  echo ""
  npx electron-builder --win --config.directories.output=dist
  copy_artifacts "win"
}

build_linux() {
  echo ""
  echo -e "${CYAN}Building for Linux (.AppImage)...${NC}"
  echo ""
  npx electron-builder --linux --config.directories.output=dist
  copy_artifacts "linux"
}


# ── Main ────────────────────────────────────
print_header
check_dependencies

echo -e "  ${BOLD}1)${NC}  Build for Linux    (.AppImage)"
echo -e "  ${BOLD}2)${NC}  Build for Windows  (.exe)"
echo -e "  ${BOLD}0)${NC}  Exit"
echo ""
read -rp "$(echo -e "${CYAN}Select an option [0-2]:${NC} ")" choice

case "$choice" in
  1)
    clean_output
    build_linux
    ;;
  2)
    clean_output
    build_windows
    ;;
  0)
    echo -e "${YELLOW}Cancelled.${NC}"
    exit 0
    ;;
  *)
    echo -e "${RED}Invalid option.${NC}"
    exit 1
    ;;
esac

echo ""
echo -e "${GREEN}${BOLD}Build completed successfully!${NC}"
