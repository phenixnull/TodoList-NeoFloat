Option Explicit

Dim shell, fso, projectDir, starter, command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
starter = fso.BuildPath(projectDir, "launch-source-npm.bat")

If Not fso.FileExists(starter) Then
  MsgBox "launch-source-npm.bat not found in: " & projectDir, vbExclamation, "Neo Float Todo"
  WScript.Quit 1
End If

shell.CurrentDirectory = projectDir
command = "cmd.exe /c """ & starter & """"
shell.Run command, 0, False
