@echo off
rem Builds the Google Maps scraper with the Windows fix (gosom/google-maps-scraper#322).
rem Needs Go installed: https://go.dev/dl/  (Windows .msi, default options)
cd /d "%~dp0bin\src\google-maps-scraper"
where go >nul 2>nul || (echo Go is not installed or not on PATH. Install from https://go.dev/dl/ then open a NEW terminal. & exit /b 1)
echo Building... (first build downloads Go modules, takes a few minutes)
go build -o "%~dp0bin\google-maps-scraper.exe" . || (echo Build failed. & exit /b 1)
echo.
echo Built: %~dp0bin\google-maps-scraper.exe
