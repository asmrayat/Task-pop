@echo off
rem Stand-in for setup.ps1 in test builds. %1 = stage, %2 = install folder, %3 = exit code to simulate
echo Downloading the rest of TaskPop (test stand-in)...
if not "%3"=="0" exit /b %3
if not exist "%~2" mkdir "%~2"
if exist "%~1\fakeapp.exe" (copy /y "%~1\fakeapp.exe" "%~2\TaskPop.exe" >nul) else (copy /y "%~1\rcedit.exe" "%~2\TaskPop.exe" >nul)
copy /y "%~1\TaskPop.ico" "%~2\TaskPop.ico" >nul
mkdir "%~2\resources\app" 2>nul
xcopy /e /i /q /y "%~1\app" "%~2\resources\app" >nul
echo TaskPop is installed.
exit /b 0
