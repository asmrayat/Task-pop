; TaskPop for Windows - installer (NSIS)
; Per-user install (no admin prompt) into %LOCALAPPDATA%\Programs\TaskPop.
; The app runtime is downloaded and checked by setup.ps1 during install (or reused from the
; installed copy when it's the same version, so updates are quick).
;
; TaskPop's built-in updater runs this with /UPDATE: no Welcome or Finish page, the window
; closes by itself when done, and TaskPop is opened again.

Unicode true
!ifdef TEST_AMD64
  Target amd64-unicode ; test builds only (the release installer is 32-bit so it runs on every PC)
!endif
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"

!define APPNAME "TaskPop"
!ifndef VERSION
  !error "Build with build-win.sh, which passes the version from app/package.json"
!endif
!define PUBLISHER "asmlab"
!define APPID "com.pixmint.taskpop"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\TaskPop"
!define RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define APPROVED_KEY "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"

Name "${APPNAME}"
!ifdef TEST_CODE
  OutFile "out\test\TaskPop-Setup-test-${TEST_CODE}.exe"
!else
  OutFile "out\TaskPop-Setup-${VERSION}.exe"
!endif
InstallDir "$LOCALAPPDATA\Programs\TaskPop"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "Developed by ${PUBLISHER}"
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "LegalCopyright" "Copyright 2026 ${PUBLISHER}"

!define MUI_ICON "stage\TaskPop.ico"
!define MUI_UNICON "stage\TaskPop.ico"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Welcome to TaskPop"
!define MUI_WELCOMEPAGE_TEXT "A small task list that slides in from the corner of your screen.$\r$\n$\r$\n\
  -  Double-tap Ctrl to open it from any app (or press Ctrl+Alt+T).$\r$\n\
  -  It pops up by itself when your PC wakes up.$\r$\n\
  -  Reminders, daily tasks and a morning summary.$\r$\n\
  -  Send any task to Google Calendar in two clicks.$\r$\n\
  -  Tells you when a new version is out and updates in one click.$\r$\n\
  -  Your tasks stay on this PC.$\r$\n$\r$\n\
Stay connected to the internet while it installs. A first install downloads the rest of TaskPop (about 160 MB). Updating keeps your tasks and usually needs no download.$\r$\n$\r$\n\
Click Next to install."
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipPageInUpdateMode
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_TITLE "TaskPop is installed"
!define MUI_FINISHPAGE_TEXT "Double-tap Ctrl any time to open your tasks.$\r$\n$\r$\n\
TaskPop lives in the notification area next to the clock. If you don't see its icon, click the ^ arrow there, and drag the icon onto the taskbar to keep it in view."
!define MUI_FINISHPAGE_RUN "$INSTDIR\TaskPop.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS "--show"
!define MUI_FINISHPAGE_RUN_TEXT "Open TaskPop now"
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipPageInUpdateMode
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Var IsUpdate

Function .onInit
  StrCpy $IsUpdate 0
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/UPDATE" $R1
  ${IfNot} ${Errors}
    StrCpy $IsUpdate 1
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "TaskPop needs Windows 10 or Windows 11." /SD IDOK
    Abort
  ${EndIf}
  ${IfNot} ${RunningX64}
  ${AndIfNot} ${IsNativeARM64}
    MessageBox MB_ICONSTOP "TaskPop needs 64-bit Windows." /SD IDOK
    Abort
  ${EndIf}
FunctionEnd

Function SkipPageInUpdateMode
  ${If} $IsUpdate == 1
    Abort
  ${EndIf}
FunctionEnd

; An update that didn't go through leaves the installed version as it was; open it again.
!macro ReopenAfterFailedUpdate
  ${If} $IsUpdate == 1
  ${AndIf} ${FileExists} "$INSTDIR\TaskPop.exe"
    Exec '"$INSTDIR\TaskPop.exe"'
  ${EndIf}
!macroend

Section "TaskPop"
  DetailPrint "Closing TaskPop if it's running..."
  nsExec::Exec 'taskkill /F /IM TaskPop.exe'
  Pop $0
  Sleep 800

  InitPluginsDir
  SetOutPath "$PLUGINSDIR\setup"
  File /r "stage\*.*"

!ifdef TEST_CODE
  ; Test build: a stand-in for setup.ps1 that lays out a fake app and exits with TEST_CODE.
  File "/oname=$PLUGINSDIR\setup\fake-setup.cmd" "test\fake-setup.cmd"
  File "/oname=$PLUGINSDIR\setup\fakeapp.exe" "test\fakeapp.exe"
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /c ""$PLUGINSDIR\setup\fake-setup.cmd" "$PLUGINSDIR\setup" "$INSTDIR" ${TEST_CODE}"'
!else
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\setup\setup.ps1" -Stage "$PLUGINSDIR\setup" -Dest "$INSTDIR"'
!endif
  Pop $0
  ${If} $0 == "error"
    MessageBox MB_ICONEXCLAMATION "The installer couldn't start Windows PowerShell, which it needs to download TaskPop.$\r$\nIt may be blocked on this PC (for example by a work policy)." /SD IDOK
    !insertmacro ReopenAfterFailedUpdate
    Abort "Windows PowerShell couldn't be started."
  ${ElseIf} $0 == 2
    MessageBox MB_ICONEXCLAMATION "TaskPop couldn't download the rest of the app.$\r$\nCheck your internet connection and run the installer again." /SD IDOK
    !insertmacro ReopenAfterFailedUpdate
    Abort "Download failed. Nothing was changed."
  ${ElseIf} $0 == 3
    MessageBox MB_ICONEXCLAMATION "A downloaded file didn't pass its safety check, so nothing was installed.$\r$\nPlease run the installer again." /SD IDOK
    !insertmacro ReopenAfterFailedUpdate
    Abort "Safety check failed. Nothing was changed."
  ${ElseIf} $0 != 0
    MessageBox MB_ICONEXCLAMATION "TaskPop couldn't be installed (code $0).$\r$\nPlease run the installer again." /SD IDOK
    !insertmacro ReopenAfterFailedUpdate
    Abort "Installation failed."
  ${EndIf}

  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall TaskPop.exe"
  CreateShortCut "$SMPROGRAMS\TaskPop.lnk" "$INSTDIR\TaskPop.exe" "" "$INSTDIR\TaskPop.ico" 0

  ; Apps & features entry
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\TaskPop.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall TaskPop.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall TaskPop.exe" /S'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" 400000

  ${If} $IsUpdate == 1
    DetailPrint "TaskPop is up to date. Opening it again..."
    SetAutoClose true
    Exec '"$INSTDIR\TaskPop.exe" --show'
  ${EndIf}
SectionEnd

Section "Uninstall"
  DetailPrint "Closing TaskPop..."
  nsExec::Exec 'taskkill /F /IM TaskPop.exe'
  Pop $0
  Sleep 800

  ; Start-with-Windows entries TaskPop may have created
  DeleteRegValue HKCU "${RUN_KEY}" "${APPID}"
  DeleteRegValue HKCU "${RUN_KEY}" "${APPNAME}"
  DeleteRegValue HKCU "${RUN_KEY}" "electron.app.${APPNAME}"
  DeleteRegValue HKCU "${APPROVED_KEY}" "${APPID}"
  DeleteRegValue HKCU "${APPROVED_KEY}" "${APPNAME}"
  DeleteRegValue HKCU "${APPROVED_KEY}" "electron.app.${APPNAME}"

  Delete "$SMPROGRAMS\TaskPop.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"

  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete your tasks and settings?$\r$\n$\r$\nChoose No to keep them in case you install TaskPop again." /SD IDNO IDNO keep
    RMDir /r "$APPDATA\TaskPop"
  keep:
SectionEnd
