@echo off
rem freavy app: orchestrator (:5918) + client (:5917)
cd /d "%~dp0"
start "freavy-server" /min cmd /c "pnpm --filter server dev"
start "freavy-client" /min cmd /c "pnpm --filter client dev"
echo freavy starting at http://localhost:5917
