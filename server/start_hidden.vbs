Set WshShell = CreateObject("WScript.Shell")
' Cambia a la ruta del servidor y ejecuta npm start en modo oculto (0)
WshShell.CurrentDirectory = "C:\Users\jeanp\.gemini\antigravity\scratch\yape-monitor\server"
WshShell.Run "cmd /c npm start", 0, false
