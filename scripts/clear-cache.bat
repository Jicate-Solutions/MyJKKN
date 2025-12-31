@echo off
echo.
echo ========================================
echo  MyJKKN Cache Clearing Script
echo ========================================
echo.
echo Clearing Next.js cache...
rmdir /s /q .next\cache 2>nul
rmdir /s /q .next 2>nul
rmdir /s /q node_modules\.cache 2>nul
del /f /q .tsbuildinfo 2>nul

echo.
echo ========================================
echo  Cache cleared successfully!
echo ========================================
echo.
echo Next steps:
echo 1. In Chrome DevTools:
echo    - Go to Application ^> Service Workers
echo    - Click 'Unregister' for MyJKKN worker
echo    - Go to Application ^> Storage
echo    - Click 'Clear site data'
echo.
echo 2. Restart dev server:
echo    npm run dev
echo.
echo 3. Hard reload browser:
echo    Ctrl+Shift+R
echo.
pause
