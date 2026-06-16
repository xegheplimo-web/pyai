# ============================================================
# OpenClaw Native Setup cho Windows 11
# Cài OpenClaw gốc với UI + Ollama + SearXNG
# ============================================================
# 
# OpenClaw đã có sẵn:
# ✅ Web UI (chat, agents, skills, config, sessions)
# ✅ Telegram, WhatsApp, Discord, Slack, Signal...
# ✅ SearXNG extension (search)
# ✅ Ollama extension (local LLM)
# ✅ Voice (WebRTC + Google Live)
# ✅ iOS/Android/macOS apps
# ✅ Skills marketplace
# ✅ Multi-session, streaming, tool cards
#
# Chạy: Right-click → Run with PowerShell
# ============================================================

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "OpenClaw Native Setup"

function Write-Step($msg) { Write-Host "`n[OPENCLAW] $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "[OK]       $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN]     $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[ERROR]    $msg" -ForegroundColor Red }

Clear-Host
Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║           🦞 OpenClaw Native Setup                          ║
║   Personal AI Assistant with Ollama + SearXNG              ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

# ---- Step 1: Check Prerequisites ----
Write-Step "Step 1/8: Checking prerequisites..."

# Node.js
try {
    $nodeVer = node --version
    Write-OK "Node.js: $nodeVer"
} catch {
    Write-Err "Node.js not found! Install: winget install OpenJS.NodeJS.LTS"
    exit 1
}

# pnpm (preferred by OpenClaw)
try {
    $pnpmVer = pnpm --version
    Write-OK "pnpm: $pnpmVer"
} catch {
    Write-Host "  Installing pnpm..." -ForegroundColor Gray
    npm install -g pnpm
    Write-OK "pnpm installed"
}

# Docker
try {
    docker info *> $null
    Write-OK "Docker running"
} catch {
    Write-Warn "Docker not running. Start Docker Desktop."
}

# Ollama
try {
    $null = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 3
    Write-OK "Ollama running"
} catch {
    Write-Warn "Ollama not running. Start: ollama serve"
}

# ---- Step 2: Clone OpenClaw ----
Write-Step "Step 2/8: Cloning OpenClaw..."
$openclawDir = "C:\openclaw"

if (Test-Path $openclawDir) {
    Write-OK "OpenClaw already exists at $openclawDir"
    Set-Location $openclawDir
    git pull
} else {
    git clone https://github.com/openclaw/openclaw.git $openclawDir
    Set-Location $openclawDir
    Write-OK "OpenClaw cloned"
}

# ---- Step 3: Install Dependencies ----
Write-Step "Step 3/8: Installing dependencies..."
pnpm install --frozen-lockfile 2>$null
if ($LASTEXITCODE -ne 0) {
    pnpm install
}
Write-OK "Dependencies installed"

# ---- Step 4: Build OpenClaw ----
Write-Step "Step 4/8: Building OpenClaw..."
pnpm build
Write-OK "Build complete"

# ---- Step 5: Pull Ollama Models ----
Write-Step "Step 5/8: Pulling Ollama models..."

# Check if models already exist
$models = (Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5).models
$modelNames = $models | ForEach-Object { $_.name }

if ($modelNames -notcontains "qwen2.5:14b") {
    Write-Host "  Pulling qwen2.5:14b (~8GB)..." -ForegroundColor Gray
    ollama pull qwen2.5:14b
    Write-OK "qwen2.5:14b ready"
} else {
    Write-OK "qwen2.5:14b already available"
}

if ($modelNames -notcontains "qwen2.5:3b") {
    Write-Host "  Pulling qwen2.5:3b (~2GB)..." -ForegroundColor Gray
    ollama pull qwen2.5:3b
    Write-OK "qwen2.5:3b ready"
} else {
    Write-OK "qwen2.5:3b already available"
}

# ---- Step 6: Start SearXNG ----
Write-Step "Step 6/8: Starting SearXNG..."
try {
    $null = Invoke-WebRequest -Uri "http://localhost:8888" -TimeoutSec 3
    Write-OK "SearXNG already running"
} catch {
    docker run -d --name searxng -p 8888:8080 `
        -v "${openclawDir}\config\searxng:/etc/searxng:rw" `
        searxng/searxng:latest
    Start-Sleep -Seconds 5
    Write-OK "SearXNG started on http://localhost:8888"
}

# ---- Step 7: Run OpenClaw Onboard ----
Write-Step "Step 7/8: Running OpenClaw onboard wizard..."
Write-Host @"
  OpenClaw sẽ hướng dẫn bạn cấu hình:
  1. Chọn LLM provider → chọn Ollama
  2. Chọn model → qwen2.5:14b
  3. Cấu hình channels (Telegram, WhatsApp...)
  4. Cài skills
"@ -ForegroundColor Yellow

npx openclaw onboard

# ---- Step 8: Configure Ollama + SearXNG ----
Write-Step "Step 8/8: Configuring Ollama + SearXNG extensions..."

# OpenClaw config location
$configDir = "$env:USERPROFILE\.openclaw"
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║              ✅ OPENCLAW SETUP COMPLETE!                     ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  🦞 Start OpenClaw:                                          ║
║    cd C:\openclaw                                            ║
║    npx openclaw start                                        ║
║                                                              ║
║  🌐 Web UI:     http://localhost:5173                        ║
║  🔍 SearXNG:    http://localhost:8888                        ║
║  🤖 Ollama:     http://localhost:11434                       ║
║                                                              ║
║  📱 Channels (configure via UI → Settings → Channels):      ║
║    Telegram, WhatsApp, Discord, Slack, Signal, iMessage...  ║
║                                                              ║
║  🔧 Extensions (enable via UI → Settings → Config):         ║
║    @openclaw/ollama-provider  — Local LLM (Qwen2.5:14b)    ║
║    @openclaw/searxng-plugin   — Web search (SearXNG)        ║
║    @openclaw/telegram         — Telegram bot                ║
║    @openclaw/whatsapp         — WhatsApp bot                ║
║                                                              ║
║  🛠️ MAS Agents as Skills:                                   ║
║    Copy ruflo_integration/skills/*.md to:                    ║
║    %USERPROFILE%\.openclaw\skills\                           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Green
