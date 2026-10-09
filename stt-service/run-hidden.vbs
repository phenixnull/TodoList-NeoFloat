' HabitPulse STT service launcher: runs the PowerShell start script with a
' fully hidden window (window style 0) so no terminal stays open.
Set shell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptDir & "\start-stt-service.ps1"""
shell.Run command, 0, False
