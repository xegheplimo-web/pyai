"""
MAS-OpenClaw × Ruflo × Hive — Triple Integration Orchestrator
Điều phối cả 3 tầng: OpenClaw Gateway → Ruflo Swarm → Hive Runtime

Kiến trúc:
┌─────────────────────────────────────────────────┐
│  OPENCLAW (Gateway)                              │
│  Telegram, WhatsApp, Web UI, CLI, API            │
│  Nhận message → Route → Gửi lên Ruflo           │
├─────────────────────────────────────────────────┤
│  RUFLO (Orchestration)                           │
│  Swarm coordination, SPARC, AgentDB + HNSW       │
│  Phân chia task → Delegate agents                │
│  Multi-LLM routing (3b routing + 14b deep)       │
├─────────────────────────────────────────────────┤
│  HIVE (Production Runtime)                       │
│  Crash recovery, Judge, Evolution, HITL          │
│  Execute agents → Monitor → Self-heal            │
└─────────────────────────────────────────────────┘

Fallback: Nếu Ruflo/Hive chưa cài → dùng CrewAI standalone
"""
import asyncio
import json
import time
from enum import Enum
from typing import Optional

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from utils.config import config
from utils.logger import log
from utils.memory import get_memory

console = Console()


class ExecutionMode(str, Enum):
    STANDALONE = "standalone"  # CrewAI only (no Ruflo/Hive)
    WITH_RUFLO = "ruflo"       # OpenClaw + Ruflo (no Hive)
    WITH_HIVE = "hive"          # OpenClaw + Hive (no Ruflo)
    TRIPLE = "triple"           # OpenClaw + Ruflo + Hive (full stack)


class TripleOrchestrator:
    """
    Unified orchestrator for the OpenClaw × Ruflo × Hive stack.
    
    Automatically detects available components and routes accordingly.
    Falls back gracefully when components are missing.
    """

    def __init__(self):
        self.memory = get_memory()
        self.mode = self._detect_mode()
        self._init_bridges()

    def _detect_mode(self) -> ExecutionMode:
        """Auto-detect which components are available."""
        ruflo = self._check_ruflo()
        hive = self._check_hive()

        if ruflo and hive:
            mode = ExecutionMode.TRIPLE
        elif ruflo:
            mode = ExecutionMode.WITH_RUFLO
        elif hive:
            mode = ExecutionMode.WITH_HIVE
        else:
            mode = ExecutionMode.STANDALONE

        icons = {
            ExecutionMode.TRIPLE: "🔗",
            ExecutionMode.WITH_RUFLO: "🧠",
            ExecutionMode.WITH_HIVE: "🐝",
            ExecutionMode.STANDALONE: "🤖",
        }

        console.print(Panel(
            f"[bold]{icons[mode]} Execution Mode: {mode.value.upper()}[/bold]\n\n"
            f"  OpenClaw: ✅\n"
            f"  Ruflo:    {'✅' if ruflo else '❌'}\n"
            f"  Hive:     {'✅' if hive else '❌'}\n\n"
            f"  {'→ Full triple integration!' if mode == ExecutionMode.TRIPLE else '→ Install missing components for full stack'}",
            border_style="magenta",
        ))

        return mode

    def _check_ruflo(self) -> bool:
        """Check Ruflo availability."""
        import subprocess
        try:
            result = subprocess.run(
                ["npx", "ruflo", "--version"],
                capture_output=True, text=True, timeout=10,
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False

    def _check_hive(self) -> bool:
        """Check Hive availability."""
        from pathlib import Path
        candidates = [Path.home() / "hive", Path("C:/hive"), Path("D:/hive")]
        return any(p.exists() for p in candidates)

    def _init_bridges(self):
        """Initialize bridge layers based on available components."""
        self.oc_ruflo_bridge = None
        self.ruflo_hive_bridge = None

        if self.mode in (ExecutionMode.WITH_RUFLO, ExecutionMode.TRIPLE):
            from ruflo_integration.bridges.openclaw_ruflo_bridge import OpenClawRufloBridge
            self.oc_ruflo_bridge = OpenClawRufloBridge()

        if self.mode in (ExecutionMode.WITH_HIVE, ExecutionMode.TRIPLE):
            from ruflo_integration.bridges.ruflo_hive_bridge import RufloHiveBridge
            self.ruflo_hive_bridge = RufloHiveBridge()

    async def research(self, query: str, depth: str = "deep") -> str:
        """
        Execute research using the best available stack.
        
        Routing logic:
        - Simple query → Local model (fast)
        - Complex query + Ruflo → Ruflo swarm (intelligent)
        - Complex query + Ruflo + Hive → Ruflo swarm on Hive (production-grade)
        - No Ruflo/Hive → CrewAI standalone (reliable)
        """
        start = time.time()

        # Check cache
        cached = self.memory.get_cached_research(query, max_age_hours=24)
        if cached:
            console.print("[green]📋 Cache hit![/green]")
            return cached

        console.print(Panel(
            f"[bold cyan]Query:[/bold cyan] {query}\n"
            f"[bold cyan]Mode:[/bold cyan] {self.mode.value}\n"
            f"[bold cyan]Depth:[/bold cyan] {depth}",
            title="🔍 MAS Triple Research",
            border_style="cyan",
        ))

        result = None

        if self.mode == ExecutionMode.TRIPLE:
            # Full stack: OpenClaw → Ruflo → Hive
            result = await self._execute_triple(query, depth)

        elif self.mode == ExecutionMode.WITH_RUFLO:
            # OpenClaw + Ruflo (no Hive)
            result = await self._execute_with_ruflo(query, depth)

        elif self.mode == ExecutionMode.WITH_HIVE:
            # OpenClaw + Hive (no Ruflo)
            result = await self._execute_with_hive(query, depth)

        else:
            # Standalone CrewAI
            result = await self._execute_standalone(query, depth)

        # Cache result
        if result:
            self.memory.cache_research(query, depth, result)

        elapsed = time.time() - start
        console.print(f"\n[bold green]✅ Hoàn thành trong {elapsed:.1f}s[/bold green]")

        return result or "Không thể thực hiện nghiên cứu"

    async def _execute_triple(self, query: str, depth: str) -> str:
        """
        Full triple integration: OpenClaw → Ruflo (orchestrate) → Hive (execute).
        
        Ruflo decides WHAT to do and WHO does it.
        Hive ensures it RUNS RELIABLY with crash recovery.
        """
        console.print("[bold magenta]🔗 Triple Mode: OpenClaw → Ruflo → Hive[/bold magenta]")

        # Step 1: Ruflo classifies and creates swarm spec
        console.print("  🧠 Ruflo: Phân tích & tạo swarm spec...")
        route = self.oc_ruflo_bridge.classify_complexity(query)

        if route == "local":
            # Simple query → local model, no need for swarm
            return await self._execute_standalone(query, "quick")

        # Step 2: Create swarm specification
        topology = "mesh" if depth == "deep" else "hierarchical"
        agents = self._get_research_agents()

        swarm_spec = {
            "topology": topology,
            "agents": agents,
            "task": query,
        }

        # Step 3: Convert to Hive graph and execute
        console.print("  🐝 Hive: Chuyển swarm → agent graph & thực thi...")
        result = self.ruflo_hive_bridge.execute_via_hive(
            self.ruflo_hive_bridge.swarm_to_hive_graph(swarm_spec),
            query,
        )

        return result

    async def _execute_with_ruflo(self, query: str, depth: str) -> str:
        """OpenClaw + Ruflo (without Hive)."""
        console.print("[bold blue]🧠 Ruflo Mode: OpenClaw → Ruflo Swarm[/bold blue]")
        route_result = await self.oc_ruflo_bridge.route_message(
            query, session_id="default", depth=depth,
        )
        return route_result.get("result", "")

    async def _execute_with_hive(self, query: str, depth: str) -> str:
        """OpenClaw + Hive (without Ruflo)."""
        console.print("[bold yellow]🐝 Hive Mode: OpenClaw → Hive Runtime[/bold yellow]")
        from hive_integration.bridge import HiveMASBridge
        bridge = HiveMASBridge(mode="hybrid")
        return bridge.run_hive_mode(query)

    async def _execute_standalone(self, query: str, depth: str) -> str:
        """Standalone CrewAI mode (fallback)."""
        console.print("[bold green]🤖 Standalone Mode: CrewAI[/bold green]")
        from agents.orchestrator import MASOrchestrator, ResearchDepth
        depth_map = {
            "quick": ResearchDepth.QUICK,
            "standard": ResearchDepth.STANDARD,
            "deep": ResearchDepth.DEEP,
        }
        orchestrator = MASOrchestrator(depth=depth_map.get(depth, ResearchDepth.DEEP))
        
        if depth == "quick":
            return await asyncio.get_event_loop().run_in_executor(
                None, orchestrator.quick_search, query,
            )
        return await asyncio.get_event_loop().run_in_executor(
            None, orchestrator.research, query,
        )

    def _get_research_agents(self) -> list:
        """Get default research agent configuration."""
        return [
            {
                "name": "orchestrator",
                "role": "coordinator",
                "model": f"ollama/{config.OLLAMA_MODEL}",
                "tools": ["searxng_search", "delegate_to_sub_agent"],
                "description": "Điều phối nghiên cứu - phân tích query, lập kế hoạch",
            },
            {
                "name": "researcher",
                "role": "worker",
                "model": f"ollama/{config.OLLAMA_MODEL}",
                "tools": ["searxng_search", "multi_category_search", "web_scraper", "batch_web_scraper"],
                "description": "Tìm kiếm đa nguồn & đọc sâu",
            },
            {
                "name": "analyst",
                "role": "worker",
                "model": f"ollama/{config.OLLAMA_MODEL}",
                "tools": ["searxng_search", "web_scraper"],
                "description": "Phân tích chéo, xác minh, đánh giá bias",
            },
            {
                "name": "writer",
                "role": "worker",
                "model": f"ollama/{config.OLLAMA_MODEL}",
                "tools": [],
                "description": "Tổng hợp câu trả lời với trích dẫn",
            },
        ]

    def show_status(self):
        """Display comprehensive system status."""
        table = Table(title="🔍 MAS-OpenClaw Triple Integration Status")
        table.add_column("Component", style="cyan")
        table.add_column("Status", style="green")
        table.add_column("Details")

        # Core
        table.add_row("OpenClaw Gateway", "✅ Active", "Web UI, CLI, API, Telegram")
        table.add_row("SearXNG Search", "✅ Active" if self._check_searxng() else "❌ Down", f"{config.SEARXNG_HOST}")
        table.add_row("Ollama LLM", "✅ Active" if self._check_ollama() else "❌ Down", f"{config.OLLAMA_MODEL}")

        # Ruflo
        ruflo_status = "✅ Active" if self.mode in (ExecutionMode.WITH_RUFLO, ExecutionMode.TRIPLE) else "⚠️ Not installed"
        table.add_row("Ruflo Swarm", ruflo_status, "Swarm orchestration + AgentDB")

        # Hive
        hive_status = "✅ Active" if self.mode in (ExecutionMode.WITH_HIVE, ExecutionMode.TRIPLE) else "⚠️ Not installed"
        table.add_row("Hive Runtime", hive_status, "Production runtime + Judge")

        # Mode
        mode_colors = {
            ExecutionMode.TRIPLE: "[bold magenta]TRIPLE[/bold magenta]",
            ExecutionMode.WITH_RUFLO: "[bold blue]RUFLO[/bold blue]",
            ExecutionMode.WITH_HIVE: "[bold yellow]HIVE[/bold yellow]",
            ExecutionMode.STANDALONE: "[bold green]STANDALONE[/bold green]",
        }
        table.add_row("Execution Mode", mode_colors[self.mode], "Auto-detected")

        # Memory
        stats = self.memory.get_stats()
        table.add_row("Memory", "✅ Active", f"Conversations: {stats.get('conversations', 0)}, Cache: {stats.get('research_cache', 0)}")

        console.print(table)

    def _check_searxng(self) -> bool:
        import httpx
        try:
            r = httpx.get(f"{config.SEARXNG_HOST}/healthz", timeout=3)
            return r.status_code == 200
        except Exception:
            return False

    def _check_ollama(self) -> bool:
        import httpx
        try:
            r = httpx.get(f"{config.OLLAMA_HOST}/api/tags", timeout=3)
            return r.status_code == 200
        except Exception:
            return False


# ============================================================
# CLI Entry Point
# ============================================================
def main():
    """Run the triple integration orchestrator."""
    orchestrator = TripleOrchestrator()
    orchestrator.show_status()

    console.print("\n[bold]Lệnh:[/bold]")
    console.print("  /deep <query>   — Nghiên cứu sâu (full stack)")
    console.print("  /quick <query>  — Tìm kiếm nhanh")
    console.print("  /status         — Xem trạng thái hệ thống")
    console.print("  /quit           — Thoát\n")

    while True:
        try:
            user_input = console.input("[bold green]You>[/bold green] ").strip()
            if not user_input:
                continue

            if user_input == "/quit":
                break
            elif user_input == "/status":
                orchestrator.show_status()
            elif user_input.startswith("/quick "):
                result = asyncio.run(orchestrator.research(user_input[7:], depth="quick"))
                console.print(result)
            elif user_input.startswith("/deep "):
                result = asyncio.run(orchestrator.research(user_input[6:], depth="deep"))
                console.print(result)
            else:
                result = asyncio.run(orchestrator.research(user_input, depth="deep"))
                console.print(result)

        except KeyboardInterrupt:
            break


if __name__ == "__main__":
    main()
