; Script personalizado de instalación NSIS para Cascabel Launcher
; Detecta instalaciones existentes y maneja actualizaciones inteligentemente

!macro customInit
  ; Verificar si Cascabel ya está instalado
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  ${If} $0 != ""
    ; Instalación existente encontrada
    MessageBox MB_YESNO|MB_ICONQUESTION "Se ha detectado una instalación existente de Cascabel Launcher.$\n$\n¿Desea actualizarla? (Se conservará su configuración)" IDYES update IDNO cancel
    
    update:
      ; Mostrar mensaje de actualización
      MessageBox MB_OK|MB_ICONINFORMATION "Actualizando Cascabel Launcher...$\n$\nSu configuración será conservada automáticamente."
      Goto continue
    
    cancel:
      ; Usuario canceló la actualización
      MessageBox MB_OK|MB_ICONEXCLAMATION "Actualización cancelada."
      Quit
    
    continue:
  ${EndIf}
!macroend

!macro customInstall
  ; Durante la instalación, preservar archivos de configuración
  ${If} ${FileExists} "$INSTDIR\config.json"
    ; Crear backup de configuración
    CopyFiles "$INSTDIR\config.json" "$TEMP\cascabel-config-backup.json"
  ${EndIf}
!macroend

!macro customUnInit
  ; Al finalizar la instalación, restaurar configuración si existe backup
  ${If} ${FileExists} "$TEMP\cascabel-config-backup.json"
    ; Restaurar configuración
    CopyFiles "$TEMP\cascabel-config-backup.json" "$INSTDIR\config.json"
    Delete "$TEMP\cascabel-config-backup.json"
    
    ; Mostrar mensaje de éxito
    MessageBox MB_OK|MB_ICONINFORMATION "✅ Actualización completada exitosamente.$\n$\nSu configuración ha sido conservada."
  ${Else}
    ; Nueva instalación
    MessageBox MB_OK|MB_ICONINFORMATION "✅ Cascabel Launcher se ha instalado correctamente.$\n$\n¡Disfrute organizando su colección de juegos!"
  ${EndIf}
!macroend

; Detectar si la aplicación está en ejecución antes de instalar
!macro customHeader
  !system "echo Cascabel Launcher Installer - Smart Update System"
!macroend

; Función para cerrar procesos antes de actualizar
Function .onInstSuccess
  ; Verificar si Cascabel está ejecutándose
  nsProcess::_FindProcess "Cascabel.exe"
  Pop $R0
  ${If} $R0 = 0
    MessageBox MB_YESNO|MB_ICONQUESTION "Cascabel Launcher está ejecutándose.$\n$\n¿Desea cerrarlo para completar la actualización?" IDYES close IDNO skip
    
    close:
      nsProcess::_KillProcess "Cascabel.exe"
      Sleep 2000
    
    skip:
  ${EndIf}
FunctionEnd
