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

// Lanzar juego
ipcMain.handle('launch-game', async (event, emulatorPath, gamePath) => {
  const { spawn } = require('child_process');
  try {
    spawn(emulatorPath, [gamePath], {
      detached: true,
      stdio: 'ignore'
    }).unref();
    return true;
  } catch (error) {
    console.error('Error launching game:', error);
    return false;
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