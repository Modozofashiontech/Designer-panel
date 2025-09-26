@echo off
echo ========================================
echo Starting Designer Panel Services
echo ========================================
echo.

echo Starting Python Image Extraction Service...
start "Python Service" cmd /k "cd backend\python && python image_extraction.py"

echo Waiting 3 seconds for Python service to start...
timeout /t 3 /nobreak > nul

echo Starting Node.js Server...
start "Node.js Server" cmd /k "cd backend && npm start"

echo.
echo ========================================
echo Services are starting...
echo ========================================
echo Python Service: http://localhost:5001
echo Node.js Server: http://localhost:5000
echo React App: http://localhost:3000
echo.
echo Press any key to close this window...
pause > nul
