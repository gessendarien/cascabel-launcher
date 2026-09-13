const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// Rutas de almacenamiento y caché independientes de Cascabel Launcher
// ---------------------------------------------------------------------------
function getLauncherDataDir() {
  const appName = 'cascabel-launcher';
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName);
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName);
  } else {
    // Linux / Unix: XDG_CONFIG_HOME o ~/.config
    const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    return path.join(configHome, appName);
  }
}

const BASE_DIR = path.join(getLauncherDataDir(), 'covers-cache');
const COVERS_DIR = path.join(BASE_DIR, 'images');
const REGISTRY_PATH = path.join(BASE_DIR, 'registry.json');

const RAW_BASE = 'https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Boxarts/';
const API_TREE = 'https://api.github.com/repos/libretro-thumbnails/{repo}/git/trees/master?recursive=1';
const UA_HEADERS = { 'User-Agent': 'Cascabel-Launcher' };

// ---------------------------------------------------------------------------
// Mapeo de consolas/íconos a repositorios de libretro-thumbnails
// ---------------------------------------------------------------------------
const CONSOLE_TO_REPO = {
  'nes': 'Nintendo_-_Nintendo_Entertainment_System',
  'snes': 'Nintendo_-_Super_Nintendo_Entertainment_System',
  'n64': 'Nintendo_-_Nintendo_64',
  'gamecube': 'Nintendo_-_GameCube',
  'wii': 'Nintendo_-_Wii',
  'wiiu': 'Nintendo_-_Wii_U',
  'ps1': 'Sony_-_PlayStation',
  'ps2': 'Sony_-_PlayStation_2',
  'psp': 'Sony_-_PlayStation_Portable',
  'xbox': 'Microsoft_-_Xbox',
  'xbox360': 'Microsoft_-_Xbox_360',
  'dreamcast': 'Sega_-_Dreamcast',
  'genesis': 'Sega_-_Mega_Drive_-_Genesis',
  'gameboy': 'Nintendo_-_Game_Boy',
  'gbc': 'Nintendo_-_Game_Boy_Color',
  'gba': 'Nintendo_-_Game_Boy_Advance',
  'ds': 'Nintendo_-_Nintendo_DS',
  '3ds': 'Nintendo_-_Nintendo_3DS',
  'mame': 'MAME'
};

// ---------------------------------------------------------------------------
// Extensiones soportadas -> repositorios (idéntico a cascabel-covers.py)
// ---------------------------------------------------------------------------
const SYSTEMS = {
  '.nes': [{ repo: 'Nintendo_-_Nintendo_Entertainment_System', label: 'NES' }],
  '.sfc': [{ repo: 'Nintendo_-_Super_Nintendo_Entertainment_System', label: 'SNES' }],
  '.smc': [{ repo: 'Nintendo_-_Super_Nintendo_Entertainment_System', label: 'SNES' }],
  '.n64': [{ repo: 'Nintendo_-_Nintendo_64', label: 'N64' }],
  '.z64': [{ repo: 'Nintendo_-_Nintendo_64', label: 'N64' }],
  '.v64': [{ repo: 'Nintendo_-_Nintendo_64', label: 'N64' }],
  '.gcm': [{ repo: 'Nintendo_-_GameCube', label: 'GameCube' }],
  '.rvz': [{ repo: 'Nintendo_-_GameCube', label: 'GameCube' }, { repo: 'Nintendo_-_Wii', label: 'Wii' }],
  '.ciso': [{ repo: 'Nintendo_-_GameCube', label: 'GameCube' }],
  '.wbfs': [{ repo: 'Nintendo_-_Wii', label: 'Wii' }],
  '.wia': [{ repo: 'Nintendo_-_Wii', label: 'Wii' }],
  '.wud': [{ repo: 'Nintendo_-_Wii_U', label: 'Wii U' }],
  '.wux': [{ repo: 'Nintendo_-_Wii_U', label: 'Wii U' }],
  '.rpx': [{ repo: 'Nintendo_-_Wii_U', label: 'Wii U' }],
  '.cue': [{ repo: 'Sony_-_PlayStation', label: 'PS1' }, { repo: 'Sega_-_Saturn', label: 'Saturn' }],
  '.pbp': [{ repo: 'Sony_-_PlayStation', label: 'PS1' }, { repo: 'Sony_-_PlayStation_Portable', label: 'PSP' }],
  '.cso': [{ repo: 'Sony_-_PlayStation_Portable', label: 'PSP' }, { repo: 'Sony_-_PlayStation_2', label: 'PS2' }],
  '.bin': [{ repo: 'Sony_-_PlayStation', label: 'PS1' }, { repo: 'Sony_-_PlayStation_2', label: 'PS2' }],
  '.xbe': [{ repo: 'Microsoft_-_Xbox', label: 'Xbox' }],
  '.xex': [{ repo: 'Microsoft_-_Xbox_360', label: 'Xbox 360' }],
  '.cdi': [{ repo: 'Sega_-_Dreamcast', label: 'Dreamcast' }],
  '.gdi': [{ repo: 'Sega_-_Dreamcast', label: 'Dreamcast' }],
  '.gb': [{ repo: 'Nintendo_-_Game_Boy', label: 'GB' }],
  '.gbc': [{ repo: 'Nintendo_-_Game_Boy_Color', label: 'GBC' }],
  '.gba': [{ repo: 'Nintendo_-_Game_Boy_Advance', label: 'GBA' }],
  '.nds': [{ repo: 'Nintendo_-_Nintendo_DS', label: 'DS' }],
  '.3ds': [{ repo: 'Nintendo_-_Nintendo_3DS', label: '3DS' }],
  '.cia': [{ repo: 'Nintendo_-_Nintendo_3DS', label: '3DS' }],
  '.cci': [{ repo: 'Nintendo_-_Nintendo_3DS', label: '3DS' }],
  '.iso': [
    { repo: 'Sony_-_PlayStation_2', label: 'PS2' },
    { repo: 'Sony_-_PlayStation_Portable', label: 'PSP' },
    { repo: 'Nintendo_-_Wii', label: 'Wii' },
    { repo: 'Nintendo_-_GameCube', label: 'GameCube' },
    { repo: 'Sony_-_PlayStation', label: 'PS1' },
    { repo: 'Microsoft_-_Xbox', label: 'Xbox' },
    { repo: 'Microsoft_-_Xbox_360', label: 'Xbox 360' }
  ],
  '.chd': [
    { repo: 'Sony_-_PlayStation_2', label: 'PS2' },
    { repo: 'Sony_-_PlayStation', label: 'PS1' },
    { repo: 'Sega_-_Dreamcast', label: 'Dreamcast' }
  ],
  '.zip': [
    { repo: 'MAME', label: 'MAME' },
    { repo: 'Nintendo_-_Nintendo_Entertainment_System', label: 'NES' },
    { repo: 'Nintendo_-_Super_Nintendo_Entertainment_System', label: 'SNES' },
    { repo: 'Nintendo_-_Nintendo_64', label: 'N64' },
    { repo: 'Nintendo_-_Game_Boy', label: 'GB' },
    { repo: 'Nintendo_-_Game_Boy_Color', label: 'GBC' },
    { repo: 'Nintendo_-_Game_Boy_Advance', label: 'GBA' },
    { repo: 'Sega_-_Mega_Drive_-_Genesis', label: 'Genesis' }
  ],
  '.7z': [{ repo: 'MAME', label: 'MAME' }]
};

// ---------------------------------------------------------------------------
// Registro persistente (registry.json con caché en memoria)
// ---------------------------------------------------------------------------
let memoryRegistry = null;
let lastRegistryLoad = 0;

function loadRegistry(forceReload = false) {
  if (!forceReload && memoryRegistry && (Date.now() - lastRegistryLoad < 15000)) {
    return memoryRegistry;
  }
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      memoryRegistry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
      lastRegistryLoad = Date.now();
      return memoryRegistry;
    }
  } catch (e) {
    console.error('Error cargando registry.json:', e);
  }
  memoryRegistry = {};
  lastRegistryLoad = Date.now();
  return memoryRegistry;
}

function saveRegistry(reg) {
  memoryRegistry = reg;
  lastRegistryLoad = Date.now();
  try {
    if (!fs.existsSync(BASE_DIR)) {
      fs.mkdirSync(BASE_DIR, { recursive: true });
    }
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2), 'utf8');
  } catch (e) {
    console.error('Error guardando registry.json:', e);
  }
}

// ---------------------------------------------------------------------------
// Helpers HTTP para solicitudes GET y descargas con redirecciones
// ---------------------------------------------------------------------------
function fetchUrl(targetUrl, headers = UA_HEADERS, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Demasiadas redirecciones HTTP'));
    }
    const urlObj = new URL(targetUrl);
    const client = urlObj.protocol === 'https:' ? https : http;
    const req = client.get(targetUrl, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, targetUrl).href;
        }
        res.resume();
        return fetchUrl(redirectUrl, headers, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} al consultar ${targetUrl}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error('Timeout al consultar ' + targetUrl));
    });
  });
}

// ---------------------------------------------------------------------------
// Obtención del índice de títulos por repositorio (caché de 30 días)
// ---------------------------------------------------------------------------
const memoryIndexCache = {};

async function getIndex(repo) {
  if (memoryIndexCache[repo]) {
    return memoryIndexCache[repo];
  }

  const cacheFile = path.join(COVERS_DIR, `index_${repo}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      const stats = fs.statSync(cacheFile);
      const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 3600 * 24);
      if (ageInDays < 30) {
        const titles = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        memoryIndexCache[repo] = titles;
        return titles;
      }
    } catch (e) {
      console.error(`Error leyendo caché de índice ${repo}:`, e);
    }
  }

  const url = API_TREE.replace('{repo}', repo);
  const dataBuf = await fetchUrl(url, UA_HEADERS);
  const data = JSON.parse(dataBuf.toString('utf8'));

  const titles = [];
  const prefix = 'Named_Boxarts/';
  for (const item of (data.tree || [])) {
    const itemPath = item.path || '';
    if (itemPath.startsWith(prefix) && itemPath.endsWith('.png')) {
      titles.push(itemPath.substring(prefix.length, itemPath.length - 4));
    }
  }

  try {
    if (!fs.existsSync(COVERS_DIR)) {
      fs.mkdirSync(COVERS_DIR, { recursive: true });
    }
    fs.writeFileSync(cacheFile, JSON.stringify(titles), 'utf8');
  } catch (e) {
    console.error(`Error guardando caché de índice ${repo}:`, e);
  }

  memoryIndexCache[repo] = titles;
  return titles;
}

// ---------------------------------------------------------------------------
// Normalización, extracción de etiquetas y algoritmo de similitud
// (Fiel réplica del algoritmo de cascabel-covers.py)
// ---------------------------------------------------------------------------
function _normalize(s) {
  return s
    .toLowerCase()
    .replace(/[\(\[].*?[\)\]]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractTags(s) {
  const matches = s.match(/[\(\[](.*?)[\)\]]/g) || [];
  const res = new Set();
  for (const raw of matches) {
    const t = raw.slice(1, -1).trim().toLowerCase();
    if (t === 'u') res.add('usa');
    else if (t === 'e') res.add('europe');
    else if (t === 'j' || t === 'jp') res.add('japan');
    else res.add(t);
  }
  return res;
}

// Ratcliff-Obershelp / Gestalt similarity matching (idéntico a Python difflib.SequenceMatcher)
function similarityRatio(s1, s2) {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  function findLongestMatch(str1, str2) {
    let bestI = 0, bestJ = 0, bestLen = 0;
    for (let i = 0; i < str1.length; i++) {
      for (let j = 0; j < str2.length; j++) {
        let len = 0;
        while (i + len < str1.length && j + len < str2.length && str1[i + len] === str2[j + len]) {
          len++;
        }
        if (len > bestLen) {
          bestLen = len;
          bestI = i;
          bestJ = j;
        }
      }
    }
    return { i: bestI, j: bestJ, size: bestLen };
  }

  function getMatches(str1, str2) {
    const match = findLongestMatch(str1, str2);
    if (match.size === 0) return 0;
    let total = match.size;
    if (match.i > 0 && match.j > 0) {
      total += getMatches(str1.substring(0, match.i), str2.substring(0, match.j));
    }
    const right1 = str1.substring(match.i + match.size);
    const right2 = str2.substring(match.j + match.size);
    if (right1.length > 0 && right2.length > 0) {
      total += getMatches(right1, right2);
    }
    return total;
  }

  const matches = getMatches(s1, s2);
  return (2.0 * matches) / (s1.length + s2.length);
}

function findBestMatch(romTitle, titles) {
  const romNorm = _normalize(romTitle);
  const romTags = extractTags(romTitle);

  let best = null;
  let bestScore = 0.0;

  for (const t of titles) {
    const tNorm = _normalize(t);

    let baseScore = 0.0;
    if (romNorm === tNorm) {
      baseScore = 1.0;
    } else if (tNorm.includes(romNorm)) {
      baseScore = 0.85 + 0.15 * (romNorm.length / tNorm.length);
    } else if (romNorm.includes(tNorm)) {
      baseScore = 0.85 + 0.15 * (tNorm.length / romNorm.length);
    } else {
      const len1 = romNorm.length;
      const len2 = tNorm.length;
      const minLen = len1 < len2 ? len1 : len2;
      const maxLen = len1 > len2 ? len1 : len2;
      if (maxLen > 0 && minLen / maxLen < 0.48) {
        continue;
      }
      baseScore = similarityRatio(romNorm, tNorm);
    }

    if (baseScore < 0.65) {
      continue;
    }

    const tTags = extractTags(t);
    let tagScore = 0.0;

    if (romTags.size > 0) {
      let overlap = 0;
      for (const tag of romTags) {
        if (tTags.has(tag)) overlap++;
      }
      let diff = 0;
      for (const tag of tTags) {
        if (!romTags.has(tag)) diff++;
      }
      tagScore += overlap * 0.1;
      tagScore -= diff * 0.01;
    } else {
      let hasUsa = false;
      let hasJapan = false;
      for (const tag of tTags) {
        if (tag.includes('usa')) hasUsa = true;
        if (tag.includes('japan')) hasJapan = true;
      }
      if (hasUsa) {
        tagScore += 0.05;
      } else if (hasJapan) {
        tagScore += 0.02;
      }
      tagScore -= tTags.size * 0.01;
    }

    const score = baseScore + tagScore;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  if (bestScore >= 0.65) {
    return { title: best, score: bestScore };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Descarga de carátula y resolución recursiva de symlinks de GitHub Raw
// ---------------------------------------------------------------------------
async function downloadCover(repo, title) {
  const localDir = path.join(COVERS_DIR, repo);
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }

  const safeName = title.replace(/\//g, '_') + '.png';
  const localPath = path.join(localDir, safeName);

  if (fs.existsSync(localPath)) {
    try {
      const stats = fs.statSync(localPath);
      if (stats.size > 300) {
        return localPath;
      }
    } catch (e) {}
  }

  async function fetchCoverRecursive(currentTitle, savePath, depth = 0) {
    if (depth > 3) throw new Error('Demasiados symlinks recursivos');

    const url = RAW_BASE.replace('{repo}', repo) + encodeURIComponent(currentTitle + '.png');
    const data = await fetchUrl(url, UA_HEADERS);

    // Los symlinks raw de GitHub son archivos de texto plano que terminan en .png
    if (data.length < 300 && data.toString('utf8').trim().endsWith('.png')) {
      const target = data.toString('utf8').trim().slice(0, -4);
      return fetchCoverRecursive(target, savePath, depth + 1);
    }

    fs.writeFileSync(savePath, data);
    return savePath;
  }

  return fetchCoverRecursive(title, localPath);
}

// ---------------------------------------------------------------------------
// Obtención de repositorios candidatos para una ROM
// Da prioridad a la consola seleccionada en el emulador (ej: ps2, gamecube)
// ---------------------------------------------------------------------------
function getCandidateRepos(romFileName, emulator) {
  const ext = path.extname(romFileName).toLowerCase();
  const systemCandidates = SYSTEMS[ext] || [];
  const repos = [];

  // Verificar si el icono o nombre del emulador indica una consola específica
  let preferredRepo = null;
  if (emulator && emulator.icon) {
    const iconBase = path.basename(emulator.icon, path.extname(emulator.icon)).toLowerCase();
    preferredRepo = CONSOLE_TO_REPO[iconBase] || null;
  }
  if (!preferredRepo && emulator && emulator.name) {
    const emuName = emulator.name.toLowerCase().trim();
    if (CONSOLE_TO_REPO[emuName]) {
      preferredRepo = CONSOLE_TO_REPO[emuName];
    } else {
      const sortedKeys = Object.keys(CONSOLE_TO_REPO).sort((a, b) => b.length - a.length);
      const match = sortedKeys.find(k => emuName.includes(k));
      if (match) preferredRepo = CONSOLE_TO_REPO[match];
    }
  }

  if (preferredRepo) {
    repos.push(preferredRepo);
  }

  for (const item of systemCandidates) {
    if (!repos.includes(item.repo)) {
      repos.push(item.repo);
    }
  }

  return repos;
}

// ---------------------------------------------------------------------------
// Consulta rápida en caché local de una carátula ya existente
// ---------------------------------------------------------------------------
function getCachedCover(romFullPath, romFileName, emulator) {
  const registry = loadRegistry();
  if (registry[romFullPath] === 'removed') {
    return null;
  }
  if (registry[romFullPath] && fs.existsSync(registry[romFullPath])) {
    return registry[romFullPath];
  }

  // Buscar en carpetas descargadas locales de repositorios candidatos
  const repos = getCandidateRepos(romFileName, emulator);
  const romBaseName = path.basename(romFileName, path.extname(romFileName));
  const safeName = romBaseName.replace(/\//g, '_') + '.png';

  for (const repo of repos) {
    const candidatePath = path.join(COVERS_DIR, repo, safeName);
    if (fs.existsSync(candidatePath)) {
      try {
        const stats = fs.statSync(candidatePath);
        if (stats.size > 300) {
          return candidatePath;
        }
      } catch (e) {}
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Scraping de un solo juego
// ---------------------------------------------------------------------------
async function scrapeGameCover(game, emulator) {
  const romFileName = game.filename || path.basename(game.path);
  const romBaseName = path.basename(romFileName, path.extname(romFileName));
  const repos = getCandidateRepos(romFileName, emulator);

  let bestMatch = null;
  let bestScore = 0;
  let bestRepo = null;

  for (const repo of repos) {
    try {
      const titles = await getIndex(repo);
      const match = findBestMatch(romBaseName, titles);
      if (match && match.score > bestScore) {
        bestMatch = match.title;
        bestScore = match.score;
        bestRepo = repo;
        if (bestScore >= 0.88) {
          break;
        }
      }
    } catch (e) {
      console.warn(`No se pudo consultar índice de ${repo}:`, e.message);
    }
  }

  if (!bestMatch || !bestRepo) {
    return null;
  }

  try {
    const coverPath = await downloadCover(bestRepo, bestMatch);
    if (coverPath && fs.existsSync(coverPath)) {
      const registry = loadRegistry();
      registry[game.path] = coverPath;
      saveRegistry(registry);

      return coverPath;
    }
  } catch (e) {
    console.error(`Error descargando carátula para ${romFileName}:`, e.message);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Convierte un archivo de imagen en data URL base64 para Electron
// ---------------------------------------------------------------------------
function fileToDataUrl(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().substring(1);
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cola global de escaneo en segundo plano (no se cancela al cambiar de pestaña)
// ---------------------------------------------------------------------------
const scrapeQueue = [];
let isProcessingQueue = false;
let activeScanToken = { cancelled: false };

function cancelActiveScan() {
  if (activeScanToken) {
    activeScanToken.cancelled = true;
  }
  scrapeQueue.length = 0;
}

// Escaneo en segundo plano para una lista de juegos
async function scrapeCoversForGames(games, emulator, onCoverFound, onProgress, onComplete) {
  const registry = loadRegistry();
  const missingGames = games.filter(g => !g.coverUrl && !g.coverRemoved && registry[g.path] !== 'removed');
  if (missingGames.length === 0) {
    if (onComplete) onComplete({ total: 0, found: 0 });
    return;
  }

  // Reactivar token si estaba cancelado
  if (activeScanToken.cancelled) {
    activeScanToken = { cancelled: false };
  }
  const token = activeScanToken;

  // Evitar duplicar juegos en la cola
  const queuedPaths = new Set(scrapeQueue.map(item => item.game.path));
  const newItems = [];
  for (const game of missingGames) {
    if (!queuedPaths.has(game.path)) {
      newItems.push({
        game,
        emulator,
        onCoverFound,
        onProgress,
        onComplete
      });
      queuedPaths.add(game.path);
    }
  }

  // Priorizar al inicio de la cola los juegos de la pestaña o consola recién seleccionada
  scrapeQueue.unshift(...newItems);

  if (isProcessingQueue) {
    return;
  }

  isProcessingQueue = true;
  let totalProcessed = 0;
  let foundCount = 0;

  try {
    while (scrapeQueue.length > 0) {
      if (token.cancelled) {
        scrapeQueue.length = 0;
        break;
      }

      const item = scrapeQueue.shift();
      const currentRegistry = loadRegistry();

      // Si el usuario eliminó la carátula mientras estaba en cola o ya tiene imagen
      if (currentRegistry[item.game.path] === 'removed' || item.game.coverUrl) {
        continue;
      }

      totalProcessed++;
      const currentTotal = totalProcessed + scrapeQueue.length;

      if (item.onProgress) {
        item.onProgress({ processed: totalProcessed, total: currentTotal, currentGame: item.game.name });
      }

      try {
        const coverPath = await scrapeGameCover(item.game, item.emulator);
        if (token.cancelled) break;

        if (coverPath) {
          foundCount++;
          const dataUrl = fileToDataUrl(coverPath);
          if (dataUrl) {
            item.game.coverUrl = dataUrl;
            if (item.onCoverFound) {
              item.onCoverFound(item.game, dataUrl, coverPath);
            }
          }
        }
      } catch (err) {
        console.error(`Error procesando carátula para ${item.game.name}:`, err);
      }

      // Ceder el control al event loop para que Chromium dibuje y refresque repaints suavemente
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  } finally {
    isProcessingQueue = false;
    if (!token.cancelled && onComplete) {
      onComplete({ total: totalProcessed, found: foundCount });
    }
  }
}

// ---------------------------------------------------------------------------
// Desvincular carátula en el launcher
// Solo marca como 'removed' en el registro interno de Cascabel Launcher.
// NUNCA elimina archivos del sistema ni afecta miniaturas (thumbnails)
// asociadas al archivo del juego por el sistema operativo u otros programas.
// ---------------------------------------------------------------------------
function removeCover(romFullPath, emulator, gameName) {
  try {
    const registry = loadRegistry();
    registry[romFullPath] = 'removed';
    saveRegistry(registry);
  } catch (err) {
    console.error('Error desvinculando portada en launcher:', err);
  }
}

// ---------------------------------------------------------------------------
// Limpiar estado 'removed' para permitir re-scrapping de carátulas de un emulador
// ---------------------------------------------------------------------------
function clearRemovedStatusForEmulator(emulator) {
  try {
    const registry = loadRegistry();
    let modified = false;
    for (const [romPath, status] of Object.entries(registry)) {
      if (status === 'removed') {
        if (!emulator || !emulator.gamesPath || romPath.startsWith(emulator.gamesPath)) {
          delete registry[romPath];
          modified = true;
        }
      }
    }
    if (modified) {
      saveRegistry(registry);
    }
  } catch (err) {
    console.error('Error limpiando estado de carátulas eliminadas:', err);
  }
}

module.exports = {
  SYSTEMS,
  CONSOLE_TO_REPO,
  BASE_DIR,
  COVERS_DIR,
  REGISTRY_PATH,
  loadRegistry,
  saveRegistry,
  getIndex,
  _normalize,
  extractTags,
  similarityRatio,
  findBestMatch,
  downloadCover,
  getCandidateRepos,
  getCachedCover,
  scrapeGameCover,
  fileToDataUrl,
  scrapeCoversForGames,
  cancelActiveScan,
  removeCover,
  clearRemovedStatusForEmulator
};
