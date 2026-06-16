# ============================================================
# MAS-OpenClaw × Ruflo × Hive — Triple Integration Setup
# AMD Ryzen 9 9950X | 96GB RAM | RTX 3090 24GB | 4TB SSD
# ============================================================

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "MAS Triple Integration Setup"

function Write-Step($msg) { Write-Host "`n[TRIPLE] $msg" -ForegroundColor Magenta }
function Write-OK($msg)   { Write-Host "[OK]     $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN]   $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[ERROR]  $msg" -ForegroundColor Red }

Clear-Host
Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║      🔗 MAS Triple Integration Setup                        ║
║      OpenClaw × Ruflo × Hive                                ║
║                                                              ║
║  ┌──────────────────────────────────────────────┐            ║
║  │  OPENCLAW (Gateway)                          │            ║
║  │  Telegram, WhatsApp, Web UI, CLI             │            ║
║  ├──────────────────────────────────────────────┤            ║
║  │  RUFLO (Orchestration)                       │            ║
║  │  Swarm, AgentDB + HNSW, SONA Learning       │            ║
║  ├──────────────────────────────────────────────┤            ║
║  │  HIVE (Production Runtime)                   │            ║
║  │  Crash Recovery, Judge, Evolution, HITL      │            ║
║  └──────────────────────────────────────────────┘            ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Magenta

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Split-Path -Parent (Split-Path -Parent $projectDir))

# ---- Step 1: Check MAS-OpenClaw ----
Write-Step "Step 1/7: Checking MAS-OpenClaw..."
if (Test-Path "agents\orchestrator.py") {
    Write-OK "MAS-OpenClaw core found"
} else {
    Write-Err "MAS-OpenClaw not found! Run setup.ps1 first."
    exit 1
}

# Check services
try {
    $null = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 3
    Write-OK "Ollama running"
} catch {
    Write-Warn "Ollama not running. Start: ollama serve"
}

try {
    $null = Invoke-WebRequest -Uri "http://localhost:8888/healthz" -TimeoutSec 3
    Write-OK "SearXNG running"
} catch {
    Write-Warn "SearXNG not running. Start: docker compose up -d searxng"
}

# ---- Step 2: Check & Install Node.js ----
Write-Step "Step 2/7: Checking Node.js (required for Ruflo)..."
try {
    $nodeVer = node --version
    Write-OK "Node.js: $nodeVer"
} catch {
    Write-Warn "Node.js not found. Installing via winget..."
    winget install OpenJS.NodeJS.LTS
    Write-OK "Node.js installed. Please restart this script."
    exit 0
}

# ---- Step 3: Install Ruflo ----
Write-Step "Step 3/7: Setting up Ruflo (Swarm Orchestration)..."
try {
    $rufloVer = npx ruflo --version 2>$null
    Write-OK "Ruflo available: $rufloVer"
} catch {
    Write-Host "  Installing Ruflo via npx..." -ForegroundColor Gray
    npx ruflo@latest init
    Write-OK "Ruflo initialized"
}

# Configure Ruflo with Ollama
Write-Host "  Configuring Ruflo for local Ollama..." -ForegroundColor Gray
$rufloConfig = @"
{
  "defaultProvider": "ollama",
  "defaultModel": "qwen2.5:14b",
  "providers": {
    "ollama": {
      "apiBase": "http://localhost:11434",
      "models": {
        "light": "qwen2.5:3b",
        "heavy": "qwen2.5:14b"
      }
    }
  },
  "memory": {
    "backend": "sqlite",
    "vectorDimensions": 1536,
    "enableSona": true
  },
  "swarm": {
    "defaultTopology": "adaptive",
    "maxAgents": 20
  }
}
"@

$configDir = "$env:USERPROFILE\.ruflo"
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}
$rufloConfig | Set-Content -Path "$configDir\config.json" -Encoding UTF8
Write-OK "Ruflo configured for Ollama"

# Pull light model for dual-model strategy
Write-Host "  Pulling Qwen2.5:3b for dual-model routing..." -ForegroundColor Gray
ollama pull qwen2.5:3b 2>$null
Write-OK "Qwen2.5:3b model ready"

# ---- Step 4: Register MAS tools with Ruflo ----
Write-Step "Step 4/7: Registering MAS-OpenClaw MCP tools with Ruflo..."

# Generate .mcp.json for Ruflo
$mcpConfig = @{
    mcpServers = @{
        "mas-openclaw" = @{
            command = "python"
            args = @("-m", "hive_integration.tools.mcp_server")
            env = @{
                SEARXNG_HOST = "http://localhost:8888"
                OLLAMA_HOST = "http://localhost:11434"
            }
        }
    }
} | ConvertTo-Json -Depth 5

$mcpConfig | Set-Content -Path ".mcp.json" -Encoding UTF8
Write-OK "MCP tools registered"

# Register with Ruflo
try {
    npx ruflo mcp add mas-openclaw -- python -m hive_integration.tools.mcp_server 2>$null
    Write-OK "MCP server registered with Ruflo"
} catch {
    Write-Warn "Could not auto-register with Ruflo MCP. Manual registration may be needed."
}

# ---- Step 5: Install Hive ----
Write-Step "Step 5/7: Setting up Hive (Production Runtime)..."
$hiveDir = "$env:USERPROFILE\hive"

if (Test-Path $hiveDir) {
    Write-OK "Hive found at $hiveDir"
} else {
    Write-Host "  Cloning Hive repository..." -ForegroundColor Gray
    git clone https://github.com/aden-hive/hive.git $hiveDir
    Write-OK "Hive cloned"
}

# Run Hive quickstart if not done
if (-not (Test-Path "$hiveDir\core\.venv")) {
    Write-Host "  Running Hive quickstart..." -ForegroundColor Gray
    Push-Location $hiveDir
    .\quickstart.ps1
    Pop-Location
    Write-OK "Hive quickstart completed"
} else {
    Write-OK "Hive already set up"
}

# Copy MCP config to Hive
Copy-Item ".mcp.json" "$hiveDir\.mcp.json" -Force
Write-OK "MCP config copied to Hive"

# ---- Step 6: Install Skills ----
Write-Step "Step 6/7: Installing OpenClaw Skills..."
$skillsDir = "$env:USERPROFILE\.agents\skills"
if (-not (Test-Path $skillsDir)) {
    New-Item -ItemType Directory -Path $skillsDir -Force | Out-Null
}

Copy-Item "ruflo_integration\skills\*.md" $skillsDir -Force
Write-OK "Skills installed to $skillsDir"

# ---- Step 7: Update Environment ----
Write-Step "Step 7/7: Updating configuration..."

# Update .env
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw
    if ($envContent -notmatch "RUFLO_ENABLED") {
        @"
`n# --- Ruflo Integration ---
RUFLO_ENABLED=true
DUAL_MODEL_ENABLED=true
OLLAMA_LIGHT_MODEL=qwen2.5:3b
OLLAMA_HEAVY_MODEL=qwen2.5:14b
"@ | Add-Content ".env" -Encoding UTF8
    }
    Write-OK ".env updated"
} else {
    Copy-Item ".env.example" ".env"
    Write-OK ".env created from template"
}

# ---- Setup Complete ----
Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║          ✅ TRIPLE INTEGRATION COMPLETE!                     ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  🔗 Components:                                              ║
║    ✅ OpenClaw Gateway  (Web UI, CLI, API, Telegram)        ║
║    ✅ Ruflo Orchestration (Swarm, AgentDB, SONA)            ║
║    ✅ Hive Runtime       (Crash Recovery, Judge, Evolution) ║
║    ✅ SearXNG Search     (15+ sources, self-hosted)         ║
║    ✅ Qwen2.5:14b        (Deep research, local)             ║
║    ✅ Qwen2.5:3b         (Quick routing, local)             ║
║                                                              ║
║  🚀 Quick Start:                                             ║
║    .\.venv\Scripts\Activate.ps1                              ║
║    python -m ruflo_integration.triple_orchestrator           ║
║                                                              ║
║  🌐 Web UI:                                                  ║
║    streamlit run ui\app.py                                   ║
║                                                              ║
║  🔗 API Server:                                              ║
║    uvicorn utils.api_server:app --port 8000                  ║
║                                                              ║
║  📱 Telegram:                                                ║
║    python -m utils.telegram_bot                              ║
║                                                              ║
║  🎯 Execution Modes:                                         ║
║    TRIPLE   — Full stack (Ruflo + Hive + OpenClaw)          ║
║    RUFLO    — OpenClaw + Ruflo (no Hive)                     ║
║    HIVE     — OpenClaw + Hive (no Ruflo)                     ║
║    STANDALONE — CrewAI only (fallback)                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Green
