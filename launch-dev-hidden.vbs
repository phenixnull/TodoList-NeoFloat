Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
starter = fso.BuildPath(projectDir, "start-dev.ps1")

If Not fso.FileExists(starter) Then
  MsgBox "start-dev.ps1 not found: " & starter, 16, "Neo Float Todo"
  WScript.Quit 1
End If

shell.CurrentDirectory = projectDir
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & starter & """", 0, False
