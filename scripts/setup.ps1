# ============================================================
# MAS-OpenClaw Setup Script for Windows 11
# AMD Ryzen 9 9950X | 96GB RAM | RTX 3090 24GB | 4TB SSD
# ============================================================
# Run as Administrator: Right-click → Run with PowerShell

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "MAS-OpenClaw Setup"

# Colors
function Write-Step($msg) { Write-Host "`n[SETUP] $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[ERROR] $msg" -ForegroundColor Red }

Clear-Host
Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║                MAS-OpenClaw Setup Wizard                    ║
║   Multi-Agent System with Qwen2.5:14b on RTX 3090         ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Magenta

# ---- Hardware Check ----
Write-Step "Checking hardware..."
$gpu = nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>$null
if ($gpu) {
    Write-OK "GPU: $gpu"
} else {
    Write-Err "NVIDIA GPU not detected! Ensure drivers are installed."
    exit 1
}

$ram = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB
Write-OK "RAM: $([math]::Round($ram, 1)) GB"

# ---- Step 1: Check Docker ----
Write-Step "Step 1/6: Checking Docker..."
try {
    $dockerVer = docker --version
    Write-OK "Docker: $dockerVer"
} catch {
    Write-Err "Docker not found! Install Docker Desktop: https://docs.docker.com/desktop/install/windows-install/"
    Write-Host "  After installing, restart this script." -ForegroundColor Yellow
    exit 1
}

# Check Docker is running
try {
    docker info *> $null
    Write-OK "Docker daemon is running"
} catch {
    Write-Warn "Docker daemon not running. Starting Docker Desktop..."
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    Write-Host "  Waiting for Docker to start (30s)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
}

# ---- Step 2: Check Python ----
Write-Step "Step 2/6: Checking Python..."
try {
    $pyVer = python --version 2>&1
    Write-OK "Python: $pyVer"
} catch {
    Write-Err "Python 3.10+ not found! Install: https://www.python.org/downloads/"
    exit 1
}

# ---- Step 3: Check NVIDIA Container Toolkit ----
Write-Step "Step 3/6: Checking NVIDIA Container Toolkit..."
try {
    docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi *> $null
    Write-OK "NVIDIA Container Toolkit is working"
} catch {
    Write-Warn "NVIDIA Container Toolkit not configured."
    Write-Host "  Installing..." -ForegroundColor Yellow
    winget install NVIDIA.NVIDIAContainerToolkit 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Please install manually: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html" -ForegroundColor Yellow
    }
}

# ---- Step 4: Create virtual environment ----
Write-Step "Step 4/6: Setting up Python environment..."
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

if (-not (Test-Path ".venv")) {
    Write-Host "  Creating virtual environment..." -ForegroundColor Gray
    python -m venv .venv
    Write-OK "Virtual environment created"
} else {
    Write-OK "Virtual environment already exists"
}

# Activate venv
& .\.venv\Scripts\Activate.ps1
Write-OK "Virtual environment activated"

# ---- Step 5: Install dependencies ----
Write-Step "Step 5/6: Installing Python packages..."
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Warn "pip install from requirements.txt failed, trying pyproject.toml..."
    pip install -e . --quiet
}
Write-OK "Python packages installed"

# Install Playwright browsers
Write-Host "  Installing Playwright browsers..." -ForegroundColor Gray
playwright install chromium 2>$null
Write-OK "Playwright ready"

# ---- Step 6: Start Docker services ----
Write-Step "Step 6/6: Starting services..."

# Copy .env if not exists
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-OK "Created .env from .env.example"
}

# Start SearXNG and Ollama via Docker
docker compose up -d searxng
Write-OK "SearXNG started on http://localhost:8888"

# Check if Ollama is already running natively
$ollamaRunning = $false
try {
    $null = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 3
    $ollamaRunning = $true
    Write-OK "Ollama already running natively on http://localhost:11434"
} catch {}

if (-not $ollamaRunning) {
    Write-Host "  Starting Ollama via Docker..." -ForegroundColor Gray
    docker compose up -d ollama
    Write-OK "Ollama started on http://localhost:11434"
    
    # Wait for Ollama to be ready
    Write-Host "  Waiting for Ollama to be ready..." -ForegroundColor Gray
    $retries = 0
    while ($retries -lt 30) {
        try {
            $null = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 3
            break
        } catch {
            Start-Sleep -Seconds 2
            $retries++
        }
    }
}

# Pull Qwen2.5:14b model
Write-Step "Pulling Qwen2.5:14b model (this may take 10-20 minutes)..."
$ollamaCmd = "ollama"
if ($ollamaRunning) {
    # Native Ollama
    & $ollamaCmd pull qwen2.5:14b
} else {
    # Docker Ollama
    docker exec mas-ollama ollama pull qwen2.5:14b
}
Write-OK "Qwen2.5:14b model ready!"

# ---- Setup Complete ----
Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║                 ✅ SETUP COMPLETE!                          ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Services:                                                   ║
║    🔍 SearXNG:   http://localhost:8888                       ║
║    🤖 Ollama:    http://localhost:11434                      ║
║    🌐 Web UI:    http://localhost:8501                       ║
║                                                              ║
║  Quick Start:                                                ║
║    1. .\.venv\Scripts\Activate.ps1                           ║
║    2. python -m agents.orchestrator       (CLI mode)         ║
║    3. streamlit run ui/app.py             (Web UI mode)      ║
║                                                              ║
║  Or use the launcher:                                        ║
║    .\start.ps1                                               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Green
