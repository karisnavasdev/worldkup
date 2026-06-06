@echo off
cd /d "%~dp0"
echo Starting World Kup site with Admin API on port 5501...
echo Use http://127.0.0.1:5501/  (not Live Server - admin needs Node server)
"C:\Users\Administrator\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe" serve.js
pause
