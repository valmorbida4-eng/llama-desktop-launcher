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

Function DesktopShortcutPage
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateCheckbox} 0 10u 100% 12u "Criar atalho na area de trabalho"
  Pop $DesktopShortcutCheckbox
  ${NSD_Check} $DesktopShortcutCheckbox
  nsDialogs::Show
FunctionEnd

Function DesktopShortcutPageLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $CreateDesktopShortcut
FunctionEnd
!endif

!macro customInstall
  ${If} $CreateDesktopShortcut == ${BST_CHECKED}
    CreateShortcut "$DESKTOP\\Llama Desktop Launcher.lnk" "$INSTDIR\\Llama Desktop Launcher.exe"
  ${EndIf}
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

!macro customUnInstall
  ${IfNot} ${isKeepShortcuts}
    Delete "$DESKTOP\Llama Desktop Launcher.lnk"
  ${EndIf}
!macroend
