!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!macro customCheckAppRunning
  checkAppAgain:
  !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
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
  !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 == 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "O Llama Desktop Launcher ainda esta em execucao. Feche o aplicativo para continuar com a desinstalacao." /SD IDCANCEL IDRETRY checkAppAgainUn
    Quit
  ${EndIf}
!macroend

!macro customUnInstall
  ${IfNot} ${isKeepShortcuts}
    Delete "$DESKTOP\\Llama Desktop Launcher.lnk"
  ${EndIf}
  RMDir /r "$INSTDIR"
!macroend
