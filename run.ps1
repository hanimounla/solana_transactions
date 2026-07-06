$root = Split-Path -Parent $MyInvocation.MyCommand.Path


# 1. Run Frontend service in background
Write-Host "Starting Frontend..." -ForegroundColor Cyan
Start-Process -NoNewWindow -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory "$root\fe"

# 2. Run Backend service in background
Write-Host "Starting Backend..." -ForegroundColor Cyan
Start-Process -NoNewWindow -FilePath "cargo" -ArgumentList "build" -WorkingDirectory "$root\be" -Wait
Start-Process -NoNewWindow -FilePath "$root\be\target\debug\be.exe" -WorkingDirectory "$root\be"
