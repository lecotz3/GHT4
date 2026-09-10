@echo off
cd /d "%~dp0"
node ferramentas/iniciar-agente.mjs
if errorlevel 1 pause
