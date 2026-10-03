; Test stand-in for TaskPop.exe: records that it was started and with which arguments.
Unicode true
Target amd64-unicode
Name "fakeapp"
OutFile "fakeapp.exe"
SilentInstall silent
RequestExecutionLevel user
Section
  FileOpen $0 "$TEMP\taskpop-launched.txt" a
  FileSeek $0 0 END
  FileWrite $0 "launched: $CMDLINE$\r$\n"
  FileClose $0
SectionEnd
