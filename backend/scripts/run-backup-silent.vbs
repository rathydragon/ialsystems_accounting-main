Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
BatPath = ScriptDir & "\run-backup-background.bat"
' Run with 0 = Hidden window, False = Don't wait to complete
WshShell.Run """" & BatPath & """", 0, False
