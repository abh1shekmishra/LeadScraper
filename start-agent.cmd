@echo off
rem One click every morning: dashboard (minimised) + agent, then the activity panel.
rem Safe to click twice: a second agent refuses to start, so nothing is sent twice.
cd /d "%~dp0"
start "LeadScraper dashboard" /min cmd /k npm run dev
start "LeadScraper agent" cmd /k npm run agent
rem Wait for the dashboard to answer (up to ~60s), then open the activity panel.
powershell -NoProfile -Command "for ($i=0; $i -lt 30; $i++) { try { Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/activity -TimeoutSec 5 | Out-Null; break } catch { Start-Sleep -Seconds 2 } }"
start "" http://localhost:3000/activity
