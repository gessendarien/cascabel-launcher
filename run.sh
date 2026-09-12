#!/usr/bin/env bash
# ──────────────────────────────────────────────
#  Cascabel Launcher — Run Script
# ──────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

# Cargar gestor de Node (nvm, fnm) si está disponible
load_node_manager() {
  if [ -z "$(command -v node 2>/dev/null)" ]; then
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    command -v fnm &>/dev/null && eval "$(fnm env)" || true
  fi
}

load_node_manager

check_and_install_dependencies() {
  if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js no está instalado.${NC}"
    exit 1
  fi

  if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm no está instalado.${NC}"
    exit 1
  fi

  local needs_install=false

  if [ ! -d "node_modules" ]; then
    needs_install=true
  elif ! npx electron -v &> /dev/null; then
    needs_install=true
  fi

  if [ "$needs_install" = true ]; then
    echo ""
    echo -e "${YELLOW}Faltan dependencias necesarias para ejecutar la aplicación (incluyendo Electron).${NC}"
    read -rp "$(echo -e "${CYAN}¿Deseas descargarlas e instalarlas ahora? [S/n]: ${NC}")" choice
    case "$choice" in
      [nN][oO]|[nN])
        echo -e "${RED}Operación cancelada. Se requieren las dependencias para ejecutar la aplicación.${NC}"
        exit 1
        ;;
      *)
        echo -e "${YELLOW}Descargando e instalando dependencias...${NC}"
        npm install
        if ! npx electron -v &> /dev/null; then
          node node_modules/electron/install.js || true
        fi
        echo -e "${GREEN}✔ Dependencias instaladas correctamente.${NC}"
        ;;
    esac
  fi
}

check_and_install_dependencies

echo ""
echo -e "${CYAN}Iniciando Cascabel Launcher...${NC}"
npm start
