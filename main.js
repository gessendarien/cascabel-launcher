const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Configuración del auto-updater
autoUpdater.checkForUpdatesAndNotify = false; // Deshabilitado por defecto
autoUpdater.autoDownload = false; // No descargar automáticamente
autoUpdater.autoInstallOnAppQuit = false; // No instalar automáticamente

// Log de eventos del updater
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'assets', 'cascabel.png'), // Ícono de la aplicación
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: false // Deshabilitar DevTools en producción
    },
    autoHideMenuBar: true, // Oculta el menú superior
    frame: true // Mantiene el marco pero sin menú
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  
  // Verificar si es una nueva instalación o actualización
  checkInstallationType();
  
  // Inicializar el sistema de actualizaciones después de crear la ventana
  initializeUpdater();
}

function initializeUpdater() {
  // Eventos del auto-updater
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
    mainWindow.webContents.send('update-status', 'checking');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available.');
    mainWindow.webContents.send('update-available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available.');
    mainWindow.webContents.send('update-not-available');
  });

  autoUpdater.on('error', (err) => {
    console.log('Error in auto-updater. ' + err);
    mainWindow.webContents.send('update-error', err.message);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    console.log(log_message);
    mainWindow.webContents.send('download-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded');
    mainWindow.webContents.send('update-downloaded');
  });
}

function checkInstallationType() {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  const versionFile = path.join(app.getPath('userData'), 'version.txt');
  const currentVersion = app.getVersion();
  
  // Verificar si existe archivo de versión anterior
  if (fs.existsSync(versionFile)) {
    const previousVersion = fs.readFileSync(versionFile, 'utf8').trim();
    
    if (previousVersion !== currentVersion) {
      // Es una actualización
      console.log(`Actualización detectada: ${previousVersion} → ${currentVersion}`);
      
      // Mostrar notificación de actualización exitosa
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-completed', {
            from: previousVersion,
            to: currentVersion
          });
        }
      }, 3000);
    } else {
      console.log(`Versión actual: ${currentVersion}`);
    }
  } else {
    // Primera instalación
    console.log(`Primera instalación de Cascabel Launcher v${currentVersion}`);
    
    // Mostrar mensaje de bienvenida
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('first-install-welcome', currentVersion);
      }
    }, 2000);
  }
  
  // Guardar versión actual
  fs.writeFileSync(versionFile, currentVersion);
}

app.whenReady().then(() => {
  // Configurar el ícono de la aplicación
  if (process.platform === 'win32') {
    app.setAppUserModelId('Cascabel Launcher');
  }
  
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Configuración: guardar y cargar
ipcMain.handle('save-config', async (event, config) => {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return true;
});

ipcMain.handle('load-config', async () => {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath));
  }
  return null;
});

// Backup de configuración
ipcMain.handle('backup-config', async () => {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    const backupPath = path.join(app.getPath('userData'), `config-backup-${Date.now()}.json`);
    
    if (fs.existsSync(configPath)) {
      fs.copyFileSync(configPath, backupPath);
      return { success: true, backupPath };
    }
    return { success: false, error: 'No hay configuración para respaldar' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Exportar configuración
ipcMain.handle('export-config', async () => {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const result = await dialog.showSaveDialog({
        title: 'Exportar configuración',
        defaultPath: 'cascabel-config.json',
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (!result.canceled) {
        fs.copyFileSync(configPath, result.filePath);
        return { success: true, path: result.filePath };
      }
    }
    return { success: false, error: 'Operación cancelada' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Importar configuración
ipcMain.handle('import-config', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Importar configuración',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      const importPath = result.filePaths[0];
      const configPath = path.join(app.getPath('userData'), 'config.json');
      
      // Hacer backup de la configuración actual antes de importar
      if (fs.existsSync(configPath)) {
        const backupPath = path.join(app.getPath('userData'), `config-backup-before-import-${Date.now()}.json`);
        fs.copyFileSync(configPath, backupPath);
      }
      
      // Importar nueva configuración
      fs.copyFileSync(importPath, configPath);
      return { success: true, path: importPath };
    }
    return { success: false, error: 'Operación cancelada' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Obtener información de la aplicación
ipcMain.handle('get-app-info', async () => {
  return {
    version: app.getVersion(),
    name: app.getName(),
    userDataPath: app.getPath('userData'),
    configPath: path.join(app.getPath('userData'), 'config.json')
  };
});
// Diálogo para seleccionar archivos
ipcMain.handle('select-file', async (event, options = {}) => {
  options = {
    properties: ['openFile'],
    ...options
  };
  
  const result = await dialog.showOpenDialog(options);
  return result.filePaths[0] || '';
});

// Diálogo para seleccionar carpetas
ipcMain.handle('select-folder', async (event, options = {}) => {
  const result = await dialog.showOpenDialog({
    ...options,
    properties: ['openDirectory']
  });
  return result.filePaths[0] || '';
});

// Diálogo para seleccionar archivos de audio
ipcMain.handle('select-audio-file', async (event, options = {}) => {
  const result = await dialog.showOpenDialog({
    title: 'Seleccionar archivo de audio',
    filters: [
      { name: 'Archivos de Audio', extensions: ['mp3', 'ogg', 'wav'] },
      { name: 'MP3', extensions: ['mp3'] },
      { name: 'OGG', extensions: ['ogg'] },
      { name: 'WAV', extensions: ['wav'] }
    ],
    properties: ['openFile'],
    ...options
  });
  return result.filePaths[0] || '';
});

// Seleccionar archivo de imagen
ipcMain.handle('select-image-file', async (event, options = {}) => {
  const result = await dialog.showOpenDialog({
    title: 'Seleccionar imagen de perfil',
    filters: [
      { name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] },
      { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
      { name: 'PNG', extensions: ['png'] },
      { name: 'GIF', extensions: ['gif'] },
      { name: 'Todas las imágenes', extensions: ['*'] }
    ],
    properties: ['openFile'],
    ...options
  });
  return result.filePaths[0] || '';
});

// Obtener aplicaciones del sistema en Linux
function getLinuxSystemApps() {
  const os = require('os');
  const dirs = [
    path.join(os.homedir(), '.local/share/applications'),
    '/usr/local/share/applications',
    '/usr/share/applications',
    '/var/lib/flatpak/exports/share/applications',
    path.join(os.homedir(), '.local/share/flatpak/exports/share/applications'),
    '/var/lib/snapd/desktop/applications'
  ];

  const iconDirs = [
    '/var/lib/flatpak/exports/share/icons/hicolor/scalable/apps',
    '/var/lib/flatpak/exports/share/icons/hicolor/128x128/apps',
    '/var/lib/flatpak/exports/share/icons/hicolor/64x64/apps',
    '/var/lib/flatpak/exports/share/icons/hicolor/48x48/apps',
    path.join(os.homedir(), '.local/share/flatpak/exports/share/icons/hicolor/scalable/apps'),
    path.join(os.homedir(), '.local/share/icons/hicolor/scalable/apps'),
    '/usr/share/icons/hicolor/scalable/apps',
    '/usr/share/icons/hicolor/128x128/apps',
    '/usr/share/icons/hicolor/64x64/apps',
    '/usr/share/icons/hicolor/48x48/apps',
    '/usr/share/pixmaps'
  ];

  function resolveIcon(iconName) {
    if (!iconName) return null;
    if (path.isAbsolute(iconName) && fs.existsSync(iconName)) return iconName;
    for (const d of iconDirs) {
      for (const ext of ['.svg', '.png', '']) {
        const full = path.join(d, iconName + ext);
        if (fs.existsSync(full)) return full;
      }
    }
    return null;
  }

  const apps = [];
  const seen = new Set();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    let files = [];
    try { files = fs.readdirSync(dir); } catch (e) { continue; }
    for (const f of files) {
      if (!f.endsWith('.desktop') || seen.has(f)) continue;
      seen.add(f);
      try {
        const fullPath = path.join(dir, f);
        const content = fs.readFileSync(fullPath, 'utf8');
        if (/^NoDisplay=true/m.test(content)) continue;
        if (!/^Type=Application/m.test(content)) continue;

        const nameMatch = content.match(/^Name=(.*)$/m);
        const execMatch = content.match(/^Exec=(.*)$/m);
        const iconMatch = content.match(/^Icon=(.*)$/m);
        const catMatch = content.match(/^Categories=(.*)$/m);
        const commentMatch = content.match(/^Comment=(.*)$/m);

        if (nameMatch && execMatch) {
          const rawExec = execMatch[1].trim();
          const name = nameMatch[1].trim();
          const categories = catMatch ? catMatch[1].trim() : '';
          const comment = commentMatch ? commentMatch[1].trim() : '';
          const rawIcon = iconMatch ? iconMatch[1].trim() : '';
          const resolvedIcon = resolveIcon(rawIcon);

          let iconData = null;
          if (resolvedIcon && fs.existsSync(resolvedIcon)) {
            try {
              const ext = path.extname(resolvedIcon).toLowerCase();
              const mime = ext === '.svg' ? 'image/svg+xml' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png');
              iconData = `data:${mime};base64,${fs.readFileSync(resolvedIcon).toString('base64')}`;
            } catch (err) {}
          }

          const catList = categories.split(';').map(c => c.trim().toLowerCase());
          const isGameOrEmulator = catList.includes('game') || 
                                  catList.includes('emulator') || 
                                  /\b(game|emulator|emulation|retroarch|dolphin|pcsx|snes|nes|mupen|duckstation|mgba|cemu|rpcs3|yuzu|ryujinx|citra)\b/i.test(name) ||
                                  /\b(game|emulator|emulation|retroarch|dolphin|pcsx|snes|nes|mupen|duckstation|mgba|cemu|rpcs3|yuzu|ryujinx|citra)\b/i.test(comment);

          apps.push({
            name,
            exec: rawExec,
            iconData,
            categories,
            comment,
            isGameOrEmulator
          });
        }
      } catch (e) {}
    }
  }

  apps.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return apps;
}

// Handler IPC para listar aplicaciones instaladas en el sistema
ipcMain.handle('get-system-apps', async () => {
  if (process.platform !== 'linux') {
    return [];
  }
  return getLinuxSystemApps();
});

// Lanzar juego
ipcMain.handle('launch-game', async (event, emulatorPath, gamePath) => {
  const { spawn } = require('child_process');
  try {
    if (!emulatorPath || !emulatorPath.trim()) {
      const errorMsg = 'No se configuró la ruta o comando del ejecutable del emulador.';
      console.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    if (!gamePath || !fs.existsSync(gamePath)) {
      const errorMsg = `No se encontró el archivo del juego en:\n${gamePath || '(Ruta no encontrada)'}`;
      console.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    const trimmedExec = emulatorPath.trim();
    const isDirectFile = fs.existsSync(trimmedExec) && fs.statSync(trimmedExec).isFile();

    let spawnCmd;
    let spawnArgs;
    let spawnOptions = { detached: true, stdio: 'ignore' };

    if (isDirectFile) {
      // Asegurar permisos de ejecución en Linux/macOS si es un AppImage o binario directo
      if (process.platform !== 'win32') {
        try {
          fs.accessSync(trimmedExec, fs.constants.X_OK);
        } catch (err) {
          try {
            fs.chmodSync(trimmedExec, 0o755);
          } catch (chmodErr) {
            console.warn('No se pudo asignar permisos de ejecución a ' + trimmedExec, chmodErr);
          }
        }
      }
      spawnCmd = trimmedExec;
      spawnArgs = [gamePath];
    } else {
      // Es un comando del sistema (flatpak, comando con flags %f, etc.)
      let cmdStr = trimmedExec;
      if (/%[fFuU]/.test(cmdStr)) {
        cmdStr = cmdStr.replace(/%[fFuU]/g, `"${gamePath}"`);
      } else if (cmdStr.includes('@@ @@')) {
        cmdStr = cmdStr.replace('@@ @@', `@@ "${gamePath}" @@`);
      } else {
        cmdStr = `${cmdStr} "${gamePath}"`;
      }
      spawnCmd = cmdStr;
      spawnArgs = [];
      spawnOptions.shell = true;
    }

    return new Promise((resolve) => {
      let hasResponded = false;
      const child = spawn(spawnCmd, spawnArgs, spawnOptions);

      child.on('error', (err) => {
        console.error('Error al iniciar el proceso del emulador:', err);
        if (!hasResponded) {
          hasResponded = true;
          resolve({
            success: false,
            error: `Error al iniciar el emulador: ${err.message}`
          });
        }
      });

      child.unref();

      // Si no emitió error inmediato en el arranque, consideramos éxito
      setTimeout(() => {
        if (!hasResponded) {
          hasResponded = true;
          resolve({ success: true });
        }
      }, 500);
    });
  } catch (error) {
    console.error('Error launching game:', error);
    return { success: false, error: error.message };
  }
});

// Sistema de actualizaciones
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result };
  } catch (error) {
    console.error('Error checking for updates:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    console.error('Error downloading update:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', async () => {
  try {
    autoUpdater.quitAndInstall();
    return { success: true };
  } catch (error) {
    console.error('Error installing update:', error);
    return { success: false, error: error.message };
  }
});

// Sistema de actualizaciones manual vía GitHub
ipcMain.handle('check-update-github', async () => {
  return new Promise((resolve) => {
    const { net } = require('electron');
    const request = net.request({
      method: 'GET',
      protocol: 'https:',
      hostname: 'api.github.com',
      path: '/repos/gessendarien/cascabel-launcher/releases/latest',
      headers: {
        'User-Agent': 'Cascabel-Launcher',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    request.on('response', (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        if (response.statusCode === 200) {
          try {
            const release = JSON.parse(data);
            resolve({ success: true, tag: release.tag_name, assets: release.assets });
          } catch (err) {
            resolve({ success: false, error: err.message });
          }
        } else {
          resolve({ success: false, error: `HTTP ${response.statusCode}` });
        }
      });
    });
    request.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    request.end();
  });
});

ipcMain.handle('download-github-update', async (event, options) => {
  try {
    const assetUrl = typeof options === 'string' ? options : options.url;
    const releaseName = typeof options === 'string' ? assetUrl.substring(assetUrl.lastIndexOf('/') + 1) : options.name;
    const isWindows = process.platform === 'win32';
    const isAppImage = process.env.APPIMAGE;
    
    // Ruta donde se está ejecutando la aplicación actualmente
    let currentAppPath = process.execPath;
    if (isAppImage) {
      currentAppPath = process.env.APPIMAGE;
    } else if (isWindows) {
      currentAppPath = process.execPath;
    } else {
      currentAppPath = path.join(process.cwd(), releaseName || 'Cascabel.AppImage');
    }

    let filePath = currentAppPath;
    if (isWindows) {
      // En Windows el exe en ejecución puede estar bloqueado para sobrescribir
      filePath = path.join(path.dirname(currentAppPath), releaseName || 'Cascabel-update.exe');
    }

    return new Promise((resolve) => {
      const { net } = require('electron');
      const request = net.request({
        method: 'GET',
        url: assetUrl,
        headers: {
          'User-Agent': 'Cascabel-Launcher',
          'Accept': 'application/octet-stream'
        }
      });
      
      const handleStream = (res) => {
        const tempFilePath = filePath + '.download';
        const file = fs.createWriteStream(tempFilePath);
        res.on('data', (chunk) => { file.write(chunk); });
        res.on('end', () => {
          file.end(() => {
            try {
              if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch (e) { /* Si no se puede borrar, intentar renombrar */ }
              }
              fs.renameSync(tempFilePath, filePath);
              if (filePath.toLowerCase().endsWith('.appimage')) {
                fs.chmodSync(filePath, 0o755);
              }
              resolve({ success: true, filePath });
            } catch (err) {
              resolve({ success: false, error: err.message });
            }
          });
        });
        file.on('error', (err) => resolve({ success: false, error: err.message }));
      };

      request.on('response', (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectReq = net.request(response.headers.location);
          redirectReq.on('response', (res) => {
            if (res.statusCode !== 200) {
              resolve({ success: false, error: `HTTP ${res.statusCode} en redirección` });
              return;
            }
            handleStream(res);
          });
          redirectReq.on('error', (err) => resolve({ success: false, error: err.message }));
          redirectReq.end();
        } else if (response.statusCode === 200) {
          handleStream(response);
        } else {
          resolve({ success: false, error: `HTTP ${response.statusCode}` });
        }
      });
      request.on('error', (err) => resolve({ success: false, error: err.message }));
      request.end();
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('restart-app', async (event, newExecutablePath) => {
  try {
    const execPath = newExecutablePath || process.env.APPIMAGE || process.execPath;
    app.relaunch({ execPath });
    app.exit(0);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-update-settings', async () => {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  let config = {};
  
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  
  return {
    autoUpdatesEnabled: config.autoUpdatesEnabled || false,
    checkOnStartup: config.checkUpdatesOnStartup || false
  };
});

ipcMain.handle('save-update-settings', async (event, settings) => {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  let config = {};
  
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  
  config.autoUpdatesEnabled = settings.autoUpdatesEnabled;
  config.checkUpdatesOnStartup = settings.checkOnStartup;
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  // Aplicar configuración al auto-updater
  autoUpdater.autoDownload = settings.autoUpdatesEnabled;
  autoUpdater.autoInstallOnAppQuit = settings.autoUpdatesEnabled;
  
  return { success: true };
});