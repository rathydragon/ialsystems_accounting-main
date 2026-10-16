Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
BatPath = FSO.BuildPath(ScriptDir, "..\backend\scripts\run-backup-background.bat")

If Not FSO.FileExists(BatPath) Then
    BatPath = ScriptDir & "\run-backup-background.bat"
End If

' Run with 0 = Hidden window, False = Don't wait to complete
WshShell.Run """" & BatPath & """", 0, False
