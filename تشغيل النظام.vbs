' تشغيل نظام المحاسبة - يشغل السيرفر تلقائياً ويفتح المتصفح
Set WshShell = CreateObject("WScript.Shell")
' تشغيل السيرفر في الخلفية (نافذة مخفية)
WshShell.Run "dist\AccountingServer.exe 8000", 0, False
' انتظار 3 ثوانٍ حتى يشتغل السيرفر
WScript.Sleep 3000
' فتح المتصفح
WshShell.Run "http://localhost:8000"
