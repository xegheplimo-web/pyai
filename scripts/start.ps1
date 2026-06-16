# ============================================================
# MAS-OpenClaw Launcher Script
# Quick start all services and UI
# ============================================================

$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

Write-Host "`n🚀 MAS-OpenClaw Launcher" -ForegroundColor Cyan
Write-Host "=" * 40

# Check services
Write-Host "`n📋 Checking services..." -ForegroundColor Yellow

# Check SearXNG
try {
    $null = Invoke-WebRequest -Uri "http://localhost:8888" -TimeoutSec 3
    Write-Host "  ✅ SearXNG running" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️  SearXNG not running. Starting..." -ForegroundColor Yellow
    docker compose up -d searxng
    Start-Sleep -Seconds 5
}

# Check Ollama
try {
    $null = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 3
    Write-Host "  ✅ Ollama running" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️  Ollama not running. Starting..." -ForegroundColor Yellow
    # Try native first
    $ollamaProcess = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
    if (-not $ollamaProcess) {
        Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 5
    }
    # Fallback to Docker
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 3
    } catch {
        docker compose up -d ollama
        Start-Sleep -Seconds 10
    }
}

# Check model
$modelList = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5
$qwenInstalled = $modelList.models | Where-Object { $_.name -like "qwen2.5:14b*" }
if ($qwenInstalled) {
    Write-Host "  ✅ Qwen2.5:14b model loaded" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Qwen2.5:14b not found. Pulling..." -ForegroundColor Yellow
    ollama pull qwen2.5:14b
}

# Activate venv
if (Test-Path ".venv\Scripts\Activate.ps1") {
    & .\.venv\Scripts\Activate.ps1
} else {
    Write-Host "  ❌ Virtual environment not found. Run setup.ps1 first!" -ForegroundColor Red
    exit 1
}

# Choose mode
Write-Host "`n🎯 Choose mode:" -ForegroundColor Cyan
Write-Host "  1. 🌐 Web UI (Streamlit)"
Write-Host "  2. 💻 CLI Interactive"
Write-Host "  3. 📊 Both (Web UI + CLI)"
Write-Host "  4. ❌ Exit"

$choice = Read-Host "`nSelect (1-4)"

switch ($choice) {
    "1" {
        Write-Host "`n🌐 Starting Web UI..." -ForegroundColor Green
        streamlit run ui/app.py --server.port 8501 --server.address 0.0.0.0
    }
    "2" {
        Write-Host "`n💻 Starting CLI..." -ForegroundColor Green
        python -m agents.orchestrator
    }
    "3" {
        Write-Host "`n🚀 Starting both Web UI and CLI..." -ForegroundColor Green
        Start-Process streamlit -ArgumentList "run ui/app.py --server.port 8501 --server.address 0.0.0.0" -NoNewWindow
        Write-Host "  Web UI: http://localhost:8501" -ForegroundColor Cyan
        Start-Sleep -Seconds 3
        python -m agents.orchestrator
    }
    "4" {
        Write-Host "👋 Bye!" -ForegroundColor Yellow
        exit 0
    }
    default {
        Write-Host "Invalid choice. Starting Web UI..." -ForegroundColor Yellow
        streamlit run ui/app.py --server.port 8501 --server.address 0.0.0.0
    }
}
