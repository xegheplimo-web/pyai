# ============================================================
# Hive + MAS-OpenClaw Setup Script
# Cài đặt Hive và tích hợp với MAS-OpenClaw
# ============================================================

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Hive + MAS-OpenClaw Setup"

function Write-Step($msg) { Write-Host "`n[HIVE] $msg" -ForegroundColor Magenta }
function Write-OK($msg)   { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[ERROR] $msg" -ForegroundColor Red }

Clear-Host
Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║          🐝 Hive + MAS-OpenClaw Integration Setup           ║
║   Production Harness + Multi-Agent Search System            ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Magenta

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Split-Path -Parent (Split-Path -Parent $projectDir))

# ---- Step 1: Check MAS-OpenClaw ----
Write-Step "Step 1/5: Checking MAS-OpenClaw..."
if (Test-Path "agents\orchestrator.py") {
    Write-OK "MAS-OpenClaw found"
} else {
    Write-Err "MAS-OpenClaw not found! Run setup.ps1 first."
    exit 1
}

# Check Ollama
try {
    $null = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 3
    Write-OK "Ollama running"
} catch {
    Write-Warn "Ollama not running. Start it: ollama serve"
}

# Check SearXNG
try {
    $null = Invoke-WebRequest -Uri "http://localhost:8888/healthz" -TimeoutSec 3
    Write-OK "SearXNG running"
} catch {
    Write-Warn "SearXNG not running. Start it: docker compose up -d searxng"
}

# ---- Step 2: Install Hive ----
Write-Step "Step 2/5: Setting up Hive..."
$hiveDir = "$env:USERPROFILE\hive"

if (Test-Path $hiveDir) {
    Write-OK "Hive directory found at $hiveDir"
} else {
    Write-Host "  Cloning Hive repository..." -ForegroundColor Gray
    git clone https://github.com/aden-hive/hive.git $hiveDir
    Write-OK "Hive cloned"
}

# Run Hive quickstart
if (-not (Test-Path "$hiveDir\core\.venv")) {
    Write-Host "  Running Hive quickstart..." -ForegroundColor Gray
    Push-Location $hiveDir
    .\quickstart.ps1
    Pop-Location
    Write-OK "Hive quickstart completed"
} else {
    Write-OK "Hive already set up"
}

# ---- Step 3: Install uv (Hive dependency) ----
Write-Step "Step 3/5: Checking uv package manager..."
try {
    $uvVer = uv --version
    Write-OK "uv: $uvVer"
} catch {
    Write-Host "  Installing uv..." -ForegroundColor Gray
    pip install uv
    Write-OK "uv installed"
}

# ---- Step 4: Register MCP Tools ----
Write-Step "Step 4/5: Registering MAS-OpenClaw tools with Hive..."

# Generate .mcp.json
$mcpConfig = @{
    mcpServers = @{
        "mas-openclaw" = @{
            command = "python"
            args = @("-m", "hive_integration.tools.mcp_server")
            env = @{
                SEARXNG_HOST = "http://localhost:8888"
                OLLAMA_HOST = "http://localhost:11434"
            }
            tools = @(
                "searxng_search",
                "multi_category_search",
                "web_scraper",
                "batch_web_scraper",
                "document_reader"
            )
        }
    }
}

$mcpJson = $mcpConfig | ConvertTo-Json -Depth 5
$mcpJson | Set-Content -Path ".mcp.json" -Encoding UTF8
Write-OK ".mcp.json created"

# Also copy to Hive directory
Copy-Item ".mcp.json" "$hiveDir\.mcp.json" -Force
Write-OK "MCP config copied to Hive"

# ---- Step 5: Create Hive Agent ----
Write-Step "Step 5/5: Creating Hive agent with MAS tools..."

$agentDir = "$hiveDir\exports\mas-researcher"
New-Item -ItemType Directory -Path $agentDir -Force | Out-Null

# agent.json
$agentJson = @{
    name = "mas-researcher"
    description = "MAS-OpenClaw research agent with SearXNG search and deep web analysis"
    model = "ollama/qwen2.5:14b"
    nodes = @(
        @{
            id = "orchestrator"
            type = "event_loop"
            model = "ollama/qwen2.5:14b"
            description = "Dieu phat nghien cuu - phan tich query, lap ke hoach"
            tools = @("searxng_search", "delegate_to_sub_agent")
        },
        @{
            id = "search"
            type = "event_loop"
            model = "ollama/qwen2.5:14b"
            description = "Tim kiem da nguon qua SearXNG"
            tools = @("searxng_search", "multi_category_search", "web_scraper")
        },
        @{
            id = "research"
            type = "event_loop"
            model = "ollama/qwen2.5:14b"
            description = "Doc sau va trich xuat thong tin tu nguon"
            tools = @("web_scraper", "batch_web_scraper", "document_reader")
        },
        @{
            id = "analysis"
            type = "event_loop"
            model = "ollama/qwen2.5:14b"
            description = "Phan tich cheo, xac minh, danh gia da chieu"
            tools = @("searxng_search", "web_scraper")
        },
        @{
            id = "response"
            type = "event_loop"
            model = "ollama/qwen2.5:14b"
            description = "Tong hop cau tra loi hoan chinh voi trich dan"
            tools = @()
        }
    )
    edges = @(
        @{ from = "orchestrator"; to = "search"; condition = "success" },
        @{ from = "search"; to = "research"; condition = "success" },
        @{ from = "research"; to = "analysis"; condition = "success" },
        @{ from = "analysis"; to = "response"; condition = "success" },
        @{ from = "search"; to = "orchestrator"; condition = "failure" }
    )
} | ConvertTo-Json -Depth 5

$agentJson | Set-Content -Path "$agentDir\agent.json" -Encoding UTF8
Write-OK "Hive agent created"

# config.py
$configPy = @"
provider = "ollama"
model = "qwen2.5:14b"
api_base = "http://localhost:11434"
max_tokens = 4096
temperature = 0.3
"@
Set-Content -Path "$agentDir\config.py" -Value $configPy -Encoding UTF8
Write-OK "Agent config created"

# ---- Setup Complete ----
Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║              ✅ HIVE + MAS INTEGRATION COMPLETE!            ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  🐝 Hive:          $hiveDir                                  ║
║  🔍 MAS-OpenClaw:  $projectDir\..                            ║
║  📋 MCP Tools:     .mcp.json (5 tools registered)           ║
║                                                              ║
║  Usage:                                                      ║
║    cd $hiveDir                                               ║
║    hive run mas-researcher --goal "Nghien cuu ve..."         ║
║                                                              ║
║  Or use the bridge:                                          ║
║    python -m hive_integration.bridge                         ║
║                                                              ║
║  Benefits of Hive integration:                               ║
║    ✅ Crash recovery & self-healing                          ║
║    ✅ Judge evaluates output quality                         ║
║    ✅ Agent evolution (auto-improvement)                     ║
║    ✅ Cost tracking (free with local model!)                 ║
║    ✅ Human-in-the-loop oversight                            ║
║    ✅ Session isolation & audit trails                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Green
