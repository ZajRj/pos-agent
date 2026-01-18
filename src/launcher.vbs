Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = Replace(WScript.ScriptFullName, WScript.ScriptName, "")
' Run the executable hidden (0) and do not wait for return (false)
WshShell.Run "pos-agent.exe", 0, False
Set WshShell = Nothing
