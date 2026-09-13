const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const coverScraper = require('./coverScraper');
let config = { emulators: [] };

// Cache en memoria para juegos y DOM de cada emulador (evita relectura y re-renderizado al navegar entre pestañas)
const emulatorGamesCache = new Map();
const emulatorDOMCache = new Map();
const emulatorScrapedSet = new Set();

// Variables globales para internacionalización
let currentLanguage = {};
let availableLanguages = [];

// Variable global para controlar el debounce de clics en juegos
let isGameLaunching = false;
let gameClickCooldown = 2000; // 2 segundos en millisegundos

// Ejecutar cuando el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
  // Cargar configuración al inicio
  loadConfig();
  
  // Event listeners para el foco de la ventana (música de fondo)
  window.addEventListener('focus', function() {
    // Pequeño delay para evitar cambios bruscos
    setTimeout(() => {
      if (backgroundAudio) {
        fadeInAudio();
      }
    }, 100);
  });
  
  window.addEventListener('blur', function() {
    if (backgroundAudio) {
      fadeOutAudio();
    }
  });
  
  // También escuchar cambios de visibilidad de la página
  document.addEventListener('visibilitychange', function() {
    if (backgroundAudio) {
      if (document.hidden) {
        fadeOutAudio();
      } else {
        setTimeout(() => {
          fadeInAudio();
        }, 100);
      }
    }
  });
});

// Cargar configuración desde el almacenamiento
async function loadConfig() {
  try {
    const loaded = await ipcRenderer.invoke('load-config');
    if (loaded) {
      config = loaded;
      emulatorGamesCache.clear();
      emulatorDOMCache.clear();
      emulatorScrapedSet.clear();
    }
    renderTabs();
    applySavedTheme(); // Aplicar tema guardado
    loadBackgroundMusic(); // Cargar música de fondo
    await loadLanguage(); // Cargar idioma
  } catch (error) {
    console.error('Error loading configuration:', error);
  }
}

// Actualizar la imagen de perfil en todos los lugares (navbar y modal si está abierto)
function globalUpdateProfileImage() {
  const hasCustomPhoto = !!(config.theme && config.theme.profileImage);
  
  // 1. Imagen en navbar
  const profileImage = document.querySelector('.profile-image-navbar');
  if (profileImage) {
    profileImage.src = hasCustomPhoto ? config.theme.profileImage : '../assets/default-profile.png';
  }

  // 2. Modal de configuración (vista previa y clases)
  const profilePreview = document.getElementById('profile-image-preview');
  const profileContainer = document.querySelector('.config-profile-image-container') || document.querySelector('.profile-image-container');
  const profileCard = document.querySelector('.config-profile-card');
  const profileWrapper = document.querySelector('.config-profile-wrapper');
  const profileRemoveHover = document.getElementById('profile-remove-hover-text');
  
  if (profilePreview) {
    if (hasCustomPhoto) {
      profilePreview.style.backgroundImage = `url(${config.theme.profileImage})`;
      if (profileContainer) profileContainer.classList.add('has-custom-image');
      if (profileCard) profileCard.classList.add('has-custom-image');
      if (profileWrapper) profileWrapper.classList.add('has-custom-image');
      if (profileRemoveHover) profileRemoveHover.style.display = 'block';
    } else {
      profilePreview.style.backgroundImage = 'url(../assets/default-profile.png)';
      if (profileContainer) profileContainer.classList.remove('has-custom-image');
      if (profileCard) profileCard.classList.remove('has-custom-image');
      if (profileWrapper) profileWrapper.classList.remove('has-custom-image');
      if (profileRemoveHover) profileRemoveHover.style.display = 'none';
    }
    profilePreview.style.backgroundSize = 'cover';
    profilePreview.style.backgroundPosition = 'center';
  }
}

// Funciones de internacionalización
async function loadAvailableLanguages() {
  try {
    const languagesPath = path.join(__dirname, 'languages');
    
    // Verificar que la carpeta existe
    if (!fs.existsSync(languagesPath)) {
      console.warn('Languages folder not found:', languagesPath);
      availableLanguages = [];
      return;
    }
    
    const files = fs.readdirSync(languagesPath).filter(file => file.endsWith('.json'));
    
    availableLanguages = [];
    for (const file of files) {
      try {
        const filePath = path.join(languagesPath, file);
        const languageData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Validar que tiene la estructura mínima requerida
        if (languageData.languageName && languageData.ui) {
          availableLanguages.push({
            fileName: file,
            languageName: languageData.languageName,
            languageCode: languageData.languageCode || 'unknown',
            displayName: languageData.languageName // Para mostrar en el select
          });
        } else {
          console.warn(`Invalid language file structure: ${file}`);
        }
      } catch (error) {
        console.error(`Error loading language file ${file}:`, error);
      }
    }
    
  } catch (error) {
    availableLanguages = [];
  }
}

async function loadLanguage(targetLanguageName = null) {
  try {
    // Cargar idiomas disponibles si no están cargados
    if (availableLanguages.length === 0) {
      await loadAvailableLanguages();
    }
    
    // Si no se especifica idioma, usar el de la configuración o buscar español por defecto
    let languageToLoad = targetLanguageName;
    if (!languageToLoad) {
      languageToLoad = config.ui?.language || 'English';
    }
    
    // Buscar el idioma por nombre (más flexible)
    let languageInfo = availableLanguages.find(lang => 
      lang.languageName === languageToLoad || 
      lang.languageCode === languageToLoad ||
      lang.fileName === languageToLoad
    );
    
    // Si no se encuentra, usar el primer idioma disponible o español como fallback
    if (!languageInfo && availableLanguages.length > 0) {
      // Intentar encontrar inglés
      languageInfo = availableLanguages.find(lang => 
        lang.languageName.toLowerCase().includes('english') ||
        lang.languageCode === 'en'
      );
      
      // Si no hay inglés, usar el primer idioma disponible
      if (!languageInfo) {
        languageInfo = availableLanguages[0];
      }
    }
    
    if (!languageInfo) {
      throw new Error('No language files found');
    }
    
    // Cargar el archivo de idioma
    const languagePath = path.join(__dirname, 'languages', languageInfo.fileName);
    
    currentLanguage = JSON.parse(fs.readFileSync(languagePath, 'utf8'));
    
    // Guardar el idioma en la configuración usando el nombre del idioma
    if (!config.ui) config.ui = {};
    config.ui.language = languageInfo.languageName;
    saveConfig();
    
    // Actualizar la interfaz
    updateUI();
    
  } catch (error) {
    
    // Fallback absoluto: intentar cargar inglés directamente
    try {
      const fallbackPath = path.join(__dirname, 'languages', 'English.json');
      if (fs.existsSync(fallbackPath)) {
        currentLanguage = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
      }
    } catch (fallbackError) {
      // Si todo falla, usar un objeto básico para evitar crashes
      currentLanguage = { 
        languageName: 'Fallback', 
        ui: { 
          buttons: { save: 'Guardar', cancel: 'Cancelar' },
          menu: { search: 'Buscar...' }
        } 
      };
    }
  }
}

function t(key) {
  // Función para obtener texto traducido usando notación de punto
  // Ejemplo: t('ui.buttons.save') retorna currentLanguage.ui.buttons.save
  
  // Fallback simple - cargar inglés por defecto si no hay idioma cargado
  const getFallback = (key) => {
    try {
      // Si no hay idioma cargado, intentar cargar inglés directamente
      if (!currentLanguage || Object.keys(currentLanguage).length === 0) {
        const fallbackPath = path.join(__dirname, 'languages', 'English.json');
        if (fs.existsSync(fallbackPath)) {
          const englishLanguage = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
          
          // Usar el archivo inglés para obtener el valor
          const keys = key.split('.');
          let value = englishLanguage;
          
          for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
              value = value[k];
            } else {
              return key; // Retornar la clave si no se encuentra
            }
          }
          
          return value;
        }
      }
      return key; // Retornar la clave si no se puede cargar el fallback
    } catch (error) {
      return key;
    }
  };
  
  // Debug: verificar si currentLanguage está cargado
  if (!currentLanguage || Object.keys(currentLanguage).length === 0) {
    return getFallback(key);
  }
  
  const keys = key.split('.');
  let value = currentLanguage;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return getFallback(key);
    }
  }
  
  return value;
}

function updateUI() {
  // Actualizar placeholder de búsqueda
  const searchInput = document.querySelector('.search-input');
  if (searchInput) {
    searchInput.placeholder = t('ui.menu.search');
  }
  
  // Actualizar elementos comunes en la interfaz principal
  const addConsoleBtn = document.querySelector('.add-console-btn');
  if (addConsoleBtn) {
    addConsoleBtn.textContent = t('ui.tabs.addConsole');
  }
  
  // Actualizar tooltips y otros elementos dinámicos si existen
  document.querySelectorAll('[data-translate]').forEach(element => {
    const key = element.getAttribute('data-translate');
    element.textContent = t(key);
  });
  
  // Actualizar placeholders con data-translate-placeholder
  document.querySelectorAll('[data-translate-placeholder]').forEach(element => {
    const key = element.getAttribute('data-translate-placeholder');
    element.placeholder = t(key);
  });
  
  // Actualizar mensaje vacío si está presente
  const emptyMessage = document.querySelector('.empty-message');
  if (emptyMessage) {
    const titleElement = emptyMessage.querySelector('h3');
    const messageElement = emptyMessage.querySelector('p');
    const buttonElement = emptyMessage.querySelector('button');
    
    if (titleElement) {
      titleElement.textContent = t('ui.messages.noGamesFoundTitle');
    }
    if (messageElement) {
      messageElement.textContent = t('ui.messages.noGamesCompatible');
    }
    if (buttonElement) {
      buttonElement.textContent = t('ui.messages.selectOtherFolderButton');
    }
    
    // Actualizar mensaje de "no hay emuladores configurados" si existe
    const messageDiv = emptyMessage.querySelector('div');
    if (messageDiv && !titleElement && !messageElement) {
      // Si no hay h3 ni p, es el mensaje de no emuladores
      messageDiv.textContent = t('ui.messages.noEmulatorsConfigured');
      
      // Actualizar el botón de agregar emulador
      const addEmulatorBtn = emptyMessage.querySelector('.btn');
      if (addEmulatorBtn) {
        addEmulatorBtn.innerHTML = `<span class="icon-add"></span>${t('ui.messages.addEmulatorButton')}`;
      }
    }
  }
}

// Aplicar tema guardado desde la configuración
function applySavedTheme() {
  // Solo aplicar si config.theme es un objeto válido con propiedades
  if (config.theme && typeof config.theme === 'object') {
    const root = document.documentElement;
    
    if (config.theme.headerColor) {
      root.style.setProperty('--header-color', config.theme.headerColor);
    }
    if (config.theme.tabSelectedColor) {
      root.style.setProperty('--tab-selected-color', config.theme.tabSelectedColor);
    }
    if (config.theme.tabHoverColor) {
      root.style.setProperty('--tab-hover-color', config.theme.tabHoverColor);
    }
    if (config.theme.tabBackgroundColor) {
      root.style.setProperty('--tab-background-color', config.theme.tabBackgroundColor);
    }
    if (config.theme.tabTextColor) {
      root.style.setProperty('--tab-text-color', config.theme.tabTextColor);
    }
    if (config.theme.mainBackgroundColor) {
      root.style.setProperty('--main-background-color', config.theme.mainBackgroundColor);
    }
    
    // Aplicar los colores directamente a los elementos existentes
    const emulatorTabs = document.getElementById('emulator-tabs');
    if (emulatorTabs && config.theme.headerColor) {
      emulatorTabs.style.background = config.theme.headerColor;
    }
    
    // Aplicar colores a las pestañas usando la función centralizada
    setTimeout(() => applyTabColors(), 100);
  }
}

// Guardar configuración
async function saveConfig() {
  try {
    await ipcRenderer.invoke('save-config', config);
  } catch (error) {
    console.error('Error saving configuration:', error);
    showTopNotification(`${t('ui.messages.errorSaving') || 'Error al guardar:'} ${error.message}`, 'error');
  }
}

// Mostrar notificación flotante que emerge debajo de la barra superior
function showTopNotification(message, type = 'success') {
  const existing = document.querySelector('.theme-notification');
  if (existing) {
    existing.remove();
  }

  const emulatorTabs = document.getElementById('emulator-tabs');
  const headerBottom = emulatorTabs ? emulatorTabs.getBoundingClientRect().bottom : 65;

  const notification = document.createElement('div');
  notification.className = 'theme-notification';
  
  const icon = type === 'error' ? 'error' : 'check_circle';
  notification.innerHTML = `
    <span class="material-symbols-outlined" style="font-size: 18px; line-height: 1; vertical-align: middle; color: var(--header-color, #db2424);">${icon}</span>
    <span style="vertical-align: middle;">${message}</span>
  `;

  notification.style.top = `${headerBottom}px`;
  notification.style.transform = 'translateX(-50%) translateY(-100%)';
  notification.style.opacity = '0';

  document.body.appendChild(notification);

  // Animar para que salga desde detrás de la barra superior
  setTimeout(() => {
    notification.style.transform = 'translateX(-50%) translateY(12px)';
    notification.style.opacity = '1';
  }, 20);

  // Auto-ocultar regresando detrás de la barra superior
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.transform = 'translateX(-50%) translateY(-100%)';
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 400);
    }
  }, 1800);
}

// Aplicar colores a las pestañas según su estado
function applyTabColors() {
  // Obtener colores desde CSS variables o configuración
  const root = document.documentElement;
  
  let tabSelectedColor = '#2a2a2a';
  let tabHoverColor = '#a49a9a';
  let tabBackgroundColor = '#e83b3b';
  let tabTextColor = '#ffffff';
  let mainBackgroundColor = '#222222';
  
  // Intentar obtener desde config.theme si es válido
  if (config.theme && typeof config.theme === 'object') {
    if (config.theme.tabSelectedColor) tabSelectedColor = config.theme.tabSelectedColor;
    if (config.theme.tabHoverColor) tabHoverColor = config.theme.tabHoverColor;
    if (config.theme.tabBackgroundColor) tabBackgroundColor = config.theme.tabBackgroundColor;
    if (config.theme.tabTextColor) tabTextColor = config.theme.tabTextColor;
    if (config.theme.mainBackgroundColor) mainBackgroundColor = config.theme.mainBackgroundColor;
  }
  
  // Actualizar las variables CSS en lugar de estilos inline
  root.style.setProperty('--tab-selected-color', tabSelectedColor);
  root.style.setProperty('--tab-hover-color', tabHoverColor);
  root.style.setProperty('--tab-background-color', tabBackgroundColor);
  root.style.setProperty('--tab-text-color', tabTextColor);
  root.style.setProperty('--main-background-color', mainBackgroundColor);
  
  // Remover estilos inline de las pestañas para que usen las variables CSS
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    // Remover estilos inline para que el CSS tome precedencia
    tab.style.background = '';
    tab.style.color = '';
    
    // Asegurar que las clases están correctas
    if (!tab.classList.contains('add-tab') && !tab.classList.contains('menu-tab')) {
      // Las pestañas normales usarán automáticamente las variables CSS
      // según su clase .selected o estado normal
    }
  });
}

// Buscar juegos en la carpeta especificada
async function loadGames(emulator) {
  if (!emulator.gamesPath) {
    return [];
  }

  try {
    // Usamos Node.js para leer archivos del sistema
    const fs = require('fs');
    const path = require('path');
    
    // Extensiones comunes de ROMs por sistema
    const romExtensions = {
      'nes': ['.nes', '.fds', '.unf', '.unif', '.zip', '.7z'],
      'snes': ['.sfc', '.smc', '.snes', '.fig', '.swc', '.zip', '.7z'],
      'ps1': ['.iso', '.bin', '.img', '.cue', '.chd', '.pbp', '.m3u', '.cso'],
      'ps2': ['.iso', '.bin', '.img', '.cue', '.chd', '.gz', '.cso', '.m3u', '.elf'],
      'psp': ['.iso', '.cso', '.pbp', '.chd'],
      'n64': ['.n64', '.z64', '.v64', '.zip', '.7z'],
      'gamecube': ['.iso', '.gcm', '.dol', '.rvz', '.ciso', '.tgc'],
      'wii': ['.iso', '.wbfs', '.gcz', '.wad', '.rvz', '.ciso', '.wua'],
      'wiiu': ['.wud', '.wux', '.iso', '.rpx', '.wua'],
      'switch': ['.xci', '.nsp', '.nro', '.nsz', '.xcz'],
      'gameboy': ['.gb', '.zip', '.7z'],
      'gbc': ['.gbc', '.zip', '.7z'],
      'gba': ['.gba', '.bin', '.zip', '.7z'],
      'ds': ['.nds', '.dsi', '.zip', '.7z'],
      '3ds': ['.3ds', '.cia', '.cci', '.cxi', '.3dsx'],
      'xbox': ['.iso', '.xbe'],
      'xbox360': ['.iso', '.xex', '.god'],
      'genesis': ['.gen', '.md', '.smd', '.bin', '.sg', '.68k', '.zip', '.7z'],
      'dreamcast': ['.cdi', '.gdi', '.iso', '.chd', '.cue'],
      'mame': ['.zip', '.7z', '.chd'],
      'otra': ['.rom', '.zip', '.7z', '.iso', '.bin', '.cue', '.chd', '.exe', '.appimage'],
      'default': ['.rom', '.zip', '.7z', '.iso', '.bin', '.cue', '.chd', '.sfc', '.smc', '.nes', '.gba', '.gbc', '.gb', '.nds', '.3ds', '.n64', '.z64', '.rvz', '.wbfs', '.xci', '.nsp', '.nsz', '.cso', '.pbp', '.gen', '.md', '.cdi', '.gdi', '.exe', '.appimage']
    };
    
    // Determinar qué extensiones buscar basado en el icono o nombre del emulador
    let iconBase = '';
    if (emulator.icon) {
      iconBase = path.basename(emulator.icon, path.extname(emulator.icon)).toLowerCase().trim();
    }
    const emuName = emulator.name ? emulator.name.toLowerCase().trim() : '';
    const validKeys = Object.keys(romExtensions).filter(k => k !== 'default' && k !== 'otra');
    
    // Primero coincidencia exacta para evitar colisiones (ej. 'nes' dentro de 'snes')
    let matchingKey = validKeys.find(k => k === iconBase || k === emuName);
    if (!matchingKey) {
      // Ordenar por longitud descendente para que 'snes' coincida antes que 'nes', 'wiiu' antes que 'wii', etc.
      const sortedKeys = [...validKeys].sort((a, b) => b.length - a.length);
      matchingKey = sortedKeys.find(k => (iconBase && iconBase.includes(k)) || (emuName && emuName.includes(k)));
    }
    const extensions = romExtensions[matchingKey] || (iconBase ? romExtensions[iconBase] : null) || romExtensions.default;

    // Escanear directorio de juegos de manera recursiva (hasta 3 niveles de profundidad)
    function scanDirRecursive(dir, maxDepth = 3, currentDepth = 0) {
      let results = [];
      if (currentDepth > maxDepth || !fs.existsSync(dir)) return results;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue; // ignorar archivos ocultos
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results = results.concat(scanDirRecursive(fullPath, maxDepth, currentDepth + 1));
          } else if (entry.isFile()) {
            results.push({ name: entry.name, fullPath });
          }
        }
      } catch (err) {
        console.error(`Error escaneando carpeta ${dir}:`, err);
      }
      return results;
    }

    const allFiles = scanDirRecursive(emulator.gamesPath, 3, 0);

    // Evitar duplicados de pistas secundarias si existe un archivo .cue o .m3u
    const cueFiles = allFiles.filter(f => f.name.toLowerCase().endsWith('.cue') || f.name.toLowerCase().endsWith('.m3u'));
    const hasCue = cueFiles.length > 0;

    const filteredFiles = allFiles.filter(fileObj => {
      const ext = path.extname(fileObj.name).toLowerCase();
      if (!extensions.includes(ext)) return false;

      // Si existe un .cue, ignorar .bin que correspondan a pistas secundarias
      if (hasCue && ext === '.bin') {
        const isTrack = /(?:track\s*0*[2-9]|track\s*[1-9]\d)/i.test(fileObj.name);
        if (isTrack) return false;
      }
      return true;
    });

    const games = filteredFiles.map(fileObj => {
      const gamePath = fileObj.fullPath;
      const gameName = path.basename(fileObj.name, path.extname(fileObj.name)).replace(/[-_\.]/g, ' ');
      return {
        name: gameName,
        filename: fileObj.name,
        path: gamePath,
        coverUrl: null
      };
    });
    
    // Pre-indexar la carpeta de carátulas para búsqueda instantánea O(1) (evita readdir repetitivo)
    const localCoversMap = new Map();
    if (emulator.coversPath && fs.existsSync(emulator.coversPath)) {
      try {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        const files = fs.readdirSync(emulator.coversPath);
        for (const file of files) {
          const ext = path.extname(file).toLowerCase();
          if (imageExtensions.includes(ext)) {
            const base = path.basename(file, ext);
            const norm = base.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '').trim();
            const fullPath = path.join(emulator.coversPath, file);
            localCoversMap.set(norm, fullPath);
            localCoversMap.set(base.toLowerCase().trim(), fullPath);
          }
        }
      } catch (err) {
        console.error(`Error indexando carátulas de ${emulator.coversPath}:`, err);
      }
    }

    // Buscar carátula en carpeta personalizada (si existe) o en el caché de Cascabel Covers
    for (const game of games) {
      try {
        let coverPath = null;
        let isLocalCover = false;
        if (localCoversMap.size > 0) {
          const normGame = game.name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '').trim();
          coverPath = localCoversMap.get(normGame) || localCoversMap.get(game.name.toLowerCase().trim()) || null;
          if (coverPath) {
            isLocalCover = true;
          }
        }
        if (!coverPath) {
          coverPath = coverScraper.getCachedCover(game.path, game.filename, emulator);
          if (coverPath) {
            isLocalCover = false;
          }
        }
        game.isLocalCover = isLocalCover;
        game.coverPath = coverPath;
        if (coverPath) {
          try {
            const imageBuffer = fs.readFileSync(coverPath);
            const imageBase64 = imageBuffer.toString('base64');
            const imageExt = path.extname(coverPath).toLowerCase().substring(1);
            const mimeType = imageExt === 'jpg' ? 'jpeg' : imageExt;
            game.coverUrl = `data:image/${mimeType};base64,${imageBase64}`;
          } catch (error) {
            console.error(`Error convirtiendo carátula a base64 para ${game.name}:`, error);
            game.coverUrl = null;
          }
        }
      } catch (error) {
        console.error(`Error buscando carátula para ${game.name}:`, error);
      }
    }
    
    return games;
  } catch (error) {
    console.error('Error cargando juegos:', error);
    return [];
  }
}

// Función para buscar carátulas locales
async function findLocalCover(gameName, coversPath) {
  if (!fs.existsSync(coversPath)) {
    return null;
  }

  // Extensiones de imagen soportadas
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
  
  try {
    const files = fs.readdirSync(coversPath);
    
    // Función para normalizar nombres (quitar caracteres especiales, espacios extra, etc.)
    const normalizeName = (name) => {
      return name
        .toLowerCase()
        .replace(/[^\w\s]/g, '')    // Quitar TODOS los caracteres especiales (incluyendo puntos, guiones, etc.)
        .replace(/\s+/g, '')        // Quitar TODOS los espacios
        .trim();
    };
    
    const normalizedGameName = normalizeName(gameName);
    
    // Buscar archivo que coincida exactamente con el nombre del juego
    for (const file of files) {
      const fileNameWithoutExt = path.basename(file, path.extname(file));
      const fileExt = path.extname(file).toLowerCase();
      
      // Verificar si es una imagen
      if (imageExtensions.includes(fileExt)) {
        const normalizedFileName = normalizeName(fileNameWithoutExt);
        
        // Coincidencia exacta
        if (normalizedFileName === normalizedGameName) {
          const fullPath = path.join(coversPath, file);
          return fullPath;
        }
        
        // Coincidencia sin normalizar (por si acaso)
        if (fileNameWithoutExt === gameName) {
          const fullPath = path.join(coversPath, file);
          return fullPath;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error leyendo carpeta de carátulas ${coversPath}:`, error);
    return null;
  }
}

// Función para scraping en segundo plano de carátulas con Cascabel Covers
function startBackgroundCoverScraping(games, emulator) {
  if (!games || games.length === 0 || !emulator) {
    return;
  }

  const missing = games.filter(g => !g.coverUrl && !g.coverRemoved);
  if (missing.length === 0) {
    return;
  }

  let badge = document.getElementById('cover-scraping-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'cover-scraping-badge';
    badge.className = 'cover-scraping-badge';
    document.body.appendChild(badge);
  }

  badge.style.display = 'flex';
  badge.style.opacity = '1';
  badge.innerHTML = `
    <div class="scraping-spinner"></div>
    <span class="scraping-text">${t('ui.messages.updatingCovers')} (1/${missing.length})</span>
  `;

  coverScraper.scrapeCoversForGames(
    games,
    emulator,
    (game, dataUrl, coverPath) => {
      // Actualizar en el objeto de juego en memoria
      game.coverUrl = dataUrl;
      game.coverPath = coverPath;
      game.isLocalCover = false;
      game.coverRemoved = false;

      // Actualizar tarjeta en el DOM usando data-path
      let card = null;
      for (const c of document.querySelectorAll('.game-card')) {
        if (c.getAttribute('data-path') === game.path) {
          card = c;
          break;
        }
      }
      if (!card) {
        for (const [_, grid] of emulatorDOMCache.entries()) {
          for (const c of grid.querySelectorAll('.game-card')) {
            if (c.getAttribute('data-path') === game.path) {
              card = c;
              break;
            }
          }
          if (card) break;
        }
      }
      if (card) {
        const coverEl = card.querySelector('.game-cover');
        if (coverEl) {
          coverEl.innerHTML = '';
          coverEl.style.backgroundImage = `url('${dataUrl}')`;
        }
      }
    },
    (progress) => {
      if (badge && badge.style.display !== 'none') {
        const textSpan = badge.querySelector('.scraping-text');
        if (textSpan) {
          textSpan.textContent = `${t('ui.messages.updatingProgress')} ${progress.processed}/${progress.total}`;
        }
      }
    },
    (summary) => {
      if (badge && badge.style.display !== 'none') {
        badge.innerHTML = `
          <span class="material-symbols-outlined" style="font-size: 18px; color: #4caf50;">check_circle</span>
          <span class="scraping-text">${t('ui.messages.coversUpdatedFinal')} ${summary.found} de ${summary.total}</span>
        `;
        setTimeout(() => {
          if (badge) {
            badge.style.opacity = '0';
            setTimeout(() => {
              if (badge) {
                badge.style.display = 'none';
                badge.style.opacity = '1';
              }
            }, 500);
          }
        }, 2500);
      }
    }
  );
}

// Lanzar un juego con el emulador correspondiente
async function launchGame(emulatorPath, gamePath) {
  try {
    // Obtener información del juego para el tracking
    const gameName = path.basename(gamePath, path.extname(gamePath)).replace(/[-_\.]/g, ' ');
    const currentEmulatorIndex = getCurrentEmulatorIndex();
    
    const result = await ipcRenderer.invoke('launch-game', emulatorPath, gamePath);
    
    if (result && result.success === false) {
      const baseMsg = t('ui.messages.errorLaunching') || 'Error al lanzar el juego:';
      alert(`${baseMsg}\n\n${result.error}`);
      return;
    }

    // Actualizar estadísticas tras confirmar lanzamiento
    updateGameStats(currentEmulatorIndex, gameName);
  } catch (error) {
    console.error('Error al lanzar el juego:', error);
    const baseMsg = t('ui.messages.errorLaunching') || 'Error al lanzar el juego:';
    alert(`${baseMsg} ${error.message}`);
  }
}

// Función para obtener el índice del emulador actual
function getCurrentEmulatorIndex() {
  const selectedTab = document.querySelector('.tab.selected');
  if (!selectedTab) return 0;
  
  const tabsContainer = selectedTab.parentElement;
  const allTabs = Array.from(tabsContainer.children).filter(child => child.classList.contains('tab'));
  return allTabs.indexOf(selectedTab);
}

// Función para actualizar estadísticas de juego
function updateGameStats(emulatorIndex, gameName) {
  if (!config.emulators[emulatorIndex]) return;
  
  // Inicializar gameStats si no existe
  if (!config.emulators[emulatorIndex].gameStats) {
    config.emulators[emulatorIndex].gameStats = {};
  }
  
  const stats = config.emulators[emulatorIndex].gameStats;
  
  // Inicializar stats del juego si no existe
  if (!stats[gameName]) {
    stats[gameName] = {
      playCount: 0,
      lastPlayed: null
    };
  }
  
  // Incrementar contador y actualizar fecha
  stats[gameName].playCount++;
  stats[gameName].lastPlayed = new Date().toISOString();
  
  // Guardar configuración
  saveConfig();
}

// Función helper para manejar clics en juegos con debounce
function handleGameClick(emulatorPath, gamePath, gameCard) {
  // Verificar si ya hay un juego iniciándose
  if (isGameLaunching) {
    return; // Ignorar el clic si ya hay un juego iniciándose
  }
  
  // Marcar que se está iniciando un juego
  isGameLaunching = true;
  
  // Agregar efecto visual al juego clickeado
  gameCard.style.opacity = '0.7';
  gameCard.style.transform = 'scale(0.95)';
  
  // Lanzar el juego
  launchGame(emulatorPath, gamePath).finally(() => {
    // Restaurar efecto visual
    gameCard.style.opacity = '';
    gameCard.style.transform = '';
    
    // Después del cooldown, permitir clics nuevamente
    setTimeout(() => {
      isGameLaunching = false;
    }, gameClickCooldown);
  });
}

// Generar icono SVG del control de cada consola
function getConsoleSvg(iconType) {
  if (!iconType) iconType = 'otra';
  const key = String(iconType).toLowerCase();
  
  try {
    const svgPath = path.join(__dirname, '..', 'assets', 'console-icons', `${key}.svg`);
    if (fs.existsSync(svgPath)) {
      return fs.readFileSync(svgPath, 'utf8');
    }
  } catch (error) {
    console.error('Error loading icon:', error);
  }
  
  // Fallback if file not found
  try {
    const fallbackPath = path.join(__dirname, '..', 'assets', 'console-icons', 'otra.svg');
    if (fs.existsSync(fallbackPath)) {
      return fs.readFileSync(fallbackPath, 'utf8');
    }
  } catch (error) {
    console.error('Error loading fallback icon:', error);
  }
  
  // Ultimate fallback inline SVG
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M5 7h14a3 3 0 0 1 3 3v2c0 1.5-.5 2.5-1 3l-.5.5v2.5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V16H8.5v2a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-2.5L3 15c-.5-.5-1-1.5-1-3v-2a3 3 0 0 1 3-3z" stroke="currentColor" stroke-width="1.5" fill="currentColor" opacity="0.1"/>
    <rect x="4.5" y="10.5" width="3" height="1" rx="0.2" fill="currentColor"/>
    <rect x="5.5" y="9.5" width="1" height="3" rx="0.2" fill="currentColor"/>
    <circle cx="17" cy="9.5" r="0.9" fill="currentColor"/>
    <circle cx="19" cy="11" r="0.9" fill="currentColor"/>
    <circle cx="17" cy="12.5" r="0.9" fill="currentColor"/>
    <circle cx="15" cy="11" r="0.9" fill="currentColor"/>
    <circle cx="12" cy="10" r="0.8" fill="currentColor" opacity="0.4"/>
  </svg>`;
}

// Generar icono SVG del control (gamepad)
function getControllerSvg(iconType) {
  if (!iconType) iconType = 'otra';
  const key = String(iconType).toLowerCase();
  
  try {
    const svgPath = path.join(__dirname, '..', 'assets', 'controller-icons', `${key}.svg`);
    if (fs.existsSync(svgPath)) {
      return fs.readFileSync(svgPath, 'utf8');
    }
  } catch (error) {
    console.error('Error loading controller icon:', error);
  }
  
  // Fallback if file not found
  try {
    const fallbackPath = path.join(__dirname, '..', 'assets', 'controller-icons', 'otra.svg');
    if (fs.existsSync(fallbackPath)) {
      return fs.readFileSync(fallbackPath, 'utf8');
    }
  } catch (error) {
    // Silently ignore
  }
  
  // Ultimate fallback inline SVG (generic gamepad)
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="controller-icon">
    <rect x="2" y="6" width="20" height="12" rx="5" ry="5" fill="currentColor" fill-opacity="0.1" stroke="currentColor"></rect>
    <path d="M6 12h4M8 10v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
    <circle cx="15" cy="13" r="1.5" fill="currentColor" stroke="none"></circle>
    <circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none"></circle>
  </svg>`;
}

// Índice de consola/pestaña actualmente seleccionada
let currentTabIndex = 0;

// Obtiene el identificador de la consola asociado a un emulador
function getConsoleTypeFromEmulator(emu) {
  if (!emu) return 'otra';
  let iconName = '';
  if (emu.icon) {
    iconName = path.basename(emu.icon, path.extname(emu.icon)).toLowerCase().trim();
  }
  const nameLower = emu.name ? emu.name.toLowerCase().trim() : '';
  const knownConsoles = [
    'nes', 'snes', 'n64', 'gamecube', 'wii', 'wiiu', 'switch',
    'gameboy', 'gbc', 'gba', 'ds', '3ds',
    'ps1', 'ps2', 'psp', 'genesis', 'dreamcast',
    'xbox360', 'xbox', 'mame'
  ];

  // Coincidencia exacta primero
  const exact = knownConsoles.find(c => c === iconName || c === nameLower);
  if (exact) return exact;

  // Si no es exacta, buscar subcadenas ordenando por longitud descendente para evitar falsos positivos ('snes' antes de 'nes', 'wiiu' antes de 'wii', etc.)
  const sortedConsoles = [...knownConsoles].sort((a, b) => b.length - a.length);
  for (const c of sortedConsoles) {
    if (iconName && iconName.includes(c)) return c;
  }
  for (const c of sortedConsoles) {
    if (nameLower && nameLower.includes(c)) return c;
  }
  return 'otra';
}

// Genera la carátula predeterminada con la estética de caja física de la consola y la consola al centro
function createDefaultConsoleCoverHTML(game, emu) {
  const consoleKey = getConsoleTypeFromEmulator(emu);
  
  const consoleLabels = {
    'nes': { brand: 'Nintendo', sub: 'Entertainment System' },
    'snes': { brand: 'Super Nintendo', sub: 'Entertainment System' },
    'n64': { brand: 'Nintendo 64', sub: 'Official Seal of Quality' },
    'gamecube': { brand: 'Nintendo', sub: 'GameCube' },
    'wii': { brand: 'Wii', sub: 'Nintendo' },
    'wiiu': { brand: 'Wii U', sub: 'Nintendo' },
    'switch': { brand: 'Nintendo Switch', sub: '' },
    'gameboy': { brand: 'Nintendo', sub: 'Game Boy' },
    'gbc': { brand: 'Game Boy', sub: 'Color' },
    'gba': { brand: 'Game Boy Advance', sub: 'Nintendo' },
    'ds': { brand: 'Nintendo DS', sub: '' },
    '3ds': { brand: 'Nintendo 3DS', sub: '' },
    'ps1': { brand: 'PlayStation', sub: 'Sony' },
    'ps2': { brand: 'PlayStation 2', sub: 'Sony' },
    'psp': { brand: 'PSP', sub: 'PlayStation Portable' },
    'genesis': { brand: 'SEGA', sub: 'Genesis' },
    'dreamcast': { brand: 'SEGA', sub: 'Dreamcast' },
    'xbox': { brand: 'XBOX', sub: 'Microsoft' },
    'xbox360': { brand: 'XBOX 360', sub: 'Microsoft' },
    'mame': { brand: 'Arcade Classics', sub: 'MAME' },
    'otra': { brand: 'Cascabel', sub: 'Collection' }
  };

  const labels = consoleLabels[consoleKey] || consoleLabels.otra;
  const iconPath = `../assets/console-icons/${consoleKey}.png`;

  return `
    <div class="default-console-box box-${consoleKey}">
      <div class="box-badge-top">
        <span class="box-brand-title">${labels.brand}</span>
        ${labels.sub ? `<span class="box-sub-title">${labels.sub}</span>` : ''}
      </div>
      <div class="box-center">
        <img class="box-console-img" src="${iconPath}" alt="${consoleKey}" />
      </div>
      <div class="box-badge-bottom">
        <span class="box-game-name">${game.name}</span>
      </div>
    </div>
  `;
}

// Renderizar las pestañas de emuladores
function renderTabs() {
  const nav = document.getElementById('emulator-tabs');
  if (!nav) return;
  
  nav.innerHTML = '';
  
  // Contenedor principal del header
  const headerContainer = document.createElement('div');
  headerContainer.className = 'header-container';
  
  // Botón de menú hamburguesa fijo (a la izquierda)
  const menuButton = document.createElement('button');
  menuButton.className = 'profile-button-navbar';
  menuButton.id = 'hamburger-menu-btn';
  menuButton.title = t('ui.messages.menu');
  
  const profileImage = document.createElement('img');
  profileImage.className = 'profile-image-navbar';
  
  if (config.theme && config.theme.profileImage) {
    profileImage.src = config.theme.profileImage;
  } else {
    profileImage.src = '../assets/default-profile.png';
  }
  
  menuButton.appendChild(profileImage);
  menuButton.addEventListener('click', function(e) {
    e.stopPropagation();
    showMainMenu(e);
  });

  headerContainer.appendChild(menuButton);
  
  // Verificar si hay emuladores configurados
  if (!config.emulators || config.emulators.length === 0) {
    const existingEmptyMessage = document.querySelector('.empty-message');
    if (existingEmptyMessage) {
      existingEmptyMessage.remove();
    }
    
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-message';
    
    const messageText = document.createElement('div');
    messageText.textContent = t('ui.messages.noEmulatorsConfigured');
    messageText.style.textAlign = 'center';
    messageText.style.marginBottom = '20px';
    
    const addButton = document.createElement('button');
    addButton.className = 'btn btn-primary';
    addButton.innerHTML = `<span class="icon-add"></span>${t('ui.messages.addEmulatorButton')}`;
    addButton.addEventListener('click', function() {
      showSettings();
    });
    
    emptyMessage.appendChild(messageText);
    emptyMessage.appendChild(addButton);
    
    document.body.appendChild(emptyMessage);
    
    const main = document.getElementById('emulator-content');
    if (main) {
      main.innerHTML = '';
    }
    nav.appendChild(headerContainer);
    return;
  }
  
  const existingEmptyMessage = document.querySelector('.empty-message');
  if (existingEmptyMessage) {
    existingEmptyMessage.remove();
  }

  // Estilos de pestañas y alineación configurados
  const tabStyle = (config.theme && config.theme.tabStyle) || 'both';
  const tabAlignment = (config.theme && config.theme.tabAlignment) || 'left';

  const tabsContainer = document.createElement('div');
  tabsContainer.className = `tabs-container align-${tabAlignment}`;

  config.emulators.forEach((emu, idx) => {
    const tab = document.createElement('button');
    tab.className = 'tab' + (idx === currentTabIndex ? ' selected' : '');
    tab.draggable = true;

    const iconKey = (emu.icon || 'otra').toLowerCase();
    const iconSrc = `../assets/console-icons/${iconKey}.png`;

    if (tabStyle === 'text') {
      tab.innerHTML = `<span>${emu.name}</span>`;
    } else if (tabStyle === 'icons') {
      tab.classList.add('tab-icon-only');
      tab.title = emu.name;
      tab.innerHTML = `<img class="tab-console-icon" src="${iconSrc}" alt="${emu.name}" onerror="this.src='../assets/console-icons/otra.png'" />`;
    } else {
      // 'both' (iconos y texto)
      tab.innerHTML = `<img class="tab-console-icon" src="${iconSrc}" alt="${emu.name}" onerror="this.src='../assets/console-icons/otra.png'" /> <span>${emu.name}</span>`;
    }

    // Click izquierdo para seleccionar pestaña
    tab.addEventListener('click', function(e) {
      if (!tab.classList.contains('dragging')) {
        const currentIndex = Array.from(tabsContainer.children).indexOf(tab);
        selectTab(currentIndex);
      }
    });

    // Click derecho para menú contextual
    tab.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      const currentIndex = Array.from(tabsContainer.children).indexOf(tab);
      showTabContextMenu(e, currentIndex);
    });

    // Drag and drop listeners
    tab.addEventListener('dragstart', handleDragStart);
    tab.addEventListener('dragend', handleDragEnd);
    tab.addEventListener('dragover', handleDragOver);
    tab.addEventListener('drop', handleDrop);
    tab.addEventListener('dragenter', handleDragEnter);
    tab.addEventListener('dragleave', handleDragLeave);

    tabsContainer.appendChild(tab);
  });

  tabsContainer.addEventListener('wheel', function(e) {
    if (e.deltaY !== 0) {
      e.preventDefault();
      tabsContainer.scrollLeft += e.deltaY;
    }
  });

  headerContainer.appendChild(tabsContainer);
  nav.appendChild(headerContainer);

  // Asegurar que el índice seleccionado sea válido
  if (currentTabIndex >= config.emulators.length) {
    currentTabIndex = 0;
  }

  // Seleccionar la pestaña
  selectTab(currentTabIndex);

  // Aplicar colores
  setTimeout(() => applyTabColors(), 100);

  // En segundo plano, pre-cargar y encolar carátulas para el resto de consolas
  setTimeout(async () => {
    if (!config.emulators || config.emulators.length <= 1) return;
    for (let i = 0; i < config.emulators.length; i++) {
      if (i === currentTabIndex) continue;
      const otherEmu = config.emulators[i];
      if (!otherEmu || !otherEmu.gamesPath) continue;
      if (!emulatorGamesCache.has(i)) {
        try {
          const games = await loadGames(otherEmu);
          emulatorGamesCache.set(i, games);
          if (!emulatorDOMCache.has(i) && games.length > 0) {
            const tempContainer = document.createElement('div');
            renderGamesToContainer(games, otherEmu, tempContainer, false, i);
          }
          startBackgroundCoverScraping(games, otherEmu);
        } catch (e) {
          console.error(`Error pre-cargando juegos de ${otherEmu.name}:`, e);
        }
      }
    }
  }, 1500);
}

// Seleccionar una pestaña o consola
function selectTab(idx) {
  if (!config.emulators || !config.emulators[idx]) return;
  
  const emu = config.emulators[idx];
  currentTabIndex = idx;

  // Verificar que el idioma esté completamente cargado
  if (!currentLanguage || !currentLanguage.ui || !currentLanguage.ui.messages) {
    console.warn('Language not loaded in selectTab, waiting...');
    setTimeout(() => selectTab(idx), 100);
    return;
  }
  
  // Actualizar estado de pestañas clásicas si existen
  document.querySelectorAll('.tab').forEach((t, i) => {
    t.classList.toggle('selected', i === idx);
  });
  
  // Aplicar colores a las pestañas y componentes
  applyTabColors();

  const main = document.getElementById('emulator-content');
  if (!main) return;
  
  // Si ya tenemos el DOM renderizado en caché para esta pestaña, mostrarlo al instante (0ms)
  if (emulatorDOMCache.has(idx)) {
    main.innerHTML = '';
    main.appendChild(emulatorDOMCache.get(idx));
    const cachedGames = emulatorGamesCache.get(idx);
    if (cachedGames && cachedGames.length > 0) {
      startBackgroundCoverScraping(cachedGames, emu);
    }
    return;
  }

  // Si ya tenemos los juegos en memoria para este emulador, renderizar una sola vez y cachear DOM
  if (emulatorGamesCache.has(idx)) {
    const cachedGames = emulatorGamesCache.get(idx);
    if (cachedGames.length === 0) {
      showEmptyGamesMessage(idx, main);
      return;
    }
    const gamesToShow = renderGamesToContainer(cachedGames, emu, main, false, idx);
    startBackgroundCoverScraping(gamesToShow, emu);
    return;
  }

  main.innerHTML = `
    <div class="loading">
      <div class="loading-spinner"></div>
      <p>${t('ui.messages.loadingGames')} ${emu.name}...</p>
    </div>
  `;
  
  // Cargar los juegos desde la carpeta (solo la primera vez o si se fuerza reescaneo)
  loadGames(emu).then(games => {
    emulatorGamesCache.set(idx, games);

    if (games.length === 0) {
      showEmptyGamesMessage(idx, main);
      return;
    }
    
    // Renderizar la cuadrícula de juegos (se almacena automáticamente en emulatorDOMCache)
    const gamesToShow = renderGamesToContainer(games, emu, main, false, idx);

    // Iniciar o priorizar escaneo en segundo plano para esta consola
    startBackgroundCoverScraping(gamesToShow, emu);
  }).catch(error => {
    main.innerHTML = `
      <div class="error-message">
        <h3>${t('ui.messages.errorLoadingGamesTitle')}</h3>
        <p>${error.message}</p>
        <button id="retry-load-btn" class="btn btn-primary">${t('ui.messages.retryButton')}</button>
      </div>
    `;
    
    // Listener para reintentar
    document.getElementById('retry-load-btn').addEventListener('click', () => {
      emulatorGamesCache.delete(idx);
      emulatorDOMCache.delete(idx);
      emulatorScrapedSet.delete(idx);
      selectTab(idx);
    });
  });
}

// Muestra el mensaje de consola vacía
function showEmptyGamesMessage(idx, main) {
  if (!currentLanguage || !currentLanguage.ui || !currentLanguage.ui.messages) {
    console.warn('Language not fully loaded, retrying in 200ms...');
    setTimeout(() => selectTab(idx), 200);
    return;
  }
  
  main.innerHTML = `
    <div class="empty-message">
      <div class="empty-icon">🎮</div>
      <h3>${t('ui.messages.noGamesFoundTitle')}</h3>
      <p>${t('ui.messages.noGamesCompatible')}</p>
      <button id="select-games-path-btn" class="btn btn-primary">${t('ui.messages.selectOtherFolderButton')}</button>
    </div>
  `;
  
  const btn = document.getElementById('select-games-path-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      editEmulator(idx);
    });
  }
}

// Renderiza la cuadrícula de juegos en el contenedor especificado
function renderGamesToContainer(games, emu, container, animate = false, tabIdx = null) {
  let gamesToShow = [...games];
  if (emu.sortType && emu.sortType !== 'none') {
    const gameStats = emu.gameStats || {};
    switch (emu.sortType) {
      case 'alphabetical':
        gamesToShow.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
        break;
      case 'mostplayed':
        gamesToShow.sort((a, b) => {
          const aStats = gameStats[a.name] || { playCount: 0 };
          const bStats = gameStats[b.name] || { playCount: 0 };
          if (bStats.playCount !== aStats.playCount) {
            return bStats.playCount - aStats.playCount;
          }
          const aLastPlayed = aStats.lastPlayed ? new Date(aStats.lastPlayed) : new Date(0);
          const bLastPlayed = bStats.lastPlayed ? new Date(bStats.lastPlayed) : new Date(0);
          return bLastPlayed - aLastPlayed;
        });
        break;
    }
  }

  const gamesGrid = document.createElement('div');
  gamesGrid.className = 'games-grid' + (animate ? ' fade-refresh' : '');

  gamesToShow.forEach(game => {
    const gameCard = document.createElement('div');
    gameCard.className = 'game-card';

    // Adaptar proporciones de carátula según consola
    if (emu && emu.icon) {
      const iconName = String(emu.icon).toLowerCase();
      const horizontalConsoles = ['snes', 'n64', 'genesis', 'md', 'smd', 'psp', 'gba'];
      const isHorizontal = horizontalConsoles.some(c => iconName.includes(c));
      gameCard.classList.add(isHorizontal ? 'cover-horizontal' : 'cover-vertical');
    } else {
      gameCard.classList.add('cover-vertical');
    }

    gameCard.setAttribute('data-path', game.path);
    gameCard.setAttribute('data-title', game.name); // Agregar título como atributo para tooltip

    const gameCover = document.createElement('div');
    gameCover.className = 'game-cover';

    // Si tiene imagen de carátula, mostrarla; de lo contrario mostrar la caja física de la consola
    if (game.coverUrl) {
      gameCover.style.backgroundImage = `url('${game.coverUrl}')`;
      gameCover.innerHTML = '';
    } else {
      gameCover.style.backgroundImage = 'none';
      gameCover.innerHTML = createDefaultConsoleCoverHTML(game, emu);
    }

    // Solo agregar la carátula, sin el título
    gameCard.appendChild(gameCover);

    // Al hacer clic en un juego, lanzarlo con el emulador
    gameCard.addEventListener('click', (event) => {
      event.preventDefault();
      handleGameClick(emu.execPath, game.path, gameCard);
    });

    // Al hacer clic derecho en la portada, mostrar menú contextual (Eliminar foto)
    gameCard.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showGameContextMenu(event, game, emu, gameCard);
    });

    gamesGrid.appendChild(gameCard);
  });

  container.innerHTML = '';
  container.appendChild(gamesGrid);
  const targetIndex = tabIdx !== null ? tabIdx : currentTabIndex;
  if (targetIndex !== null && targetIndex >= 0) {
    emulatorDOMCache.set(targetIndex, gamesGrid);
  }
  return gamesToShow;
}

// Menú contextual para un juego individual (clic derecho en portada)
function showGameContextMenu(event, game, emu, gameCard) {
  closeContextMenu();

  // Se puede eliminar solamente el cover scrappeado; si es de la carpeta local no aparece esta opción
  if (!game.coverUrl || game.isLocalCover) {
    return;
  }

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;

  const deleteOption = document.createElement('div');
  deleteOption.className = 'context-menu-item';
  deleteOption.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px; margin-right: 6px; vertical-align: middle;">delete</span>${t('ui.contextMenu.removeCover') || 'Eliminar carátula'}`;

  deleteOption.addEventListener('click', (e) => {
    e.stopPropagation();
    closeContextMenu();
    showConfirmRemoveCoverModal(game, emu, gameCard);
  });

  menu.appendChild(deleteOption);
  document.body.appendChild(menu);

  // Ajustar posición si se sale de la pantalla
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }

  // Cerrar al hacer clic fuera
  setTimeout(() => {
    window.addEventListener('click', closeContextMenu, { once: true });
  }, 0);
}

// Modal personalizado no-vanilla con colores del tema para confirmar eliminación de carátula
function showConfirmRemoveCoverModal(game, emu, gameCard) {
  const confirmModal = document.createElement('div');
  confirmModal.className = 'confirm-modal';
  confirmModal.style.zIndex = '12000';
  
  const title = t('ui.contextMenu.confirmRemoveCoverTitle') || '¿Eliminar carátula?';
  const msgTemplate = t('ui.contextMenu.confirmRemoveCoverMessage') || '¿Deseas eliminar la carátula descargada para "{game}"? Se mostrará la imagen predeterminada de la consola.';
  const message = msgTemplate.replace('{game}', game.name);

  confirmModal.innerHTML = `
    <div class="confirm-content" style="background: var(--main-background-color, #222); border: 2px solid var(--header-color, #db2424); color: var(--tab-text-color, #ffffff); border-radius: 8px; box-shadow: 0 12px 30px rgba(0,0,0,0.6); max-width: 420px;">
      <h3 style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 0; color: var(--header-color, #ff6b6b);">
        <span class="material-symbols-outlined" style="font-size: 22px;">delete</span>
        ${title}
      </h3>
      <p style="margin: 14px 0 20px 0; font-size: 14px; line-height: 1.5; color: var(--tab-text-color, #eee);">${message}</p>
      <div class="confirm-buttons" style="display: flex; justify-content: center; gap: 12px;">
        <button id="cancel-remove-cover-btn" class="btn btn-secondary">${t('ui.buttons.cancel') || 'Cancelar'}</button>
        <button id="confirm-remove-cover-btn" class="btn btn-danger">${t('ui.buttons.delete') || 'Eliminar'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(confirmModal);

  document.getElementById('cancel-remove-cover-btn')?.addEventListener('click', () => {
    confirmModal.remove();
  });

  document.getElementById('confirm-remove-cover-btn')?.addEventListener('click', () => {
    confirmModal.remove();
    removeGameCover(game, emu, gameCard);
  });

  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
      confirmModal.remove();
    }
  });
}

// Elimina la carátula de un juego y vuelve a la carátula predeterminada de la consola
function removeGameCover(game, emu, gameCard) {
  try {
    coverScraper.removeCover(game.path, emu, game.name);
    game.coverUrl = null;
    game.coverRemoved = true;

    const gameCover = gameCard.querySelector('.game-cover');
    if (gameCover) {
      gameCover.style.transition = 'opacity 0.25s ease';
      gameCover.style.opacity = '0';
      setTimeout(() => {
        gameCover.style.backgroundImage = 'none';
        gameCover.innerHTML = createDefaultConsoleCoverHTML(game, emu);
        gameCover.style.opacity = '1';
      }, 250);
    }
  } catch (err) {
    console.error('Error eliminando portada del juego:', err);
  }
}

// Refresca los juegos de la consola sin recargar la pestaña ni mover la vista, con animación de opacidad
async function refreshEmulatorGames(tabIndex) {
  if (!config.emulators || !config.emulators[tabIndex]) return;
  const emu = config.emulators[tabIndex];

  // Si la pestaña no está seleccionada, seleccionarla normalmente
  if (currentTabIndex !== tabIndex) {
    emulatorGamesCache.delete(tabIndex);
    selectTab(tabIndex);
    return;
  }

  const main = document.getElementById('emulator-content');
  if (!main) return;

  const currentScroll = main.scrollTop;

  // Cancelar escaneos activos
  coverScraper.cancelActiveScan();
  const existingBadge = document.getElementById('cover-scraping-badge');
  if (existingBadge) {
    existingBadge.style.display = 'none';
  }

  try {
    // Forzar lectura fresca de disco y actualizar el caché
    emulatorGamesCache.delete(tabIndex);
    emulatorDOMCache.delete(tabIndex);
    emulatorScrapedSet.delete(tabIndex);
    const games = await loadGames(emu);
    emulatorGamesCache.set(tabIndex, games);

    if (games.length === 0) {
      showEmptyGamesMessage(tabIndex, main);
      return;
    }

    // Renderizar con animación de opacidad conservando la posición de scroll
    const gamesToShow = renderGamesToContainer(games, emu, main, true, tabIndex);
    main.scrollTop = currentScroll;

    // Escanear carátulas faltantes (nuevos juegos o nombres actualizados)
    emulatorScrapedSet.add(tabIndex);
    startBackgroundCoverScraping(gamesToShow, emu);
  } catch (error) {
    console.error('Error refrescando juegos:', error);
  }
}

// Mostrar menú principal (hamburguesa)
function showMainMenu(event) {
  event.preventDefault();
  
  // Cerrar cualquier menú contextual existente
  closeContextMenu();
  
  // Obtener la posición del botón hamburguesa para posicionar el menú correctamente
  const menuButton = document.getElementById('hamburger-menu-btn');
  if (!menuButton) return;
  
  const buttonRect = menuButton.getBoundingClientRect();
  
  // Crear menú contextual
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'main-context-menu';
  
  // Posicionar el menú debajo del botón hamburguesa
  menu.style.left = `${buttonRect.left}px`;
  menu.style.top = `${buttonRect.bottom + 5}px`; // 5px de espacio
  
  // Crear contenido del menú
  const menuContent = document.createElement('ul');
  menuContent.style.padding = '0';
  menuContent.style.margin = '0';
  menuContent.style.listStyle = 'none';
  
  // Opciones del menú
  const menuItems = [
    { text: t('ui.menu.addConsole'), action: () => showSettings() },
    { text: t('ui.menu.configuration'), action: () => showConfigModal() },
    { text: t('ui.menu.exit'), action: () => window.close() }
  ];
  
  // Crear elementos del menú
  menuItems.forEach(item => {
    const menuItem = document.createElement('li');
    menuItem.className = 'context-menu-item';
    menuItem.textContent = item.text;
    menuItem.addEventListener('click', () => {
      closeContextMenu();
      item.action();
    });
    menuContent.appendChild(menuItem);
  });
  
  menu.appendChild(menuContent);
  document.body.appendChild(menu);
  
  // Ajustar posición si está fuera de la pantalla
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - menuRect.width - 10}px`;
  }
  if (menuRect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - menuRect.height - 10}px`;
  }
  
  // Cerrar el menú al hacer clic fuera
  function handleOutsideClick(e) {
    if (!menu.contains(e.target) && e.target !== menuButton && !menuButton.contains(e.target)) {
      closeContextMenu();
      document.removeEventListener('click', handleOutsideClick);
    }
  }
  
  // Usar setTimeout para evitar que el evento de clic actual cierre inmediatamente el menú
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 0);
}

// Mostrar menú contextual para una pestaña
function showTabContextMenu(event, tabIndex) {
  // Crear menú contextual
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  
  // Opción Ordenar con submenú (primera opción)
  const sortOption = document.createElement('div');
  sortOption.className = 'context-menu-item context-menu-item-submenu';
  sortOption.innerHTML = t('ui.contextMenu.sort');
  
  // Crear submenú
  const submenu = document.createElement('div');
  submenu.className = 'context-submenu';
  
  // Opción A-Z
  const sortAZOption = document.createElement('div');
  sortAZOption.className = 'context-menu-item';
  
  // Opción Más jugados
  const sortMostPlayedOption = document.createElement('div');
  sortMostPlayedOption.className = 'context-menu-item';
  
  // Verificar el tipo de ordenamiento actual para mostrar el corazón lleno
  const currentEmulator = config.emulators[tabIndex];
  const currentSortType = currentEmulator.sortType || 'none';
  
  // Configurar texto con corazones según el estado actual
  sortAZOption.innerHTML = (currentSortType === 'alphabetical' ? '♥' : '♡') + ' ' + t('ui.menu.alphabetical');
  sortMostPlayedOption.innerHTML = (currentSortType === 'mostplayed' ? '♥' : '♡') + ' ' + t('ui.menu.mostPlayed');
  
  sortAZOption.addEventListener('click', () => {
    closeContextMenu();
    sortGames(tabIndex, 'alphabetical');
  });
  
  sortMostPlayedOption.addEventListener('click', () => {
    closeContextMenu();
    sortGames(tabIndex, 'mostplayed');
  });
  
  submenu.appendChild(sortAZOption);
  submenu.appendChild(sortMostPlayedOption);
  
  // Agregar el submenú DESPUÉS del item principal, no como hijo
  // Esto es importante para el posicionamiento
  
  // Eventos del submenú - método más directo
  sortOption.onmouseenter = function() {
    const rect = sortOption.getBoundingClientRect();
    submenu.style.display = 'block';
    submenu.style.position = 'fixed';
    submenu.style.left = (rect.right) + 'px';
    submenu.style.top = rect.top + 'px';
    submenu.style.zIndex = '2002';
  };
  
  sortOption.onmouseleave = function(e) {
    // Solo ocultar si no nos movemos al submenú
    setTimeout(() => {
      if (!submenu.matches(':hover')) {
        submenu.style.display = 'none';
      }
    }, 100);
  };
  
  submenu.onmouseenter = function() {
    submenu.style.display = 'block';
  };
  
  submenu.onmouseleave = function() {
    submenu.style.display = 'none';
  };
  
  // Opción Buscar (segunda opción)
  const searchOption = document.createElement('div');
  searchOption.className = 'context-menu-item';
  searchOption.innerHTML = t('ui.contextMenu.search');
  searchOption.addEventListener('click', () => {
    closeContextMenu();
    showSearchBar();
  });

  // Opción Reescanear juegos y carátulas
  const scanOption = document.createElement('div');
  scanOption.className = 'context-menu-item';
  scanOption.innerHTML = t('ui.contextMenu.scanCovers') || 'Reescanear juegos y carátulas';
  scanOption.addEventListener('click', () => {
    closeContextMenu();
    refreshEmulatorGames(tabIndex);
  });

  // Opción Editar
  const editOption = document.createElement('div');
  editOption.className = 'context-menu-item';
  editOption.innerHTML = t('ui.contextMenu.edit');
  editOption.addEventListener('click', () => {
    closeContextMenu();
    editEmulator(tabIndex);
  });

  // Agregar opciones en el orden correcto: Ordenar, Buscar, Escanear, Editar
  menu.appendChild(sortOption);
  menu.appendChild(searchOption);
  menu.appendChild(scanOption);
  menu.appendChild(editOption);
  document.body.appendChild(menu);
  
  // Agregar el submenú directamente al body para mejor posicionamiento
  document.body.appendChild(submenu);
  
  // Cerrar el menú al hacer clic fuera
  window.addEventListener('click', closeContextMenu);
}

// Cerrar menú contextual
function closeContextMenu() {
  const menus = document.querySelectorAll('.context-menu');
  const submenus = document.querySelectorAll('.context-submenu');
  
  if (menus.length > 0) {
    menus.forEach(menu => menu.remove());
  }
  
  if (submenus.length > 0) {
    submenus.forEach(submenu => submenu.remove());
  }
}

// Variables globales para búsqueda
let searchBarVisible = false;
let originalGameList = null;

// Función para mostrar la barra de búsqueda
function showSearchBar() {
  
  if (searchBarVisible) return;
  
  // Crear la barra de búsqueda muy simple
  const searchContainer = document.createElement('div');
  searchContainer.id = 'simple-search';
  searchContainer.style.cssText = `
    position: fixed; 
    top: 20px; 
    right: 20px; 
    background: rgba(0,0,0,0.9); 
    border: 2px solid white; 
    padding: 10px; 
    z-index: 9999;
    border-radius: 5px;
  `;
  
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'search-input';
  // Usar fallback si la traducción no está disponible
  input.placeholder = t('ui.menu.search') || 'Buscar...';
  input.style.cssText = `
    color: white; 
    background: #333; 
    border: 1px solid #555; 
    padding: 8px; 
    border-radius: 3px;
    width: 200px;
    outline: none;
  `;
  
  searchContainer.appendChild(input);
  document.body.appendChild(searchContainer);
  searchBarVisible = true;
  
  // Función de búsqueda simple
  input.addEventListener('input', function() {
    const query = this.value.toLowerCase();
    const gameCards = document.querySelectorAll('.game-card');
    
    gameCards.forEach(card => {
      const title = card.getAttribute('data-title') || '';
      if (title.toLowerCase().includes(query) || query === '') {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  });
  
  // Cerrar con Escape
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      searchContainer.remove();
      searchBarVisible = false;
      // Mostrar todos los juegos de nuevo
      document.querySelectorAll('.game-card').forEach(card => {
        card.style.display = 'flex';
      });
    }
  });
  
  // Cerrar al hacer clic fuera
  setTimeout(() => {
    document.addEventListener('click', function clickOutside(e) {
      if (!searchContainer.contains(e.target)) {
        searchContainer.remove();
        searchBarVisible = false;
        // Mostrar todos los juegos de nuevo
        document.querySelectorAll('.game-card').forEach(card => {
          card.style.display = 'flex';
        });
        document.removeEventListener('click', clickOutside);
      }
    });
  }, 100);
  
  input.focus();
}

// Función auxiliar para obtener el índice de la pestaña activa
function getCurrentActiveTabIndex() {
  const tabs = document.querySelectorAll('.tab');
  for (let i = 0; i < tabs.length; i++) {
    if (tabs[i].classList.contains('active')) {
      return i;
    }
  }
  return -1;
}

// Función para ordenar juegos
function sortGames(tabIndex, sortType, saveToConfig = true) {
  if (!config.emulators || !config.emulators[tabIndex]) return;
  
  const emulator = config.emulators[tabIndex];
  
  // Guardar el tipo de ordenamiento en la configuración solo si se especifica
  if (saveToConfig) {
    emulator.sortType = sortType;
    saveConfig();
  }

  const main = document.getElementById('emulator-content');
  if (!main) return;

  // Si ya tenemos los juegos en memoria, ordenar y renderizar inmediatamente
  if (emulatorGamesCache.has(tabIndex)) {
    const cachedGames = emulatorGamesCache.get(tabIndex);
    renderGamesToContainer(cachedGames, emulator, main, false, tabIndex);
    return;
  }
  
  // Si no estuviesen en memoria, cargar y almacenar
  loadGames(emulator).then(games => {
    emulatorGamesCache.set(tabIndex, games);
    renderGamesToContainer(games, emulator, main, false, tabIndex);
  }).catch(error => {
    console.error('Error ordenando juegos:', error);
  });
}

// Editar un emulador existente
function editEmulator(index) {
  const emu = config.emulators[index];
  showSettings(emu, index);
}

// Eliminar un emulador
async function deleteEmulator(index) {
  const emulatorName = config.emulators[index].name;
  
  // Crear un modal de confirmación
  const confirmModal = document.createElement('div');
  confirmModal.className = 'confirm-modal';
  confirmModal.innerHTML = `
    <div class="confirm-content">
      <h3>${t('ui.messages.confirmDeletion')}</h3>
      <p>${t('ui.messages.deleteConfirm')} <strong>${emulatorName}</strong>?</p>
      <p class="confirm-warning">${t('ui.messages.deleteWarning')}</p>
      <div class="confirm-buttons">
        <button id="confirm-cancel" class="btn">${t('ui.buttons.cancel')}</button>
        <button id="confirm-delete" class="btn btn-danger">${t('ui.buttons.delete')}</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(confirmModal);
  
  // Esperar a que el usuario confirme o cancele
  return new Promise((resolve) => {
    document.getElementById('confirm-cancel').addEventListener('click', () => {
      confirmModal.remove();
      resolve(false);
    });
    
    document.getElementById('confirm-delete').addEventListener('click', async () => {
      confirmModal.remove();
      
      // Eliminar el emulador
      config.emulators.splice(index, 1);
      emulatorGamesCache.clear();
      emulatorDOMCache.clear();
      emulatorScrapedSet.clear();
      await ipcRenderer.invoke('save-config', config);
      renderTabs();
      resolve(true);
    });
  });
}

// Mostrar modal de configuración
function showSettings(emulatorToEdit = null, editIndex = -1) {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  
  const isEditing = emulatorToEdit !== null;
  
  // Limpiar el modal primero
  modal.innerHTML = '';
  
  // Crear el contenido del modal
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  
  modalContent.innerHTML = `
    <button id="close-settings-btn">&times;</button>
    <h2>${isEditing ? t('ui.tabs.editConsole') : t('ui.tabs.addConsole')}</h2>
    <div class="form-group">
      <label for="emu-name">${t('ui.forms.consoleName')}</label>
      <input id="emu-name" type="text" value="${isEditing ? emulatorToEdit.name : ''}">
    </div>
    <div class="form-group">
      <label for="emu-icon">${t('ui.forms.consoleType')}</label>
      <div style="display: flex; align-items: center; gap: 12px;">
        <select id="emu-icon" style="flex: 1;"></select>
        <div style="width: 54px; height: 38px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.08); border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); padding: 2px;">
          <img id="emu-icon-preview" src="" alt="Icon" style="max-height: 100%; max-width: 100%; object-fit: contain; display: none;" />
        </div>
      </div>
    </div>
    <div class="form-group">
      <label for="emu-exec">${t('ui.forms.executablePath')}</label>
      <div class="file-input-group">
        <input id="emu-exec" type="text" value="${isEditing ? emulatorToEdit.execPath : ''}" placeholder="${t('ui.forms.execPlaceholder') || 'Ruta a archivo o comando del sistema'}">
        <button id="select-exec-btn" class="btn" type="button" title="${t('ui.forms.fileTooltip') || 'Archivo ejecutable de la consola que no necesariamente está instalado en el sistema'}">${t('ui.forms.file')}</button>
        <button id="select-sysapp-btn" class="btn btn-secondary" type="button" title="${t('ui.forms.systemAppTooltip') || 'Programa instalado en el sistema que aparece en tu lista de programas'}">${t('ui.forms.systemApp')}</button>
      </div>
    </div>
    <div class="form-group">
      <label for="emu-games">${t('ui.forms.gamesPath')}</label>
      <div class="file-input-group">
        <input id="emu-games" type="text" value="${isEditing ? emulatorToEdit.gamesPath : ''}">
        <button id="select-games-btn" class="btn">${t('ui.buttons.select')}</button>
      </div>
    </div>
    <div class="form-group">
      <label for="emu-covers">${t('ui.forms.coversPath')}</label>
      <div class="file-input-group">
        <input id="emu-covers" type="text" value="${isEditing ? emulatorToEdit.coversPath : ''}">
        <button id="select-covers-btn" class="btn">${t('ui.buttons.select')}</button>
      </div>
      <small>${t('ui.forms.coverNote')}</small>
    </div>
    <div class="form-buttons">
      ${isEditing ? `<button id="delete-emu-btn" class="btn btn-danger">${t('ui.buttons.delete')}</button>` : ''}
      ${isEditing ? `<button id="scan-covers-btn" class="btn btn-secondary" type="button"><span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">image_search</span>${t('ui.buttons.scanCovers') || 'Escanear carátulas'}</button>` : ''}
      <button id="save-emu-btn" class="btn btn-primary">${isEditing ? t('ui.buttons.save') : t('ui.buttons.add')}</button>
      <button id="cancel-emu-btn" class="btn">${t('ui.buttons.cancel')}</button>
    </div>
  `;
  
  // Añadir el contenido al modal
  modal.appendChild(modalContent);
  
  // Mostrar el modal
  modal.classList.remove('hidden');
  
  // Cargar los íconos disponibles
  loadIcons(isEditing ? emulatorToEdit.icon : null);
  
  // Listener para el botón de cierre
  document.getElementById('close-settings-btn').addEventListener('click', function() {
    modal.classList.add('hidden');
  });
  
  // Listener para seleccionar ruta del ejecutable
  document.getElementById('select-exec-btn').addEventListener('click', async function() {
    try {
      const result = await ipcRenderer.invoke('select-file');
      if (result) {
        document.getElementById('emu-exec').value = result;
      }
    } catch (error) {
      console.error('Error seleccionando archivo:', error);
    }
  });

  // Listener para elegir aplicación del sistema (Linux)
  const selectSysAppBtn = document.getElementById('select-sysapp-btn');
  if (selectSysAppBtn) {
    selectSysAppBtn.addEventListener('click', function() {
      openSystemAppsModal();
    });
  }
  
  // Listener para seleccionar carpeta de juegos
  document.getElementById('select-games-btn').addEventListener('click', async function() {
    try {
      const result = await ipcRenderer.invoke('select-folder');
      document.getElementById('emu-games').value = result;
    } catch (error) {
      console.error('Error seleccionando carpeta:', error);
    }
  });

  // Listener para seleccionar carpeta de covers
  document.getElementById('select-covers-btn').addEventListener('click', async function() {
    try {
      const result = await ipcRenderer.invoke('select-folder');
      document.getElementById('emu-covers').value = result;
    } catch (error) {
      console.error('Error seleccionando carpeta de covers:', error);
    }
  });
  
  // Listener para guardar
  document.getElementById('save-emu-btn').addEventListener('click', function() {
    saveEmu(editIndex);
  });
  
  // Listener para cancelar
  document.getElementById('cancel-emu-btn').addEventListener('click', function() {
    modal.classList.add('hidden');
  });
  
  // Listener para eliminar (solo en modo edición)
  if (isEditing) {
    document.getElementById('delete-emu-btn').addEventListener('click', async function() {
      const deleted = await deleteEmulator(editIndex);
      if (deleted) {
        modal.classList.add('hidden');
      }
    });

    // Listener para escanear carátulas (a la derecha de Eliminar)
    document.getElementById('scan-covers-btn')?.addEventListener('click', async function() {
      const name = document.getElementById('emu-name').value;
      const icon = document.getElementById('emu-icon').value;
      const execPath = document.getElementById('emu-exec').value;
      const gamesPath = document.getElementById('emu-games').value;
      const coversPath = document.getElementById('emu-covers').value;

      if (editIndex >= 0) {
        config.emulators[editIndex] = { name, icon, execPath, gamesPath, coversPath };
        await saveConfig();
      }

      modal.classList.add('hidden');

      // Limpiar marcas 'removed' para permitir que las carátulas eliminadas se vuelvan a scrappear
      coverScraper.clearRemovedStatusForEmulator(config.emulators[editIndex]);

      showTopNotification(t('ui.contextMenu.scanCovers') || 'Escanear carátulas...', 'success');
      await refreshEmulatorGames(editIndex);
    });
  }
}

// Modal selector de aplicaciones instaladas en el sistema (Linux)
async function openSystemAppsModal() {
  const existing = document.getElementById('sysapps-modal');
  if (existing) existing.remove();

  const modalBackdrop = document.createElement('div');
  modalBackdrop.id = 'sysapps-modal';
  modalBackdrop.className = 'sysapps-modal-backdrop';

  modalBackdrop.innerHTML = `
    <div class="sysapps-modal-container">
      <div class="sysapps-header">
        <h3><span class="material-symbols-outlined" style="vertical-align: middle; margin-right: 8px;">apps</span>${t('ui.forms.selectSystemAppTitle') || 'Aplicaciones del sistema'}</h3>
        <button id="close-sysapps-btn" class="close-btn">&times;</button>
      </div>
      <div class="sysapps-search-bar">
        <span class="material-symbols-outlined search-icon">search</span>
        <input id="sysapps-search-input" type="text" placeholder="${t('ui.forms.searchAppsPlaceholder') || 'Buscar aplicación o emulador...'}" autofocus>
      </div>
      <div class="sysapps-filters">
        <button id="filter-games-btn" class="filter-tab active">${t('ui.forms.filterGamesEmulators') || 'Juegos y Emuladores'}</button>
        <button id="filter-all-btn" class="filter-tab">${t('ui.forms.filterAllApps') || 'Todas las aplicaciones'}</button>
      </div>
      <div id="sysapps-list" class="sysapps-list">
        <div class="sysapps-loading">
          <div class="scraping-spinner"></div>
          <span>Cargando aplicaciones...</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalBackdrop);

  const closeModal = () => modalBackdrop.remove();
  document.getElementById('close-sysapps-btn').addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  let allApps = [];
  try {
    allApps = await ipcRenderer.invoke('get-system-apps');
  } catch (e) {
    console.error('Error obteniendo aplicaciones del sistema:', e);
  }

  let activeFilter = 'games';
  let searchQuery = '';

  const listContainer = document.getElementById('sysapps-list');
  const searchInput = document.getElementById('sysapps-search-input');
  const filterGamesBtn = document.getElementById('filter-games-btn');
  const filterAllBtn = document.getElementById('filter-all-btn');

  // Si no hay juegos/emuladores específicos, cambiar a todas
  if (allApps.length > 0 && !allApps.some(a => a.isGameOrEmulator)) {
    activeFilter = 'all';
    filterAllBtn.classList.add('active');
    filterGamesBtn.classList.remove('active');
  }

  function renderApps() {
    listContainer.innerHTML = '';
    const q = searchQuery.toLowerCase().trim();

    const filtered = allApps.filter(app => {
      if (activeFilter === 'games' && !app.isGameOrEmulator) {
        return false;
      }
      if (q) {
        const matchName = app.name.toLowerCase().includes(q);
        const matchExec = app.exec.toLowerCase().includes(q);
        const matchComment = (app.comment || '').toLowerCase().includes(q);
        const matchCat = (app.categories || '').toLowerCase().includes(q);
        return matchName || matchExec || matchComment || matchCat;
      }
      return true;
    });

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="sysapps-empty">
          <span class="material-symbols-outlined" style="font-size: 32px; color: #888;">search_off</span>
          <p>${t('ui.forms.noAppsFound') || 'No se encontraron aplicaciones'}</p>
        </div>
      `;
      return;
    }

    filtered.forEach(app => {
      const item = document.createElement('div');
      item.className = 'sysapp-item';

      let iconHtml = '';
      if (app.iconData) {
        iconHtml = `<img class="sysapp-icon" src="${app.iconData}" alt="${app.name}" />`;
      } else {
        iconHtml = `<div class="sysapp-icon-fallback"><span class="material-symbols-outlined">sports_esports</span></div>`;
      }

      item.innerHTML = `
        ${iconHtml}
        <div class="sysapp-info">
          <div class="sysapp-name">${app.name}</div>
          <div class="sysapp-cmd" title="${app.exec}">${app.exec}</div>
        </div>
      `;

      item.addEventListener('click', () => {
        const execInput = document.getElementById('emu-exec');
        if (execInput) {
          execInput.value = app.exec;
        }
        const nameInput = document.getElementById('emu-name');
        if (nameInput && (!nameInput.value || nameInput.value.trim() === '')) {
          nameInput.value = app.name;
        }
        closeModal();
      });

      listContainer.appendChild(item);
    });
  }

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderApps();
  });

  filterGamesBtn.addEventListener('click', () => {
    activeFilter = 'games';
    filterGamesBtn.classList.add('active');
    filterAllBtn.classList.remove('active');
    renderApps();
  });

  filterAllBtn.addEventListener('click', () => {
    activeFilter = 'all';
    filterAllBtn.classList.add('active');
    filterGamesBtn.classList.remove('active');
    renderApps();
  });

  renderApps();
  if (searchInput) {
    setTimeout(() => searchInput.focus(), 100);
  }
}

function loadIcons(selectedIcon = null) {
  // Lista de íconos disponibles (nombres base para mapear con romExtensions)
  const icons = [
    'nes', 'snes', 'n64', 'gamecube', 'wii', 'wiiu', 'switch',
    'gameboy', 'gbc', 'gba', 'ds', '3ds',
    'ps1', 'ps2', 'psp',
    'xbox', 'xbox360',
    'genesis', 'dreamcast', 'mame',
    'otra'
  ];
  const select = document.getElementById('emu-icon');
  if (!select) return;
  
  select.innerHTML = '';
  icons.forEach(i => {
    const option = document.createElement('option');
    option.value = i;
    
    // Texto especial para "otra"
    if (i === 'otra') {
      option.textContent = 'OTRA CONSOLA';
    } else {
      option.textContent = i.toUpperCase();
    }
    
    // Preseleccionar el ícono actual si estamos editando
    if (selectedIcon && i === selectedIcon) {
      option.selected = true;
    }
    
    select.appendChild(option);
  });

  const preview = document.getElementById('emu-icon-preview');
  function updateIconPreview() {
    if (preview && select.value) {
      preview.src = `../assets/console-icons/${select.value.toLowerCase()}.png`;
      preview.style.display = 'block';
    }
  }
  select.addEventListener('change', updateIconPreview);
  updateIconPreview();
}

// Guardar nuevo emulador
async function saveEmu(editIndex = -1) {
  const name = document.getElementById('emu-name').value;
  const icon = document.getElementById('emu-icon').value;
  const execPath = document.getElementById('emu-exec').value;
  const gamesPath = document.getElementById('emu-games').value;
  const coversPath = document.getElementById('emu-covers').value;
  
  if (!name) {
    alert(t('ui.messages.nameRequired'));
    return;
  }
  
  if (!execPath) {
    alert(t('ui.messages.execPathRequired'));
    return;
  }
  
  // Agregar nuevo emulador o editar existente
  if (editIndex >= 0) {
    config.emulators[editIndex] = { name, icon, execPath, gamesPath, coversPath };
    emulatorGamesCache.delete(editIndex);
    emulatorDOMCache.delete(editIndex);
    emulatorScrapedSet.delete(editIndex);
  } else {
    if (!config.emulators) config.emulators = [];
    config.emulators.push({ name, icon, execPath, gamesPath, coversPath });
    emulatorGamesCache.clear();
    emulatorDOMCache.clear();
    emulatorScrapedSet.clear();
  }
  
  // Guardar configuración
  try {
    await ipcRenderer.invoke('save-config', config);
    
    // Cerrar modal
    document.getElementById('settings-modal').classList.add('hidden');
    
    // Renderizar pestañas con nuevo emulador
    renderTabs();
  } catch (error) {
    console.error('Error saving configuration:', error);
    alert(`${t('ui.messages.errorSaving')} ${error.message}`);
  }
}

// Mostrar modal de configuración general
function showConfigModal() {
  // Crear modal con diseño dashboard
  const configModal = document.createElement('div');
  configModal.className = 'modal-overlay';
  configModal.innerHTML = `
    <div class="config-modal-container flex items-center justify-center p-xl" style="height: 100vh; width: 100vw; display: flex; align-items: center; justify-content: center;">
      <!-- Main Modal Container -->
      <div class="config-modal" style="width: 1000px; height: 750px; max-width: 95vw; max-height: 95vh;">
        <!-- TopAppBar -->
        <header class="config-header">
          <div class="config-header-title">
            <span class="material-symbols-outlined">settings</span>
            <span>${t('ui.configuration.title')}</span>
          </div>
          <button class="config-close-btn" id="config-close">
            <span class="material-symbols-outlined">close</span>
          </button>
        </header>

        <!-- Main Content Layout -->
        <div class="config-body">
          <!-- Sidebar -->
          <aside class="config-sidebar">
            <!-- Profile Section -->
            <div class="config-profile-card ${config.theme && config.theme.profileImage ? 'has-custom-image' : ''}">
              <div class="config-profile-wrapper ${config.theme && config.theme.profileImage ? 'has-custom-image' : ''}">
                <div class="config-profile-image-container ${config.theme && config.theme.profileImage ? 'has-custom-image' : ''}">
                  <div id="profile-image-preview" class="config-profile-image" style="cursor: pointer;" title="${t('ui.configuration.profileImage')}"></div>
                </div>
                <div id="profile-remove-hover-text" class="config-profile-remove-text" style="${config.theme && config.theme.profileImage ? '' : 'display: none;'}">
                  ${t('ui.configuration.removeProfilePhoto') || 'Eliminar foto'}
                </div>
              </div>
              <input id="profile-image-input" type="file" accept="image/*" style="display: none;" />
              <button class="config-profile-btn" id="profile-remove-btn" style="display: none; margin-top: 8px;">
                <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
                ${t('ui.buttons.clear')}
              </button>
            </div>

            <!-- Navigation Links -->
            <nav class="config-nav">
              <button class="config-nav-item active config-menu-item" data-section="theme">
                <span class="material-symbols-outlined">palette</span>
                ${t('ui.menu.interface')}
              </button>
              <button class="config-nav-item config-menu-item" data-section="update" style="position: relative; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="material-symbols-outlined">system_update</span>
                  <span>${t('ui.menu.update')}</span>
                </div>
                <span id="update-pulse-indicator" class="update-pulse-dot" style="display: none;"></span>
              </button>
              <button class="config-nav-item config-menu-item" data-section="about">
                <span class="material-symbols-outlined">info</span>
                ${t('ui.menu.about')}
              </button>
            </nav>
          </aside>

          <!-- Main Panel -->
          <main class="config-main">
            <!-- Theme Section -->
            <div class="config-section active" id="theme-section">
              <div class="config-section-header">
                <div class="config-section-title">
                  <span class="material-symbols-outlined text-primary">format_paint</span>
                  <h3>${t('ui.configuration.themeConfig')}</h3>
                </div>
                <span class="config-section-subtitle">${t('ui.menu.interface')}</span>
              </div>

              <div class="config-cards-grid">
                <!-- Header Color -->
                <div class="config-card">
                  <div class="config-card-info">
                    <div class="config-card-icon"><span class="material-symbols-outlined">border_top</span></div>
                    <div class="config-card-text">
                      <p class="title">${t('ui.configuration.headerColor')}</p>
                    </div>
                  </div>
                  <div class="config-card-action">
                    <span class="color-value font-mono text-sm" style="color: var(--on-surface-variant); font-family: monospace; margin-right: 8px;"></span>
                    <input type="color" id="header-color" value="#db2424" />
                  </div>
                </div>
                
                <!-- Tab Selected Color -->
                <div class="config-card">
                  <div class="config-card-info">
                    <div class="config-card-icon"><span class="material-symbols-outlined">tab</span></div>
                    <div class="config-card-text">
                      <p class="title">${t('ui.configuration.tabSelected')}</p>
                    </div>
                  </div>
                  <div class="config-card-action">
                    <span class="color-value font-mono text-sm" style="color: var(--on-surface-variant); font-family: monospace; margin-right: 8px;"></span>
                    <input type="color" id="tab-selected-color" value="#2a2a2a" />
                  </div>
                </div>

                <!-- Tab Hover Color -->
                <div class="config-card">
                  <div class="config-card-info">
                    <div class="config-card-icon"><span class="material-symbols-outlined">touch_app</span></div>
                    <div class="config-card-text">
                      <p class="title">${t('ui.configuration.tabHover')}</p>
                    </div>
                  </div>
                  <div class="config-card-action">
                    <span class="color-value font-mono text-sm" style="color: var(--on-surface-variant); font-family: monospace; margin-right: 8px;"></span>
                    <input type="color" id="tab-hover-color" value="#a49a9a" />
                  </div>
                </div>

                <!-- Tab Background Color -->
                <div class="config-card">
                  <div class="config-card-info">
                    <div class="config-card-icon"><span class="material-symbols-outlined">ad_group</span></div>
                    <div class="config-card-text">
                      <p class="title">${t('ui.configuration.tabBackground')}</p>
                    </div>
                  </div>
                  <div class="config-card-action">
                    <span class="color-value font-mono text-sm" style="color: var(--on-surface-variant); font-family: monospace; margin-right: 8px;"></span>
                    <input type="color" id="tab-background-color" value="#e83b3b" />
                  </div>
                </div>

                <!-- Tab Text Color -->
                <div class="config-card">
                  <div class="config-card-info">
                    <div class="config-card-icon"><span class="material-symbols-outlined">text_fields</span></div>
                    <div class="config-card-text">
                      <p class="title">${t('ui.configuration.tabText')}</p>
                    </div>
                  </div>
                  <div class="config-card-action">
                    <span class="color-value font-mono text-sm" style="color: var(--on-surface-variant); font-family: monospace; margin-right: 8px;"></span>
                    <input type="color" id="tab-text-color" value="#ffffff" />
                  </div>
                </div>

                <!-- Main Background Color -->
                <div class="config-card">
                  <div class="config-card-info">
                    <div class="config-card-icon"><span class="material-symbols-outlined">wallpaper</span></div>
                    <div class="config-card-text">
                      <p class="title">${t('ui.configuration.mainBackground')}</p>
                    </div>
                  </div>
                  <div class="config-card-action">
                    <span class="color-value font-mono text-sm" style="color: var(--on-surface-variant); font-family: monospace; margin-right: 8px;"></span>
                    <input type="color" id="main-background-color" value="#222222" />
                  </div>
                </div>

                <!-- Botón Aplicar Tema Rápido (debajo de los colores) -->
                <div class="config-card full-width" style="display: flex; justify-content: flex-end; background: transparent; border: none; padding: 4px 0 12px 0; box-shadow: none;">
                  <button id="apply-theme-quick-btn" class="btn-config btn-config-secondary" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 500;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">palette</span>
                    ${t('ui.configuration.applyTheme')}
                  </button>
                </div>

                <!-- Estilo de Pestañas -->
                <div class="config-card full-width" id="card-tab-style">
                  <div class="config-card-info">
                    <div class="config-card-icon"><span class="material-symbols-outlined">style</span></div>
                    <div class="config-card-text">
                      <p class="title">${t('ui.configuration.tabStyle')}</p>
                      <p class="desc">${t('ui.configuration.tabStyleDesc')}</p>
                    </div>
                  </div>
                  <div class="config-card-action" style="min-width: 200px;">
                    <select id="tab-style-select">
                      <option value="both">${t('ui.configuration.tabStyleBoth')}</option>
                      <option value="text">${t('ui.configuration.tabStyleText')}</option>
                      <option value="icons">${t('ui.configuration.tabStyleIcons')}</option>
                    </select>
                  </div>
                </div>

                <!-- Alineación de Pestañas -->
                <div class="config-card full-width" id="card-tab-alignment">
                  <div class="config-card-info">
                    <div class="config-card-icon"><span class="material-symbols-outlined">format_align_center</span></div>
                    <div class="config-card-text">
                      <p class="title">${t('ui.configuration.tabAlignment')}</p>
                      <p class="desc">${t('ui.configuration.tabAlignmentDesc')}</p>
                    </div>
                  </div>
                  <div class="config-card-action" style="min-width: 200px;">
                    <select id="tab-alignment-select">
                      <option value="left">${t('ui.configuration.alignLeft')}</option>
                      <option value="center">${t('ui.configuration.alignCenter')}</option>
                      <option value="right">${t('ui.configuration.alignRight')}</option>
                    </select>
                  </div>
                </div>

                <!-- Language Section -->
                <div class="config-card full-width">
                  <div class="config-card-info">
                    <div class="config-card-icon"><span class="material-symbols-outlined">translate</span></div>
                    <div class="config-card-text">
                      <p class="title">${t('ui.configuration.language')}</p>
                      <p class="desc">${t('ui.configuration.languageDescription')}</p>
                    </div>
                  </div>
                  <div class="config-card-action" style="min-width: 200px;">
                    <select id="language-select"></select>
                  </div>
                </div>

                <!-- Tooltips -->
                <div class="config-card full-width">
                  <div class="config-card-info">
                    <div class="config-card-icon"><span class="material-symbols-outlined">help</span></div>
                    <div class="config-card-text">
                      <p class="title">${t('ui.configuration.showTooltips')}</p>
                      <p class="desc">${t('ui.configuration.tooltipsDescription')}</p>
                    </div>
                  </div>
                  <div class="config-card-action">
                    <input type="checkbox" id="show-tooltips" checked />
                  </div>
                </div>

                <!-- Background Music -->
                <div class="config-card flex-col full-width">
                  <div class="config-card-info" style="width: 100%;">
                    <div class="config-card-icon"><span class="material-symbols-outlined">music_note</span></div>
                    <div class="config-card-text">
                      <p class="title">${t('ui.configuration.backgroundMusic')}</p>
                      <p class="desc">${t('ui.configuration.audioNote')}</p>
                    </div>
                  </div>
                  <div class="input-group">
                    <input id="background-music" type="text" placeholder="${t('ui.configuration.selectAudioPlaceholder')}" readonly />
                    <button id="select-audio-btn" class="btn-config btn-config-secondary" style="padding: 10px 16px;">
                      <span class="material-symbols-outlined" style="font-size: 20px; margin:0;">folder_open</span>
                    </button>
                    <button id="play-stop-audio-btn" class="btn-config btn-config-secondary" style="display: none; padding: 10px 16px;">
                      <span class="material-symbols-outlined" style="font-size: 20px; margin:0;">play_arrow</span>
                    </button>
                    <button id="clear-audio-btn" class="btn-config btn-config-secondary" style="display: none; padding: 10px 16px;">
                      <span class="material-symbols-outlined" style="font-size: 20px; margin:0;">delete</span>
                    </button>
                  </div>
                </div>
              </div>
              <div class="config-footer">
                <button id="reset-theme-btn" class="btn-config btn-config-secondary">
                  ${t('ui.configuration.resetDefault')}
                </button>
                <button id="apply-theme-btn" class="btn-config btn-config-primary">
                  ${t('ui.configuration.saveConfig') || 'Guardar configuración'}
                </button>
              </div>
            </div>

            <!-- Update Section -->
            <div class="config-section" id="update-section">
              <div class="config-section-header">
                <div class="config-section-title">
                  <span class="material-symbols-outlined text-primary">update</span>
                  <h3>${t('ui.update.title')}</h3>
                </div>
                <span class="config-section-subtitle">${t('ui.menu.update')}</span>
              </div>
              
              <div class="config-card full-width flex-col">

                <p class="current-version" style="font-size: 16px; margin: 0; color: var(--on-surface);">${t('ui.update.currentVersion')} <strong style="color: var(--primary);"></strong></p>
                
                <div id="github-update-container" style="margin-top: 16px; display: flex; flex-direction: column; gap: 8px;">
                  <button id="check-github-update-btn" class="btn-config btn-config-primary">
                    <span class="material-symbols-outlined">sync</span>
                    ${t('ui.update.checkForUpdates') || 'Check for updates'}
                  </button>
                  <div id="github-update-status" style="font-size: 14px; display: none; margin-top: 8px; color: var(--on-surface-variant);"></div>
                  <button id="download-github-update-btn" class="btn-config btn-config-primary" style="display: none; background-color: #28a745; margin-top: 8px;">
                    <span class="material-symbols-outlined">download</span>
                    ${t('ui.update.downloadUpdate') || 'Descargar actualización'}
                  </button>
                  <button id="restart-app-btn" class="btn-config btn-config-primary" style="display: none; background-color: #007acc; margin-top: 8px;">
                    <span class="material-symbols-outlined">restart_alt</span>
                    ${t('ui.messages.restartApp') || 'Reiniciar aplicación'}
                  </button>
                </div>
              </div>

              <div class="config-card full-width flex-col">
                <div class="config-card-info" style="width: 100%;">
                  <div class="config-card-icon"><span class="material-symbols-outlined">settings_backup_restore</span></div>
                  <div class="config-card-text">
                    <p class="title">${t('ui.update.configManagement')}</p>
                    <p class="desc">${t('ui.update.configNote')}</p>
                  </div>
                </div>
                <p style="margin: 0; font-size: 14px; color: var(--on-surface-variant);"><strong>${t('ui.update.location')}</strong> <span id="config-path">Cargando...</span></p>
                
                <div class="input-group">
                  <button id="backup-config-btn" class="btn-config btn-config-secondary" style="font-size: 14px; padding: 8px 16px;">${t('ui.update.backupConfig')}</button>
                  <button id="export-config-btn" class="btn-config btn-config-secondary" style="font-size: 14px; padding: 8px 16px;">${t('ui.update.exportConfig')}</button>
                  <button id="import-config-btn" class="btn-config btn-config-secondary" style="font-size: 14px; padding: 8px 16px;">${t('ui.update.importConfig')}</button>
                </div>
              </div>
            </div>

            <!-- About Section -->
            <div class="config-section" id="about-section">
              <div class="config-section-header">
                <div class="config-section-title">
                  <span class="material-symbols-outlined text-primary">info</span>
                  <h3>${t('ui.about.title')}</h3>
                </div>
                <span class="config-section-subtitle">${t('ui.about.information')}</span>
              </div>

              <div class="config-cards-grid">
                <div class="about-card-modern" style="grid-column: 1 / -1;">
                  <h4><span class="material-symbols-outlined" style="vertical-align: middle; margin-right: 8px; font-size: 20px;">info</span>${t('ui.about.information')}</h4>
                  <p>${t('ui.about.welcomeMessage')}</p>
                  <p>${t('ui.about.projectDescription')}</p>
                  <p>${t('ui.about.enjoyMessage')}</p>
                </div>

                <div class="about-card-modern" style="grid-column: 1 / -1;">
                  <h4><span class="material-symbols-outlined" style="vertical-align: middle; margin-right: 8px; font-size: 20px;">gavel</span>${t('ui.about.disclaimer')}</h4>
                  <p>${t('ui.about.noWarranty')}</p>
                  <p>${t('ui.about.userResponsibility')}</p>
                  <p>${t('ui.about.acceptTerms')}</p>
                  <br>
                  <p>${t('ui.about.toolPurpose')}</p>
                  <p>${t('ui.about.trademarks')}</p>
                  <p>${t('ui.about.noAffiliation')}</p>
                  <p>${t('ui.about.copyrightCompliance')}</p>
                </div>

                <div class="config-card full-width" style="margin-top: 16px;">
                  <div class="config-card-info">
                    <div class="config-card-icon"><span class="material-symbols-outlined">language</span></div>
                    <div class="config-card-text">
                      <p class="title">Web</p>
                      <p class="desc">${t('ui.about.viewWebsite') || 'Ir al sitio web del proyecto'}</p>
                    </div>
                  </div>
                  <div class="config-card-action">
                    <button id="open-github-releases" class="btn-config btn-config-secondary" style="font-size: 14px; padding: 8px 16px;">
                      <span class="material-symbols-outlined">open_in_new</span>
                      ${t('ui.about.viewWebsiteBtn') || 'Ir al sitio web'}
                    </button>
                  </div>
                </div>

                <div class="config-card full-width" style="margin-top: 16px; border-color: var(--primary);">
                  <div class="config-card-info">
                    <div class="config-card-icon"><span class="material-symbols-outlined">favorite</span></div>
                    <div class="config-card-text">
                      <p class="title">${t('ui.about.supportProject')}</p>
                      <p class="desc">${t('ui.about.supportMessage')}</p>
                    </div>
                  </div>
                  <div class="config-card-action">
                    <a href="#" id="paypal-donation-link" class="btn-config btn-config-primary" style="text-decoration: none; font-size: 16px; padding: 10px 24px;">
                      ${t('ui.about.donatePaypal')}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(configModal);
  
  // Función para cargar colores guardados desde la configuración
  function loadSavedColors() {
    // Obtener las variables CSS actuales del elemento root
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    
    // Función para obtener color CSS o usar por defecto
    function getCSSColor(varName, defaultColor) {
      const value = computedStyle.getPropertyValue(varName).trim();
      return value || defaultColor;
    }
    
    // Leer los colores actuales desde CSS o usar valores por defecto
    const headerColorInput = document.getElementById('header-color');
    const tabSelectedColorInput = document.getElementById('tab-selected-color');
    const tabHoverColorInput = document.getElementById('tab-hover-color');
    const tabBackgroundColorInput = document.getElementById('tab-background-color');
    const tabTextColorInput = document.getElementById('tab-text-color');
    const mainBackgroundColorInput = document.getElementById('main-background-color');
    
    // Si config.theme existe y es un objeto, usar esos valores
    if (config.theme && typeof config.theme === 'object') {
      if (config.theme.headerColor) {
        headerColorInput.value = config.theme.headerColor;
        updateColorValue(headerColorInput);
      }
      if (config.theme.tabSelectedColor) {
        tabSelectedColorInput.value = config.theme.tabSelectedColor;
        updateColorValue(tabSelectedColorInput);
      }
      if (config.theme.tabHoverColor) {
        tabHoverColorInput.value = config.theme.tabHoverColor;
        updateColorValue(tabHoverColorInput);
      }
      if (config.theme.tabBackgroundColor) {
        tabBackgroundColorInput.value = config.theme.tabBackgroundColor;
        updateColorValue(tabBackgroundColorInput);
      }
      if (config.theme.tabTextColor) {
        tabTextColorInput.value = config.theme.tabTextColor;
        updateColorValue(tabTextColorInput);
      }
      if (config.theme.mainBackgroundColor) {
        mainBackgroundColorInput.value = config.theme.mainBackgroundColor;
        updateColorValue(mainBackgroundColorInput);
      }
    } else {
      // Si no hay configuración válida, leer desde CSS o usar por defecto
      headerColorInput.value = getCSSColor('--header-color', '#db2424');
      updateColorValue(headerColorInput);
      
      tabSelectedColorInput.value = getCSSColor('--tab-selected-color', '#2a2a2a');
      updateColorValue(tabSelectedColorInput);
      
      tabHoverColorInput.value = getCSSColor('--tab-hover-color', '#a49a9a');
      updateColorValue(tabHoverColorInput);
      
      tabBackgroundColorInput.value = getCSSColor('--tab-background-color', '#e83b3b');
      updateColorValue(tabBackgroundColorInput);
      
      tabTextColorInput.value = getCSSColor('--tab-text-color', '#ffffff');
      updateColorValue(tabTextColorInput);
      
      mainBackgroundColorInput.value = getCSSColor('--main-background-color', '#222222');
      updateColorValue(mainBackgroundColorInput);
    }

    // Cargar opciones de pestañas
    const tabStyleSelect = document.getElementById('tab-style-select');
    const tabAlignmentSelect = document.getElementById('tab-alignment-select');

    if (tabStyleSelect) {
      tabStyleSelect.value = (config.theme && config.theme.tabStyle) || 'both';
    }
    if (tabAlignmentSelect) {
      tabAlignmentSelect.value = (config.theme && config.theme.tabAlignment) || 'left';
    }
  }
  
  // Función para actualizar el valor mostrado del color
  function updateColorValue(input) {
    const valueSpan = input.parentElement.querySelector('.color-value');
    if (valueSpan) {
      valueSpan.textContent = input.value;
    }
  }
  
  // Cargar colores guardados
  loadSavedColors();
  
  // Cargar configuración de audio
  function loadAudioConfig() {
    const backgroundMusicInput = document.getElementById('background-music');
    const clearAudioBtn = document.getElementById('clear-audio-btn');
    const playStopBtn = document.getElementById('play-stop-audio-btn');
    
    if (config.audio && config.audio.backgroundMusic) {
      if (backgroundMusicInput) {
        backgroundMusicInput.value = config.audio.backgroundMusic;
      }
      if (clearAudioBtn) {
        clearAudioBtn.style.display = 'inline-block';
      }
      if (playStopBtn) {
        playStopBtn.style.display = 'inline-block';
        updatePlayStopButton();
      }
    }
  }
  
  // Cargar configuración de audio
  loadAudioConfig();
  
  // Event listeners para los selectores de color
  const colorInputs = configModal.querySelectorAll('input[type="color"]');
  colorInputs.forEach(input => {
    input.addEventListener('input', () => updateColorValue(input));
  });
  
  // Función para aplicar el tema
  function applyTheme() {
    const headerColor = document.getElementById('header-color').value;
    const tabSelectedColor = document.getElementById('tab-selected-color').value;
    const tabHoverColor = document.getElementById('tab-hover-color').value;
    const tabBackgroundColor = document.getElementById('tab-background-color').value;
    const tabTextColor = document.getElementById('tab-text-color').value;
    const mainBackgroundColor = document.getElementById('main-background-color').value;
    
    // Asegurar que config.theme sea un objeto válido
    if (!config.theme || typeof config.theme !== 'object') {
      config.theme = {};
    }
    
    // Guardar los colores y estilos en la configuración
    config.theme.headerColor = headerColor;
    config.theme.tabSelectedColor = tabSelectedColor;
    config.theme.tabHoverColor = tabHoverColor;
    config.theme.tabBackgroundColor = tabBackgroundColor;
    config.theme.tabTextColor = tabTextColor;
    config.theme.mainBackgroundColor = mainBackgroundColor;
    
    // Guardar opciones de pestañas
    const tabStyle = document.getElementById('tab-style-select')?.value || 'both';
    const tabAlignment = document.getElementById('tab-alignment-select')?.value || 'left';
    
    config.theme.tabStyle = tabStyle;
    config.theme.tabAlignment = tabAlignment;
    delete config.theme.navigationMode;

    // Guardar configuración
    saveConfig();
    
    // Crear variables CSS personalizadas
    const root = document.documentElement;
    root.style.setProperty('--header-color', headerColor);
    root.style.setProperty('--tab-selected-color', tabSelectedColor);
    root.style.setProperty('--tab-hover-color', tabHoverColor);
    root.style.setProperty('--tab-background-color', tabBackgroundColor);
    root.style.setProperty('--tab-text-color', tabTextColor);
    root.style.setProperty('--main-background-color', mainBackgroundColor);
    
    // Aplicar los colores directamente a los elementos
    const emulatorTabs = document.getElementById('emulator-tabs');
    if (emulatorTabs) {
      emulatorTabs.style.background = headerColor;
    }
    
    // Aplicar colores a las pestañas usando la función centralizada
    applyTabColors();
    
    // Volver a renderizar las pestañas para aplicar cambios de iconos o modo
    renderTabs();
    
    // Mostrar notificación emergente debajo de la barra superior
    showTopNotification(t('ui.messages.themeApplied') || 'Tema aplicado correctamente', 'success');
  }
  
  // Función para restablecer tema por defecto
  function resetTheme() {
    document.getElementById('header-color').value = '#db2424';
    document.getElementById('tab-selected-color').value = '#2a2a2a';
    document.getElementById('tab-hover-color').value = '#a49a9a';
    document.getElementById('tab-background-color').value = '#e83b3b';
    document.getElementById('tab-text-color').value = '#ffffff';
    document.getElementById('main-background-color').value = '#222222';
    
    if (document.getElementById('tab-style-select')) document.getElementById('tab-style-select').value = 'both';
    if (document.getElementById('tab-alignment-select')) document.getElementById('tab-alignment-select').value = 'left';

    // Actualizar los valores mostrados
    colorInputs.forEach(input => updateColorValue(input));
    
    // Aplicar y guardar el tema por defecto
    applyTheme();
  }
  
  // Navegación del menú lateral
  const menuItems = configModal.querySelectorAll('.config-menu-item');
  const sections = configModal.querySelectorAll('.config-section');
  
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      // Remover clase active de todos los items y secciones
      menuItems.forEach(mi => mi.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      
      // Activar el item clickeado
      item.classList.add('active');
      
      // Mostrar la sección correspondiente
      const sectionId = item.getAttribute('data-section') + '-section';
      const targetSection = configModal.querySelector('#' + sectionId);
      if (targetSection) {
        targetSection.classList.add('active');
      }
    });
  });
  
  // Cerrar modal al hacer clic en X
  document.getElementById('config-close').addEventListener('click', () => {
    configModal.remove();
  });
  
  // Cerrar modal al hacer clic fuera
  configModal.addEventListener('click', (e) => {
    if (e.target === configModal) {
      configModal.remove();
    }
  });
  
  // Event listeners para botones de tema y configuración
  document.getElementById('apply-theme-quick-btn')?.addEventListener('click', () => {
    applyTheme();
    configModal.remove();
  });
  
  document.getElementById('apply-theme-btn')?.addEventListener('click', () => {
    applyTheme();
    configModal.remove();
  });
  
  document.getElementById('reset-theme-btn')?.addEventListener('click', () => {
    const confirmModal = document.createElement('div');
    confirmModal.className = 'confirm-modal';
    confirmModal.style.zIndex = '12000';
    confirmModal.innerHTML = `
      <div class="confirm-content">
        <h3 style="display: flex; align-items: center; gap: 8px;">
          <span class="material-symbols-outlined" style="color: #ff9800;">warning</span>
          ${t('ui.configuration.resetDefault')}
        </h3>
        <p style="margin-top: 10px;">${t('ui.messages.confirmResetTheme') || '¿Deseas restablecer los colores y el estilo del tema a sus valores originales?'}</p>
        <p class="confirm-warning" style="margin-top: 10px; font-size: 13px; color: var(--on-surface-variant);">${t('ui.messages.confirmResetThemeWarning') || 'Se restablecerá la configuración visual. Tus consolas y juegos configurados NO se verán afectados.'}</p>
        <div class="confirm-buttons" style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
          <button id="confirm-reset-cancel" class="btn btn-secondary">${t('ui.buttons.cancel') || 'Cancelar'}</button>
          <button id="confirm-reset-ok" class="btn btn-danger">${t('ui.buttons.confirm') || 'Restablecer'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(confirmModal);

    document.getElementById('confirm-reset-cancel').addEventListener('click', () => {
      confirmModal.remove();
    });

    document.getElementById('confirm-reset-ok').addEventListener('click', () => {
      confirmModal.remove();
      resetTheme();
    });
  });
  
  // Event listeners para música de fondo
  document.getElementById('select-audio-btn')?.addEventListener('click', async () => {
    try {
      const result = await ipcRenderer.invoke('select-audio-file');
      if (result) {
        document.getElementById('background-music').value = result;
        document.getElementById('clear-audio-btn').style.display = 'inline-block';
        
        // Guardar en configuración
        if (!config.audio) config.audio = {};
        config.audio.backgroundMusic = result;
        await saveConfig();
        
        // Mostrar botón Play/Stop
        document.getElementById('play-stop-audio-btn').style.display = 'inline-block';
        
        // Reproducir la música
        playBackgroundMusic(result);
      }
    } catch (error) {
      console.error('Error seleccionando archivo de audio:', error);
      alert(`${t('ui.messages.audioError')} ${error.message}`);
    }
  });
  
  document.getElementById('play-stop-audio-btn')?.addEventListener('click', () => {
    if (isPlaying) {
      pauseBackgroundMusic();
    } else {
      if (backgroundAudio) {
        resumeBackgroundMusic();
      } else if (config.audio && config.audio.backgroundMusic) {
        playBackgroundMusic(config.audio.backgroundMusic);
      }
    }
  });
  
  document.getElementById('clear-audio-btn')?.addEventListener('click', async () => {
    document.getElementById('background-music').value = '';
    document.getElementById('clear-audio-btn').style.display = 'none';
    document.getElementById('play-stop-audio-btn').style.display = 'none';
    
    // Remover de configuración
    if (config.audio) {
      config.audio.backgroundMusic = null;
    }
    await saveConfig();
    
    // Detener música
    stopBackgroundMusic();
  });
  
  // Event listeners para el nuevo sistema de actualizaciones manuales
  document.getElementById('open-github-releases')?.addEventListener('click', () => {
    const { shell } = require('electron');
    shell.openExternal('https://gessendarien.github.io/cascabel-launcher');
  });

  // Comprobación silenciosa de actualizaciones para encender el punto blanco
  (async () => {
    try {
      const result = await ipcRenderer.invoke('check-update-github');
      if (result && result.success && result.tag) {
        const latestTagStr = result.tag.replace(/^v/, '');
        const appInfo = await ipcRenderer.invoke('get-app-info');
        const currentVersionStr = appInfo.version.replace(/^v/, '');
        
        const v1parts = latestTagStr.split('.').map(Number);
        const v2parts = currentVersionStr.split('.').map(Number);
        let isNewer = false;
        for (let i = 0; i < Math.max(v1parts.length, v2parts.length); ++i) {
          const v1 = v1parts[i] || 0;
          const v2 = v2parts[i] || 0;
          if (v1 > v2) { isNewer = true; break; }
          if (v1 < v2) { break; }
        }
        if (isNewer) {
          const dot = document.getElementById('update-pulse-indicator');
          if (dot) dot.style.display = 'inline-block';
        }
      }
    } catch (e) {}
  })();
  
  // Lógica para comprobar y descargar actualizaciones
  let currentDownloadUrl = '';
  let currentDownloadName = '';
  document.getElementById('check-github-update-btn')?.addEventListener('click', async () => {
    const checkBtn = document.getElementById('check-github-update-btn');
    const downloadBtn = document.getElementById('download-github-update-btn');
    const restartBtn = document.getElementById('restart-app-btn');
    const statusDiv = document.getElementById('github-update-status');
    
    checkBtn.disabled = true;
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = `<span class="material-symbols-outlined animate-spin" style="vertical-align: middle; font-size: 16px; margin-right: 4px;">sync</span> ${t('ui.update.checkingUpdates') || 'Comprobando actualizaciones...'}`;
    downloadBtn.style.display = 'none';
    if (restartBtn) restartBtn.style.display = 'none';

    try {
      const result = await ipcRenderer.invoke('check-update-github');
      if (result.success) {
        const latestTagStr = result.tag.replace(/^v/, '');
        const appInfo = await ipcRenderer.invoke('get-app-info');
        const currentVersionStr = appInfo.version.replace(/^v/, '');
        
        // Custom simple version comparison
        const v1parts = latestTagStr.split('.').map(Number);
        const v2parts = currentVersionStr.split('.').map(Number);
        let isNewer = false;
        
        for (let i = 0; i < Math.max(v1parts.length, v2parts.length); ++i) {
            const v1 = v1parts[i] || 0;
            const v2 = v2parts[i] || 0;
            if (v1 > v2) { isNewer = true; break; }
            if (v1 < v2) { break; }
        }
        
        if (isNewer) {
          const dot = document.getElementById('update-pulse-indicator');
          if (dot) dot.style.display = 'inline-block';

          statusDiv.style.color = '#28a745';
          statusDiv.innerHTML = `<span class="material-symbols-outlined" style="vertical-align: middle; font-size: 16px; margin-right: 4px;">new_releases</span> <strong>${t('ui.update.newVersionAvailable') || 'Nueva versión disponible:'} ${latestTagStr}</strong>`;
          
          const isWindows = navigator.userAgent.toLowerCase().indexOf('win') > -1;
          const isLinux = navigator.userAgent.toLowerCase().indexOf('linux') > -1;
          
          let targetAsset = null;
          if (result.assets && result.assets.length > 0) {
            if (isWindows) {
              targetAsset = result.assets.find(a => a.name.toLowerCase().endsWith('.exe'));
            } else if (isLinux) {
              targetAsset = result.assets.find(a => a.name.toLowerCase().endsWith('.appimage'));
            }
          }
          
          if (targetAsset) {
            currentDownloadUrl = targetAsset.url;
            currentDownloadName = targetAsset.name;
            downloadBtn.style.display = 'inline-flex';
          } else {
            statusDiv.innerHTML += `<br>${t('ui.update.noDownloads') || 'No se encontraron descargas compatibles para tu sistema operativo.'}`;
          }
        } else {
          statusDiv.style.color = 'var(--on-surface-variant)';
          statusDiv.innerHTML = `<span class="material-symbols-outlined" style="vertical-align: middle; font-size: 16px; margin-right: 4px;">check_circle</span> ${t('ui.messages.usingLatestVersion') || 'Estás usando la última versión disponible'}`;
        }
      } else {
        statusDiv.style.color = '#dc3545';
        statusDiv.textContent = `${t('ui.update.updateError') || 'Error:'} ${result.error}`;
      }
    } catch (err) {
      statusDiv.style.color = '#dc3545';
      statusDiv.textContent = `${t('ui.update.updateError') || 'Error:'} ${err.message}`;
    } finally {
      checkBtn.disabled = false;
    }
  });

  document.getElementById('download-github-update-btn')?.addEventListener('click', async () => {
    const downloadBtn = document.getElementById('download-github-update-btn');
    const restartBtn = document.getElementById('restart-app-btn');
    const statusDiv = document.getElementById('github-update-status');
    
    downloadBtn.disabled = true;
    statusDiv.style.color = 'var(--on-surface-variant)';
    statusDiv.innerHTML = `<span class="material-symbols-outlined animate-spin" style="vertical-align: middle; font-size: 16px; margin-right: 4px;">downloading</span> ${t('ui.update.downloadingUpdate') || 'Descargando actualización...'}`;
    
    try {
      const result = await ipcRenderer.invoke('download-github-update', { url: currentDownloadUrl, name: currentDownloadName });
      if (result.success) {
        statusDiv.style.color = '#28a745';
        statusDiv.innerHTML = `
          <span class="material-symbols-outlined" style="vertical-align: middle; font-size: 16px; margin-right: 4px;">download_done</span> 
          <strong>${t('ui.update.updateDownloadedSuccess') || 'Actualización descargada con éxito'}</strong><br>
          <small style="color: var(--on-surface-variant); word-break: break-all;">${result.filePath}</small><br><br>
          <span style="color: var(--on-surface); font-weight: 500;">${t('ui.messages.updateRestartPrompt') || 'Haz clic para reiniciar la aplicación con la nueva versión.'}</span>
        `;
        
        const checkBtn = document.getElementById('check-github-update-btn');
        if (checkBtn) checkBtn.disabled = true;
        
        downloadBtn.style.display = 'none';
        if (restartBtn) {
          restartBtn.style.display = 'inline-flex';
          restartBtn.onclick = () => {
            ipcRenderer.invoke('restart-app', result.filePath);
          };
        }
      } else if (result.canceled) {
        statusDiv.innerHTML = `<span class="material-symbols-outlined" style="vertical-align: middle; font-size: 16px; margin-right: 4px;">cancel</span> Descarga cancelada.`;
        downloadBtn.disabled = false;
      } else {
        statusDiv.style.color = '#dc3545';
        statusDiv.textContent = `${t('ui.update.updateError') || 'Error:'} ${result.error}`;
        downloadBtn.disabled = false;
      }
    } catch (err) {
      statusDiv.style.color = '#dc3545';
      statusDiv.textContent = `${t('ui.update.updateError') || 'Error:'} ${err.message}`;
      downloadBtn.disabled = false;
    }
  });
  
  document.getElementById('auto-updates-enabled')?.addEventListener('change', async (e) => {
    await saveUpdateSettings();
  });
  
  document.getElementById('check-updates-startup')?.addEventListener('change', async (e) => {
    await saveUpdateSettings();
  });
  
  // Cargar configuración de actualizaciones
  loadUpdateSettings();
  
  // Función para actualizar la imagen de perfil
  function updateProfileImage() {
    globalUpdateProfileImage();
  }
  
  // Event listeners para imagen de perfil
  // Clic en la imagen de vista previa para seleccionar nueva imagen
  document.getElementById('profile-image-preview')?.addEventListener('click', (e) => {
    document.getElementById('profile-image-input').click();
  });
  
  // Función para eliminar foto de perfil
  const handleRemoveModalProfilePhoto = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (config.theme && config.theme.profileImage) {
      delete config.theme.profileImage;
      saveConfig();
      globalUpdateProfileImage();
    }
  };

  // Clic en el texto fijo "Eliminar foto"
  document.getElementById('profile-remove-hover-text')?.addEventListener('click', handleRemoveModalProfilePhoto);
  document.getElementById('profile-remove-btn')?.addEventListener('click', handleRemoveModalProfilePhoto);
  
  document.getElementById('profile-image-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        config.theme = config.theme || {};
        config.theme.profileImage = e.target.result;
        saveConfig();
        globalUpdateProfileImage();
      };
      reader.readAsDataURL(file);
    }
  });
  
  // Inicializar imagen de perfil
  setTimeout(() => globalUpdateProfileImage(), 150);
  
  // Event listener para configuración de tooltips
  document.getElementById('show-tooltips')?.addEventListener('change', (e) => {
    config.ui = config.ui || {};
    config.ui.showTooltips = e.target.checked;
    saveConfig();
    
    // Actualizar tooltips inmediatamente
    setTimeout(() => {
      // Buscar y ejecutar la función updateTooltipListeners si existe
      if (typeof updateTooltipListeners === 'function') {
        updateTooltipListeners();
      } else {
        // Si no está disponible globalmente, disparar un evento personalizado
        document.dispatchEvent(new CustomEvent('tooltipConfigChanged'));
      }
    }, 100);
  });
  
  // Cargar configuración de tooltips
  function loadTooltipConfig() {
    const showTooltipsCheckbox = document.getElementById('show-tooltips');
    if (showTooltipsCheckbox && config.ui && typeof config.ui.showTooltips === 'boolean') {
      showTooltipsCheckbox.checked = config.ui.showTooltips;
    } else {
      // Por defecto, los tooltips están habilitados
      if (showTooltipsCheckbox) showTooltipsCheckbox.checked = true;
    }
  }
  
  // Cargar configuración de tooltips
  loadTooltipConfig();
  
  // Cargar y configurar selector de idioma
  async function loadLanguageSelector() {
    try {
      // Cargar idiomas disponibles
      await loadAvailableLanguages();
      
      // Actualizar el select con los idiomas disponibles
      const languageSelect = document.getElementById('language-select');
      if (languageSelect) {
        // Limpiar opciones existentes
        languageSelect.innerHTML = '';
        
        // Agregar todos los idiomas encontrados dinámicamente
        availableLanguages.forEach(lang => {
          const option = document.createElement('option');
          option.value = lang.languageName; // Usar el nombre del idioma como valor
          option.textContent = lang.displayName; // Mostrar el nombre del idioma
          
          // Seleccionar el idioma actual (comparar con el nombre guardado en config)
          if (config.ui?.language === lang.languageName) {
            option.selected = true;
          }
          
          languageSelect.appendChild(option);
        });
        
        // Si no hay idioma seleccionado, seleccionar el primero disponible
        if (languageSelect.selectedIndex === -1 && availableLanguages.length > 0) {
          languageSelect.selectedIndex = 0;
        }
        
        // Event listener para cambio de idioma
        languageSelect.addEventListener('change', async (e) => {
          const selectedLanguageName = e.target.value;
          await loadLanguage(selectedLanguageName);
        });
      }
    } catch (error) {
      console.error('Error loading language selector:', error);
    }
  }
  
  // Cargar selector de idioma
  loadLanguageSelector();

  // Event listeners para gestión de configuración
  document.getElementById('backup-config-btn')?.addEventListener('click', async () => {
    try {
      const result = await ipcRenderer.invoke('backup-config');
      if (result.success) {
        alert(`${t('ui.messages.backupSuccess')}\n${result.backupPath}`);
      } else {
        alert(`${t('ui.messages.backupError')} ${result.error}`);
      }
    } catch (error) {
      alert(`${t('ui.messages.error')} ${error.message}`);
    }
  });
  
  document.getElementById('export-config-btn')?.addEventListener('click', async () => {
    try {
      const result = await ipcRenderer.invoke('export-config');
      if (result.success) {
        alert(`${t('ui.messages.exportSuccess')}\n${result.path}`);
      } else {
        alert(`${t('ui.messages.exportError')} ${result.error}`);
      }
    } catch (error) {
      alert(`${t('ui.messages.error')} ${error.message}`);
    }
  });
  
  document.getElementById('import-config-btn')?.addEventListener('click', async () => {
    try {
      const confirm = window.confirm(t('ui.messages.confirmReplace'));
      if (!confirm) return;
      
      const result = await ipcRenderer.invoke('import-config');
      if (result.success) {
        alert(`${t('ui.messages.importSuccess')}\n${result.path}\n\n${t('ui.messages.appWillReload')}`);
        location.reload();
      } else {
        alert(`${t('ui.messages.importError')} ${result.error}`);
      }
    } catch (error) {
      alert(`${t('ui.messages.error')} ${error.message}`);
    }
  });
  
  // Event listener para enlace de donación PayPal
  document.getElementById('paypal-donation-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    const { shell } = require('electron');
    shell.openExternal('https://paypal.me/gessendarien');
  });
  
  // Cargar información de la aplicación
  ipcRenderer.invoke('get-app-info').then(appInfo => {
    const configPathElement = document.getElementById('config-path');
    if (configPathElement) {
      configPathElement.textContent = appInfo.configPath;
      configPathElement.title = `Versión: ${appInfo.version}\nRuta de datos: ${appInfo.userDataPath}`;
    }
    
    // Actualizar la versión actual en la sección de actualización
    const versionElement = document.querySelector('.current-version strong');
    if (versionElement) {
      versionElement.textContent = `${appInfo.version}`;
    }
  }).catch(console.error);
}

// Variables globales para música de fondo
let backgroundAudio = null;
let targetVolume = 0.3; // Volumen objetivo
let fadeInterval = null;
let isPlaying = false; // Estado de reproducción

// Funciones para manejar música de fondo
function playBackgroundMusic(audioPath) {
  try {
    // Detener música anterior si existe
    stopBackgroundMusic();
    
    // Crear nuevo elemento de audio
    backgroundAudio = new Audio();
    backgroundAudio.src = `file:///${audioPath.replace(/\\/g, '/')}`;
    backgroundAudio.loop = true;
    backgroundAudio.volume = 0; // Siempre iniciar con volumen 0
    
    // Reproducir
    backgroundAudio.play().then(() => {
      isPlaying = true;
      updatePlayStopButton();
      
      // Si la ventana tiene el foco, hacer fade in
      if (document.hasFocus()) {
        fadeInAudio();
      }
    }).catch(error => {
      console.error('Error playing background music:', error);
    });
  } catch (error) {
    console.error('Error setting up background music:', error);
  }
}

function stopBackgroundMusic() {
  if (fadeInterval) {
    clearInterval(fadeInterval);
    fadeInterval = null;
  }
  
  if (backgroundAudio) {
    backgroundAudio.pause();
    backgroundAudio.currentTime = 0;
    backgroundAudio = null;
  }
  
  isPlaying = false;
  updatePlayStopButton();
}

function pauseBackgroundMusic() {
  if (backgroundAudio && !backgroundAudio.paused) {
    backgroundAudio.pause();
    isPlaying = false;
    updatePlayStopButton();
  }
}

function resumeBackgroundMusic() {
  if (backgroundAudio && backgroundAudio.paused) {
    backgroundAudio.play().then(() => {
      isPlaying = true;
      updatePlayStopButton();
      
      // Si la ventana tiene el foco, hacer fade in
      if (document.hasFocus()) {
        fadeInAudio();
      }
    }).catch(error => {
      console.error('Error resuming background music:', error);
    });
  }
}

function updatePlayStopButton() {
  const playStopBtn = document.getElementById('play-stop-audio-btn');
  if (playStopBtn) {
    if (isPlaying) {
      playStopBtn.textContent = '⏸ Stop';
      playStopBtn.title = t('ui.messages.pauseMusic');
    } else {
      playStopBtn.textContent = '▶ Play';
      playStopBtn.title = t('ui.messages.playMusic');
    }
  }
}

// Función para hacer fade in del audio
function fadeInAudio() {
  if (!backgroundAudio) return;
  
  // Limpiar cualquier fade anterior
  if (fadeInterval) {
    clearInterval(fadeInterval);
  }
  
  const fadeStep = 0.02; // Incremento por paso
  const fadeTime = 50; // ms entre pasos
  
  fadeInterval = setInterval(() => {
    if (backgroundAudio.volume < targetVolume) {
      backgroundAudio.volume = Math.min(backgroundAudio.volume + fadeStep, targetVolume);
    } else {
      clearInterval(fadeInterval);
      fadeInterval = null;
    }
  }, fadeTime);
}

// Función para hacer fade out del audio
function fadeOutAudio() {
  if (!backgroundAudio) return;
  
  // Limpiar cualquier fade anterior
  if (fadeInterval) {
    clearInterval(fadeInterval);
  }
  
  const fadeStep = 0.02; // Decremento por paso
  const fadeTime = 50; // ms entre pasos
  
  fadeInterval = setInterval(() => {
    if (backgroundAudio.volume > 0) {
      backgroundAudio.volume = Math.max(backgroundAudio.volume - fadeStep, 0);
    } else {
      clearInterval(fadeInterval);
      fadeInterval = null;
    }
  }, fadeTime);
}

// Cargar música de fondo al iniciar si está configurada
function loadBackgroundMusic() {
  if (config.audio && config.audio.backgroundMusic) {
    playBackgroundMusic(config.audio.backgroundMusic);
    
    // Actualizar UI si el modal está abierto
    const backgroundMusicInput = document.getElementById('background-music');
    const clearAudioBtn = document.getElementById('clear-audio-btn');
    const playStopBtn = document.getElementById('play-stop-audio-btn');
    
    if (backgroundMusicInput) {
      backgroundMusicInput.value = config.audio.backgroundMusic;
    }
    if (clearAudioBtn) {
      clearAudioBtn.style.display = 'inline-block';
    }
    if (playStopBtn) {
      playStopBtn.style.display = 'inline-block';
    }
  }
}

// Variables globales para drag and drop
let draggedTab = null;
let draggedIndex = null;

// Funciones para manejar drag and drop de pestañas
function handleDragStart(e) {
  draggedTab = this;
  const tabsContainer = this.parentElement;
  draggedIndex = Array.from(tabsContainer.children).indexOf(this); // Sin -1 porque el menú está separado
  this.classList.add('dragging');
  
  // Configurar el efecto visual del drag
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.outerHTML);
  
  // Hacer la pestaña semi-transparente mientras se arrastra
  setTimeout(() => {
    this.style.opacity = '0.5';
  }, 0);
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  this.style.opacity = '';
  
  // Limpiar todas las clases de hover
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('drag-over');
  });
  
  draggedTab = null;
  draggedIndex = null;
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault(); // Permite el drop
  }
  
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) {
  if (this !== draggedTab) {
    this.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation(); // Evita redirecciones
  }
  
  if (draggedTab !== this) {
    const tabsContainer = this.parentElement;
    const targetIndex = Array.from(tabsContainer.children).indexOf(this); // Sin -1 porque el menú está separado
    
    // Reordenar el array de emuladores
    const draggedEmulator = config.emulators[draggedIndex];
    
    // Remover el emulador de su posición original
    config.emulators.splice(draggedIndex, 1);
    
    // Insertar en la nueva posición
    config.emulators.splice(targetIndex, 0, draggedEmulator);
    
    // Guardar la configuración actualizada
    saveConfig();
    
    // Re-renderizar las pestañas
    renderTabs();
  }
  
  this.classList.remove('drag-over');
  return false;
}

// Funciones para el sistema de actualizaciones
async function loadUpdateSettings() {
  try {
    const settings = await ipcRenderer.invoke('get-update-settings');
    
    const autoUpdatesCheckbox = document.getElementById('auto-updates-enabled');
    const checkStartupCheckbox = document.getElementById('check-updates-startup');
    
    if (autoUpdatesCheckbox) {
      autoUpdatesCheckbox.checked = settings.autoUpdatesEnabled;
    }
    
    if (checkStartupCheckbox) {
      checkStartupCheckbox.checked = settings.checkOnStartup;
    }
  } catch (error) {
    console.error('Error loading update settings:', error);
  }
}

async function saveUpdateSettings() {
  try {
    const autoUpdatesEnabled = document.getElementById('auto-updates-enabled')?.checked || false;
    const checkOnStartup = document.getElementById('check-updates-startup')?.checked || false;
    
    const settings = {
      autoUpdatesEnabled,
      checkOnStartup
    };
    
    await ipcRenderer.invoke('save-update-settings', settings);
  } catch (error) {
    console.error('Error saving update settings:', error);
  }
}

// Listeners para eventos del auto-updater
if (typeof ipcRenderer !== 'undefined') {
  ipcRenderer.on('update-status', (event, status) => {
    const statusText = document.getElementById('update-status-text');
    if (statusText) {
      statusText.textContent = status === 'checking' ? 'Verificando actualizaciones...' : 'Listo para verificar';
    }
  });
  
  ipcRenderer.on('update-available', (event, info) => {
    const statusText = document.getElementById('update-status-text');
    const downloadBtn = document.getElementById('download-update-btn');
    
    if (statusText) {
      statusText.textContent = `Nueva versión disponible: ${info.version}`;
    }
    
    if (downloadBtn) {
      downloadBtn.style.display = 'inline-block';
    }
  });
  
  ipcRenderer.on('update-not-available', () => {
    const statusText = document.getElementById('update-status-text');
    if (statusText) {
      statusText.textContent = t('ui.messages.usingLatestVersion');
    }
  });
  
  ipcRenderer.on('update-error', (event, error) => {
    const statusText = document.getElementById('update-status-text');
    if (statusText) {
      statusText.textContent = `Error: ${error}`;
    }
  });
  
  ipcRenderer.on('download-progress', (event, progressObj) => {
    const progressBar = document.getElementById('update-progress');
    const progressFill = progressBar?.querySelector('.progress-fill');
    const progressText = progressBar?.querySelector('.progress-text');
    
    if (progressFill && progressText) {
      const percent = Math.round(progressObj.percent);
      progressFill.style.width = `${percent}%`;
      progressText.textContent = `${percent}%`;
    }
  });
  
  ipcRenderer.on('update-downloaded', () => {
    const statusText = document.getElementById('update-status-text');
    const installBtn = document.getElementById('install-update-btn');
    const progressBar = document.getElementById('update-progress');
    
    if (statusText) {
      statusText.textContent = t('ui.messages.updateDownloaded');
    }
    
    if (installBtn) {
      installBtn.style.display = 'inline-block';
    }
    
    if (progressBar) {
      progressBar.style.display = 'none';
    }
  });
  
  // Listener para actualización completada
  ipcRenderer.on('update-completed', (event, updateInfo) => {
    showUpdateNotification(t('ui.messages.updateSuccessful'), 
      t('ui.messages.updateSuccessfulMessage').replace('{from}', updateInfo.from).replace('{to}', updateInfo.to), 
      'success');
  });
  
  // Listener para primera instalación
  ipcRenderer.on('first-install-welcome', (event, version) => {
    showUpdateNotification(t('ui.messages.welcomeTitle'), 
      t('ui.messages.welcomeMessage').replace('{version}', version), 
      'info');
  });
}

// Función para mostrar notificaciones de actualización
function showUpdateNotification(title, message, type = 'info') {
  // Crear elemento de notificación
  const notification = document.createElement('div');
  notification.className = `update-notification ${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <h4>${title}</h4>
      <p>${message}</p>
      <button onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;
  
  // Agregar estilos si no existen
  if (!document.getElementById('notification-styles')) {
    const styles = document.createElement('style');
    styles.id = 'notification-styles';
    styles.textContent = `
      .update-notification {
        position: fixed;
        top: 20px;
        left: 0;
        background: #2a2a2a;
        border-radius: 0 8px 8px 0;
        padding: 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 9999;
        max-width: 400px;
        border-left: 4px solid var(--header-color, #db2424);
        animation: slideIn 0.3s ease;
      }
      
      .update-notification.success {
        border-left-color: #28a745;
      }
      
      .notification-content h4 {
        margin: 0 0 8px 0;
        color: #ffffff;
        font-size: 16px;
      }
      
      .notification-content p {
        margin: 0;
        color: #cccccc;
        font-size: 14px;
        line-height: 1.4;
      }
      
      .notification-content button {
        position: absolute;
        top: 8px;
        right: 12px;
        background: none;
        border: none;
        color: #999;
        font-size: 18px;
        cursor: pointer;
        width: 24px;
        height: 24px;
      }
      
      .notification-content button:hover {
        color: #fff;
      }
      
      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(styles);
  }
  
  // Agregar notificación al DOM
  document.body.appendChild(notification);
  
  // Auto-remover después de 8 segundos
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 8000);
}

// Tooltip simple que sigue el mouse
document.addEventListener('DOMContentLoaded', function() {
  let tooltip = null;
  let showTimer = null;
  
  // Crear tooltip
  function createTooltip() {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'game-tooltip';
      document.body.appendChild(tooltip);
    }
    return tooltip;
  }
  
  // Actualizar listeners
  function updateTooltipListeners() {
    document.querySelectorAll('.game-card').forEach(card => {
      // Remover listeners existentes
      card.onmouseenter = null;
      card.onmouseleave = null;
      card.onmousemove = null;
      
      // Solo agregar listeners si los tooltips están habilitados
      if (config.ui && config.ui.showTooltips !== false) {
        // Agregar nuevos listeners
        card.onmouseenter = function(e) {
          const title = this.getAttribute('data-title');
          if (!title) return;
          
          const tip = createTooltip();
          tip.textContent = title;
          
          // Limpiar timer anterior
          clearTimeout(showTimer);
          
          // Mostrar después de 1.5 segundos
          showTimer = setTimeout(() => {
            tip.classList.add('visible');
          }, 1500);
          
          // Posicionar inmediatamente
          updatePosition(e);
        };
        
        card.onmouseleave = function() {
          clearTimeout(showTimer);
          const tip = createTooltip();
          tip.classList.remove('visible');
        };
        
        card.onmousemove = function(e) {
          updatePosition(e);
        };
      }
    });
  }
  
  function updatePosition(e) {
    const tip = createTooltip();
    tip.style.left = (e.clientX + 15) + 'px';
    tip.style.top = (e.clientY - 30) + 'px';
  }
  
  // Inicializar
  updateTooltipListeners();
  
  // Escuchar cambios en la configuración de tooltips
  document.addEventListener('tooltipConfigChanged', () => {
    updateTooltipListeners();
  });
  
  // Observar cambios en el DOM
  const observer = new MutationObserver(() => {
    setTimeout(updateTooltipListeners, 100);
  });
  
  const content = document.getElementById('emulator-content');
  if (content) {
    observer.observe(content, { childList: true, subtree: true });
  }
});
