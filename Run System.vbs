' Launch Accounting System - starts server automatically and opens browser
Set WshShell = CreateObject("WScript.Shell")
' Run server in background (hidden window)
WshShell.Run "dist\AccountingServer.exe 8000", 0, False
' Wait 3 seconds for server to start
WScript.Sleep 3000
' Open browser
WshShell.Run "http://localhost:8000"
