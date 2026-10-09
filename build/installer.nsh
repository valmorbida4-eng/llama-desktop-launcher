!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!macro customCheckAppRunning
  checkAppAgain:
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 == 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Feche o Llama Desktop Launcher para encerrar o servidor e continuar com seguranca." /SD IDCANCEL IDRETRY checkAppAgain
    Quit
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom DesktopShortcutPage DesktopShortcutPageLeave
!macroend

!ifndef BUILD_UNINSTALLER
Var DesktopShortcutCheckbox
Var CreateDesktopShortcut
Var PreviousDesktopShortcut

Function DesktopShortcutPage
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateCheckbox} 0 10u 100% 12u "Criar atalho na area de trabalho"
  Pop $DesktopShortcutCheckbox
  ${If} $PreviousDesktopShortcut != "false"
    ${NSD_Check} $DesktopShortcutCheckbox
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function DesktopShortcutPageLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $CreateDesktopShortcut
FunctionEnd
!endif

# Read before the previous uninstaller runs, because it deletes the install registry key.
!macro customInit
  ReadRegStr $PreviousDesktopShortcut SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" DesktopShortcut
!macroend

# Silent installs skip the shortcut page: keep the stored choice, defaulting to a shortcut like the page does.
!macro customInstall
  ${If} ${Silent}
    ${If} $PreviousDesktopShortcut == "false"
      StrCpy $CreateDesktopShortcut ${BST_UNCHECKED}
    ${Else}
      StrCpy $CreateDesktopShortcut ${BST_CHECKED}
    ${EndIf}
  ${EndIf}
  ${If} $CreateDesktopShortcut == ${BST_CHECKED}
    # Same shortcut as electron-builder's: an explicit icon avoids the blank icon Explorer caches while an update replaces the executable.
    CreateShortcut "$DESKTOP\Llama Desktop Launcher.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$DESKTOP\Llama Desktop Launcher.lnk" "${APP_ID}"
    WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" DesktopShortcut "true"
  ${Else}
    WinShell::UninstShortcut "$DESKTOP\Llama Desktop Launcher.lnk"
    Delete "$DESKTOP\Llama Desktop Launcher.lnk"
    WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" DesktopShortcut "false"
  ${EndIf}
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstallCheck
  checkAppAgainUn:
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 == 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "O Llama Desktop Launcher ainda esta em execucao. Feche o aplicativo para continuar com a desinstalacao." /SD IDCANCEL IDRETRY checkAppAgainUn
    Quit
  ${EndIf}
!macroend

!macro DeleteAppLocale locale
  Delete "$INSTDIR\locales\${locale}.pak"
!macroend

!macro customRemoveFiles
  Delete "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  Delete "$INSTDIR\resources\app.asar"
  Delete "$INSTDIR\resources\elevate.exe"
  Delete "$INSTDIR\resources\LICENSE"
  Delete "$INSTDIR\resources\docs\MANUAL-pt-BR.pdf"
  Delete "$INSTDIR\resources\docs\MANUAL-en.pdf"
  RMDir "$INSTDIR\resources\docs"
  RMDir "$INSTDIR\resources"
  !insertmacro DeleteAppLocale "af"
  !insertmacro DeleteAppLocale "am"
  !insertmacro DeleteAppLocale "ar"
  !insertmacro DeleteAppLocale "bg"
  !insertmacro DeleteAppLocale "bn"
  !insertmacro DeleteAppLocale "ca"
  !insertmacro DeleteAppLocale "cs"
  !insertmacro DeleteAppLocale "da"
  !insertmacro DeleteAppLocale "de"
  !insertmacro DeleteAppLocale "el"
  !insertmacro DeleteAppLocale "en-GB"
  !insertmacro DeleteAppLocale "en-US"
  !insertmacro DeleteAppLocale "es"
  !insertmacro DeleteAppLocale "es-419"
  !insertmacro DeleteAppLocale "et"
  !insertmacro DeleteAppLocale "fa"
  !insertmacro DeleteAppLocale "fi"
  !insertmacro DeleteAppLocale "fil"
  !insertmacro DeleteAppLocale "fr"
  !insertmacro DeleteAppLocale "gu"
  !insertmacro DeleteAppLocale "he"
  !insertmacro DeleteAppLocale "hi"
  !insertmacro DeleteAppLocale "hr"
  !insertmacro DeleteAppLocale "hu"
  !insertmacro DeleteAppLocale "id"
  !insertmacro DeleteAppLocale "it"
  !insertmacro DeleteAppLocale "ja"
  !insertmacro DeleteAppLocale "kn"
  !insertmacro DeleteAppLocale "ko"
  !insertmacro DeleteAppLocale "lt"
  !insertmacro DeleteAppLocale "lv"
  !insertmacro DeleteAppLocale "ml"
  !insertmacro DeleteAppLocale "mr"
  !insertmacro DeleteAppLocale "ms"
  !insertmacro DeleteAppLocale "nb"
  !insertmacro DeleteAppLocale "nl"
  !insertmacro DeleteAppLocale "pl"
  !insertmacro DeleteAppLocale "pt-BR"
  !insertmacro DeleteAppLocale "pt-PT"
  !insertmacro DeleteAppLocale "ro"
  !insertmacro DeleteAppLocale "ru"
  !insertmacro DeleteAppLocale "sk"
  !insertmacro DeleteAppLocale "sl"
  !insertmacro DeleteAppLocale "sr"
  !insertmacro DeleteAppLocale "sv"
  !insertmacro DeleteAppLocale "sw"
  !insertmacro DeleteAppLocale "ta"
  !insertmacro DeleteAppLocale "te"
  !insertmacro DeleteAppLocale "th"
  !insertmacro DeleteAppLocale "tr"
  !insertmacro DeleteAppLocale "uk"
  !insertmacro DeleteAppLocale "ur"
  !insertmacro DeleteAppLocale "vi"
  !insertmacro DeleteAppLocale "zh-CN"
  !insertmacro DeleteAppLocale "zh-TW"
  RMDir "$INSTDIR\locales"
  Delete "$INSTDIR\chrome_100_percent.pak"
  Delete "$INSTDIR\chrome_200_percent.pak"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\dxcompiler.dll"
  Delete "$INSTDIR\dxil.dll"
  Delete "$INSTDIR\ffmpeg.dll"
  Delete "$INSTDIR\icudtl.dat"
  Delete "$INSTDIR\libEGL.dll"
  Delete "$INSTDIR\libGLESv2.dll"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\resources.pak"
  Delete "$INSTDIR\snapshot_blob.bin"
  Delete "$INSTDIR\v8_context_snapshot.bin"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vulkan-1.dll"
  Delete "$INSTDIR\${UNINSTALL_FILENAME}"
  !ifdef UNINSTALLER_ICON
    Delete "$INSTDIR\uninstallerIcon.ico"
  !endif
  RMDir "$INSTDIR"
!macroend

# During an update the new installer decides whether the shortcut stays.
!macro customUnInstall
  ${IfNot} ${isKeepShortcuts}
  ${AndIfNot} ${isUpdated}
    WinShell::UninstShortcut "$DESKTOP\Llama Desktop Launcher.lnk"
    Delete "$DESKTOP\Llama Desktop Launcher.lnk"
  ${EndIf}
!macroend
