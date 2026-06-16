"""
OpenClaw ↔ Ruflo Bridge
Chuyển message từ OpenClaw Gateway thành Ruflo Swarm tasks.

Data Flow:
  User (Telegram/Web) → OpenClaw Gateway → Bridge → Ruflo Swarm
                                                       ↕ AgentDB
  User ← OpenClaw Gateway ← Bridge ← Ruflo Result ←──┘

Vai trò:
- OpenClaw: Tiếp nhận từ Telegram, WhatsApp, Web UI, CLI
- Ruflo: Điều phối swarm, phân chia task, quản lý memory
- Bridge: Dịch message format, map session, đồng bộ memory
"""
import asyncio
import json
import subprocess
import time
from pathlib import Path
from typing import Optional

import httpx
from rich.console import Console
from rich.panel import Panel

from utils.config import config
from utils.logger import log
from utils.memory import get_memory

console = Console()


class OpenClawRufloBridge:
    """
    Bridge between OpenClaw Gateway and Ruflo Orchestration.
    
    Responsibilities:
    1. Convert OpenClaw messages → Ruflo swarm tasks
    2. Map OpenClaw sessions → Ruflo swarm IDs
    3. Sync OpenClaw Markdown memory ↔ Ruflo AgentDB
    4. Route simple queries to local model, complex to Ruflo
    """

    def __init__(self):
        self.memory = get_memory()
        self.ruflo_available = self._check_ruflo()
        self.session_map = {}  # openclaw_session → ruflo_swarm_id

    def _check_ruflo(self) -> bool:
        """Check if Ruflo CLI is available."""
        try:
            result = subprocess.run(
                ["npx", "ruflo", "--version"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                log.info(f"[green]Ruflo available: {result.stdout.strip()}[/green]")
                return True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        log.warning("[yellow]Ruflo not found. Install: npx ruflo@latest init[/yellow]")
        return False

    def classify_complexity(self, query: str) -> str:
        """
        Phân loại query → quyết định routing.
        
        Returns:
          "local" — Xử lý bằng local model (quick, simple)
          "ruflo_swarm" — Gửi cho Ruflo swarm (complex, multi-step)
          "ruflo_coding" — Gửi cho Ruflo coding swarm
        """
        # Simple queries → local
        simple_patterns = [
            "thời tiết", "mấy giờ", "tính", "đổi", "dịch",
            "what is", "define", "calculate", "convert",
        ]
        query_lower = query.lower()
        if any(p in query_lower for p in simple_patterns) and len(query) < 50:
            return "local"

        # Coding tasks → ruflo_coding
        coding_patterns = [
            "viết code", "implement", "refactor", "debug",
            "fix bug", "code review", "build", "deploy",
            "write a function", "create api",
        ]
        if any(p in query_lower for p in coding_patterns):
            return "ruflo_coding"

        # Research tasks → ruflo_swarm
        research_patterns = [
            "nghiên cứu", "phân tích", "so sánh", "đánh giá",
            "research", "analyze", "compare", "evaluate",
            "tại sao", "giải thích", "how does", "explain",
        ]
        if any(p in query_lower for p in research_patterns):
            return "ruflo_swarm"

        # Default → ruflo_swarm for complex, local for short
        return "ruflo_swarm" if len(query) > 30 else "local"

    async def route_message(
        self,
        query: str,
        session_id: str = "default",
        channel: str = "web",
        depth: str = "deep",
    ) -> dict:
        """
        Route a message from OpenClaw to the appropriate handler.
        
        Returns:
          {"handler": "local"|"ruflo_swarm"|"ruflo_coding", "result": ...}
        """
        route = self.classify_complexity(query)
        
        log.info(f"[cyan]Routing:[/cyan] {route} ← {query[:50]}...")

        if route == "local":
            # Handle with local model (fast)
            result = await self._handle_local(query)
        elif route == "ruflo_swarm":
            # Route to Ruflo research swarm
            result = await self._handle_ruflo_swarm(query, session_id, depth)
        elif route == "ruflo_coding":
            # Route to Ruflo coding swarm
            result = await self._handle_ruflo_coding(query, session_id)
        else:
            result = await self._handle_local(query)

        # Save to shared memory
        self.memory.save_conversation(session_id, "user", query, {"channel": channel, "route": route})
        self.memory.save_conversation(session_id, "assistant", str(result)[:500], {"route": route})

        return {"handler": route, "result": result}

    async def _handle_local(self, query: str) -> str:
        """Handle simple queries with local model directly."""
        from agents.orchestrator import MASOrchestrator, ResearchDepth
        
        # Check cache
        cached = self.memory.get_cached_research(query, max_age_hours=24)
        if cached:
            return cached

        orchestrator = MASOrchestrator(depth=ResearchDepth.QUICK)
        result = await asyncio.get_event_loop().run_in_executor(
            None, orchestrator.quick_search, query,
        )
        self.memory.cache_research(query, "quick", result)
        return result

    async def _handle_ruflo_swarm(self, query: str, session_id: str, depth: str = "deep") -> str:
        """Route to Ruflo for multi-agent swarm research."""
        if not self.ruflo_available:
            log.warning("[yellow]Ruflo not available, falling back to CrewAI[/yellow]")
            from agents.orchestrator import MASOrchestrator, ResearchDepth
            depth_enum = ResearchDepth.DEEP if depth == "deep" else ResearchDepth.STANDARD
            orchestrator = MASOrchestrator(depth=depth_enum)
            return await asyncio.get_event_loop().run_in_executor(
                None, orchestrator.research, query,
            )

        # Create swarm via Ruflo CLI
        try:
            # Initialize swarm with appropriate topology
            topology = "mesh" if depth == "deep" else "hierarchical"
            
            cmd = [
                "npx", "ruflo", "swarm", "spawn",
                "--topology", topology,
                "--task", query,
                "--agents", "researcher,analyst,writer",
                "--model", f"ollama/{config.OLLAMA_MODEL}",
                "--memory", "shared",
            ]

            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=300,
            )

            if result.returncode == 0:
                swarm_id = result.stdout.strip().split("\n")[-1] if result.stdout else "unknown"
                self.session_map[session_id] = swarm_id

                # Wait for swarm completion
                completion = subprocess.run(
                    ["npx", "ruflo", "swarm", "status", swarm_id],
                    capture_output=True, text=True, timeout=600,
                )

                if completion.returncode == 0:
                    output = completion.stdout
                    self.memory.cache_research(query, depth, output)
                    return output
            else:
                log.error(f"Ruflo swarm error: {result.stderr}")
                # Fallback to CrewAI
                from agents.orchestrator import MASOrchestrator, ResearchDepth
                orchestrator = MASOrchestrator(depth=ResearchDepth.DEEP)
                return await asyncio.get_event_loop().run_in_executor(
                    None, orchestrator.research, query,
                )

        except subprocess.TimeoutExpired:
            log.error("Ruflo swarm timeout")
            return "Lỗi: Swarm research quá thời gian (timeout 5 phút)"

        return "Lỗi: Không thể khởi tạo Ruflo swarm"

    async def _handle_ruflo_coding(self, query: str, session_id: str) -> str:
        """Route to Ruflo for coding swarm tasks."""
        if not self.ruflo_available:
            return "Ruflo chưa cài. Cài: npx ruflo@latest init"

        try:
            cmd = [
                "npx", "ruflo", "swarm", "spawn",
                "--topology", "hierarchical",
                "--task", query,
                "--agents", "coder,tester,reviewer,architect",
                "--model", f"ollama/{config.OLLAMA_MODEL}",
                "--sparc",
            ]

            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=600,
            )

            if result.returncode == 0:
                return result.stdout
            else:
                return f"Lỗi coding swarm: {result.stderr[:200]}"

        except subprocess.TimeoutExpired:
            return "Lỗi: Coding swarm quá thời gian"

    def sync_memory(self):
        """
        Đồng bộ memory giữa OpenClaw (Markdown) và Ruflo (AgentDB).
        
        OpenClaw writes: MEMORY.md, memory/YYYY-MM-DD.md
        Ruflo reads: AgentDB with HNSW vector search
        """
        # Write recent research cache to OpenClaw MEMORY.md format
        memory_dir = Path(config.DATA_DIR) / "openclaw_memory"
        memory_dir.mkdir(parents=True, exist_ok=True)

        # Generate MEMORY.md from research cache
        recent = self.memory.conn.execute(
            "SELECT query, depth, result, created_at FROM research_cache ORDER BY created_at DESC LIMIT 20"
        ).fetchall()

        memory_md = "# MAS-OpenClaw Memory\n\n"
        for row in recent:
            memory_md += f"## {row['query']}\n"
            memory_md += f"Depth: {row['depth']} | Time: {row['created_at']}\n\n"
            memory_md += f"{row['result'][:500]}...\n\n---\n\n"

        (memory_dir / "MEMORY.md").write_text(memory_md, encoding="utf-8")
        log.info("[green]Synced memory to OpenClaw format[/green]")

    def get_status(self) -> dict:
        """Get bridge status."""
        return {
            "ruflo_available": self.ruflo_available,
            "active_sessions": len(self.session_map),
            "memory_stats": self.memory.get_stats(),
        }
