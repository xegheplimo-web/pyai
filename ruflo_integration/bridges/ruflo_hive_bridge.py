"""
Ruflo ↔ Hive Bridge
Kết nối swarm orchestration của Ruflo với production runtime của Hive.

Data Flow:
  Ruflo Swarm Task → Bridge → Hive Agent Graph → Execution
                                     ↕
  Ruflo Swarm Result ← Bridge ← Hive Result ←────┘

Vai trò:
- Ruflo: Quyết định CÁN GÌ, AI LÀM, THEO THỨ TỰ NÀO (swarm + SPARC)
- Hive: Đảm bảo CHẠY ỔN ĐỊNH (crash recovery, judge, evolution)
- Bridge: Dịch Ruflo swarm spec → Hive agent graph, đồng bộ state
"""
import asyncio
import json
import subprocess
import time
from pathlib import Path
from typing import Optional

from rich.console import Console
from rich.panel import Panel

from utils.config import config
from utils.logger import log

console = Console()


class RufloHiveBridge:
    """
    Bridge between Ruflo Orchestration and Hive Production Runtime.
    
    Responsibilities:
    1. Convert Ruflo swarm topology → Hive agent graph (nodes + edges)
    2. Register MAS-OpenClaw MCP tools with both Ruflo and Hive
    3. Map Ruflo swarm results → Hive execution logs
    4. Sync memory: Ruflo AgentDB ↔ Hive Data Buffer
    5. Propagate Hive Judge verdicts back to Ruflo
    """

    def __init__(self):
        self.hive_dir = self._find_hive()
        self.ruflo_available = self._check_ruflo()

    def _find_hive(self) -> Optional[Path]:
        """Find Hive installation."""
        candidates = [
            Path.home() / "hive",
            Path("C:/hive"),
            Path("D:/hive"),
        ]
        for p in candidates:
            if p.exists():
                return p
        return None

    def _check_ruflo(self) -> bool:
        """Check if Ruflo CLI is available."""
        try:
            result = subprocess.run(
                ["npx", "ruflo", "--version"],
                capture_output=True, text=True, timeout=10,
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False

    def swarm_to_hive_graph(self, swarm_spec: dict) -> dict:
        """
        Convert a Ruflo swarm specification to a Hive agent graph.
        
        Ruflo Swarm Spec:
          {topology, agents: [{name, role, tools, model}], task}
        
        Hive Agent Graph:
          {nodes: [{id, type, model, tools, success_criteria}], edges: [...]}
        """
        topology = swarm_spec.get("topology", "hierarchical")
        agents = swarm_spec.get("agents", [])
        task = swarm_spec.get("task", "")

        # Build nodes
        nodes = []
        for i, agent in enumerate(agents):
            node = {
                "id": agent["name"],
                "type": "event_loop",
                "model": agent.get("model", f"ollama/{config.OLLAMA_MODEL}"),
                "description": agent.get("description", agent["name"]),
                "tools": agent.get("tools", []),
                "success_criteria": agent.get("success_criteria", [
                    {"criterion": "Task completed successfully", "weight": 1.0}
                ]),
            }
            nodes.append(node)

        # Build edges based on topology
        edges = []
        if topology == "hierarchical":
            # Queen → Workers sequence
            for i in range(len(nodes) - 1):
                edges.append({
                    "from": nodes[i]["id"],
                    "to": nodes[i + 1]["id"],
                    "condition": "success",
                })
                # Failure loops back
                edges.append({
                    "from": nodes[i + 1]["id"],
                    "to": nodes[i]["id"],
                    "condition": "failure",
                    "label": f"retry_{nodes[i+1]['id']}",
                })

        elif topology == "mesh":
            # All agents connected to each other
            for i in range(len(nodes)):
                for j in range(len(nodes)):
                    if i != j:
                        edges.append({
                            "from": nodes[i]["id"],
                            "to": nodes[j]["id"],
                            "condition": "success",
                        })

        elif topology == "star":
            # Hub (first agent) connected to all others
            hub = nodes[0]["id"] if nodes else "orchestrator"
            for node in nodes[1:]:
                edges.append({"from": hub, "to": node["id"], "condition": "success"})
                edges.append({"from": node["id"], "to": hub, "condition": "success"})

        return {
            "name": f"ruflo-swarm-{int(time.time())}",
            "task": task,
            "nodes": nodes,
            "edges": edges,
            "judge": {
                "model": f"ollama/{config.OLLAMA_MODEL}",
                "evaluation_interval": 120,
                "degradation_patterns": ["doom_loop", "stall", "excessive_retry"],
            },
            "evolution": {
                "enabled": True,
                "trigger": "failure",
                "scope": ["prompts", "edges", "tools"],
            },
            "recovery": {
                "enabled": True,
                "checkpoint_interval": 30,
            },
        }

    def register_hive_agent(self, graph_spec: dict) -> Optional[str]:
        """
        Register a converted graph with Hive.
        Creates agent.json + config.py in Hive's exports directory.
        """
        if not self.hive_dir:
            log.warning("Hive not installed, cannot register agent")
            return None

        agent_name = graph_spec["name"]
        export_dir = self.hive_dir / "exports" / agent_name
        export_dir.mkdir(parents=True, exist_ok=True)

        # Write agent.json (Hive graph specification)
        (export_dir / "agent.json").write_text(
            json.dumps(graph_spec, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        # Write config.py
        config_py = f'''"""Hive agent config for {agent_name}"""
provider = "ollama"
model = "{config.OLLAMA_MODEL}"
api_base = "{config.OLLAMA_HOST}"
max_tokens = 4096
temperature = {config.TEMPERATURE}
'''
        (export_dir / "config.py").write_text(config_py, encoding="utf-8")

        log.info(f"[green]Registered Hive agent: {agent_name}[/green]")
        return str(export_dir)

    def execute_via_hive(self, graph_spec: dict, task: str) -> str:
        """
        Execute a task through Hive's production runtime.
        
        This provides:
        - Crash recovery
        - Judge evaluation
        - Agent evolution on failure
        - Human-in-the-loop
        """
        agent_dir = self.register_hive_agent(graph_spec)
        if not agent_dir:
            return "Hive not available"

        agent_name = graph_spec["name"]

        try:
            result = subprocess.run(
                ["hive", "run", agent_name, "--goal", task],
                capture_output=True,
                text=True,
                timeout=600,
                cwd=str(self.hive_dir),
            )

            if result.returncode == 0:
                return result.stdout
            else:
                log.error(f"Hive execution error: {result.stderr}")
                return f"Hive error: {result.stderr[:500]}"

        except subprocess.TimeoutExpired:
            return "Hive execution timeout (10 minutes)"
        except FileNotFoundError:
            return "Hive CLI not found. Install Hive first."

    def full_pipeline(
        self,
        query: str,
        topology: str = "adaptive",
        agents: list = None,
    ) -> dict:
        """
        Complete pipeline: Ruflo swarm spec → Hive execution.
        
        1. Create Ruflo swarm spec
        2. Convert to Hive agent graph
        3. Execute via Hive
        4. Return results with audit trail
        """
        start = time.time()

        # Default agents for research
        if agents is None:
            agents = [
                {
                    "name": "orchestrator",
                    "role": "coordinator",
                    "model": f"ollama/{config.OLLAMA_MODEL}",
                    "tools": ["searxng_search", "delegate_to_sub_agent"],
                    "description": "Điều phối nghiên cứu",
                },
                {
                    "name": "researcher",
                    "role": "worker",
                    "model": f"ollama/{config.OLLAMA_MODEL}",
                    "tools": ["searxng_search", "multi_category_search", "web_scraper", "batch_web_scraper"],
                    "description": "Tìm kiếm & đọc sâu",
                },
                {
                    "name": "analyst",
                    "role": "worker",
                    "model": f"ollama/{config.OLLAMA_MODEL}",
                    "tools": ["searxng_search", "web_scraper"],
                    "description": "Phân tích chéo, xác minh",
                },
                {
                    "name": "writer",
                    "role": "worker",
                    "model": f"ollama/{config.OLLAMA_MODEL}",
                    "tools": [],
                    "description": "Tổng hợp câu trả lời",
                },
            ]

        # Build swarm spec
        swarm_spec = {
            "topology": topology,
            "agents": agents,
            "task": query,
        }

        # Convert to Hive graph
        graph_spec = self.swarm_to_hive_graph(swarm_spec)

        console.print(Panel(
            f"[bold cyan]Ruflo → Hive Pipeline[/bold cyan]\n\n"
            f"Query: {query[:60]}...\n"
            f"Topology: {topology}\n"
            f"Agents: {len(agents)}\n"
            f"Hive: {'✅' if self.hive_dir else '❌'}",
            title="🐝🔗 Triple Integration",
            border_style="magenta",
        ))

        # Execute
        result = self.execute_via_hive(graph_spec, query)

        elapsed = time.time() - start
        return {
            "query": query,
            "topology": topology,
            "agents": [a["name"] for a in agents],
            "result": result,
            "elapsed_seconds": round(elapsed, 1),
            "hive_registered": self.hive_dir is not None,
        }

    def get_status(self) -> dict:
        """Get bridge status."""
        return {
            "ruflo_available": self.ruflo_available,
            "hive_installed": self.hive_dir is not None,
            "hive_dir": str(self.hive_dir) if self.hive_dir else None,
        }
