"""
Hive + MAS-OpenClaw Integration Bridge
Connects Hive's production harness with MAS-OpenClaw's intelligence layer.

This module provides:
1. Hive-compatible agent graph that uses MAS-OpenClaw tools
2. Bridge between Hive's Data Buffer and MAS research results
3. Judge integration using Hive's evaluation subsystem
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

import httpx
from rich.console import Console
from rich.panel import Panel

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from utils.config import config
from utils.logger import log

console = Console()


class HiveMASBridge:
    """
    Bridge between Hive production harness and MAS-OpenClaw intelligence.
    
    Usage modes:
    1. STANDALONE - Run MAS-OpenClaw without Hive (original CrewAI mode)
    2. HIVE_TOOLS - Register MAS tools as Hive MCP tools (Hive orchestrates)
    3. HYBRID - Hive harness wraps MAS-OpenClaw orchestrator (recommended)
    """

    def __init__(self, mode: str = "hybrid"):
        self.mode = mode
        self.hive_dir = self._find_hive_installation()
        self.services_ready = False

    def _find_hive_installation(self) -> Optional[Path]:
        """Find Hive installation directory."""
        # Check common locations
        candidates = [
            Path.home() / "hive",
            Path.home() / "projects" / "hive",
            Path("/opt/hive"),
            Path("C:/hive"),
            Path("D:/hive"),
        ]

        for path in candidates:
            if path.exists() and (path / "quickstart.sh").exists():
                return path

        # Check if in PATH
        try:
            result = subprocess.run(["hive", "--version"], capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                return Path("hive")  # Hive is in PATH
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

        return None

    def check_prerequisites(self) -> dict:
        """Check all prerequisites for Hive + MAS integration."""
        checks = {
            "ollama": False,
            "searxng": False,
            "hive": False,
            "uv": False,
            "python": False,
        }

        # Check Ollama
        try:
            r = httpx.get(f"{config.OLLAMA_HOST}/api/tags", timeout=5)
            models = r.json().get("models", [])
            checks["ollama"] = any("qwen2.5" in m.get("name", "") for m in models)
        except Exception:
            pass

        # Check SearXNG
        try:
            r = httpx.get(f"{config.SEARXNG_HOST}/healthz", timeout=5)
            checks["searxng"] = r.status_code == 200
        except Exception:
            pass

        # Check Hive
        checks["hive"] = self.hive_dir is not None

        # Check uv
        try:
            result = subprocess.run(["uv", "--version"], capture_output=True, timeout=5)
            checks["uv"] = result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

        # Check Python
        checks["python"] = sys.version_info >= (3, 11)

        return checks

    def install_hive(self) -> bool:
        """Install Hive if not found."""
        if self.hive_dir:
            console.print("[green]✅ Hive already installed[/green]")
            return True

        console.print("[yellow]📥 Installing Hive...[/yellow]")

        try:
            # Clone Hive
            subprocess.run(
                ["git", "clone", "https://github.com/aden-hive/hive.git",
                 str(Path.home() / "hive")],
                check=True,
                timeout=120,
            )

            # Run quickstart
            hive_dir = Path.home() / "hive"
            if sys.platform == "win32":
                subprocess.run(
                    ["powershell", "-File", str(hive_dir / "quickstart.ps1")],
                    check=True,
                    timeout=300,
                )
            else:
                subprocess.run(
                    ["bash", str(hive_dir / "quickstart.sh")],
                    check=True,
                    timeout=300,
                )

            self.hive_dir = hive_dir
            console.print("[green]✅ Hive installed successfully[/green]")
            return True

        except Exception as e:
            console.print(f"[red]❌ Failed to install Hive: {e}[/red]")
            return False

    def register_mcp_tools(self) -> bool:
        """Register MAS-OpenClaw tools as Hive MCP tools."""
        from hive_integration.tools.mcp_tools import generate_mcp_config

        console.print("[cyan]📋 Registering MAS-OpenClaw tools with Hive...[/cyan]")

        # Generate .mcp.json in project root
        config_path = Path(__file__).parent.parent.parent / ".mcp.json"
        generate_mcp_config(str(config_path))

        # Also generate in Hive's expected location
        if self.hive_dir:
            hive_mcp_path = self.hive_dir / ".mcp.json"
            generate_mcp_config(str(hive_mcp_path))

        console.print("[green]✅ MCP tools registered[/green]")
        return True

    def create_hive_agent(self, name: str = "mas-researcher"):
        """
        Create a Hive agent that uses MAS-OpenClaw tools.
        
        This generates the agent graph specification that Hive reads
        to create the multi-agent workflow.
        """
        from hive_integration.config.hive_mas_config import load_config

        hive_config = load_config()

        agent_spec = {
            "name": name,
            "description": "MAS-OpenClaw research agent with SearXNG search and deep web analysis",
            "model": f"ollama/{config.OLLAMA_MODEL}",
            "nodes": [],
            "edges": [],
            "success_criteria": [],
        }

        # Build nodes from Hive config
        for agent_name, agent_conf in hive_config.get("hive", {}).get("agents", {}).items():
            node = {
                "id": agent_name,
                "type": "event_loop",
                "model": agent_conf.get("model", f"ollama/{config.OLLAMA_MODEL}"),
                "description": agent_conf["description"],
                "tools": agent_conf["tools"],
                "success_criteria": agent_conf.get("success_criteria", []),
            }
            agent_spec["nodes"].append(node)

        # Build edges
        agent_spec["edges"] = hive_config.get("hive", {}).get("edges", [])

        # Save to Hive's exports directory
        if self.hive_dir:
            export_dir = self.hive_dir / "exports" / name
            export_dir.mkdir(parents=True, exist_ok=True)

            # Write agent.json
            (export_dir / "agent.json").write_text(
                json.dumps(agent_spec, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

            # Write config.py
            config_py = f'''
"""Hive agent config for {name}"""
provider = "ollama"
model = "qwen2.5:14b"
api_base = "http://localhost:11434"
max_tokens = 4096
temperature = 0.3
'''
            (export_dir / "config.py").write_text(config_py, encoding="utf-8")

            console.print(f"[green]✅ Hive agent '{name}' created at {export_dir}[/green]")
            return str(export_dir)

        console.print("[yellow]⚠️ Hive not installed. Agent spec saved locally.[/yellow]")
        return None

    def run_hive_mode(self, query: str):
        """Run research through Hive's production harness."""
        console.print(Panel(
            f"[bold cyan]Hive + MAS-OpenClaw Research[/bold cyan]\n\n"
            f"Query: {query}\n"
            f"Mode: {self.mode}\n"
            f"Hive: {'✅' if self.hive_dir else '❌'}",
            title="🐝 Hybrid Mode",
            border_style="cyan",
        ))

        if self.mode == "hybrid" and self.hive_dir:
            # Use Hive's production harness with MAS tools
            console.print("[cyan]🐝 Starting via Hive harness...[/cyan]")
            try:
                result = subprocess.run(
                    ["hive", "run", "mas-researcher", "--goal", query],
                    capture_output=True,
                    text=True,
                    timeout=600,
                    cwd=str(self.hive_dir),
                )
                console.print(result.stdout)
                if result.stderr:
                    console.print(f"[yellow]{result.stderr}[/yellow]")
            except FileNotFoundError:
                console.print("[red]Hive CLI not found. Falling back to standalone mode.[/red]")
                self._run_standalone(query)
        else:
            self._run_standalone(query)

    def _run_standalone(self, query: str):
        """Run in standalone MAS-OpenClaw mode (CrewAI)."""
        from agents.orchestrator import MASOrchestrator, ResearchDepth
        orchestrator = MASOrchestrator(depth=ResearchDepth.DEEP)
        result = orchestrator.research(query)
        return result

    def setup(self):
        """Full setup: check prerequisites, install, configure."""
        console.print(Panel(
            "[bold]🐝 Hive + MAS-OpenClaw Setup[/bold]\n\n"
            "Tích hợp Hive production harness với MAS-OpenClaw",
            border_style="magenta",
        ))

        # Check prerequisites
        checks = self.check_prerequisites()

        console.print("\n[bold]📋 Kiểm tra hệ thống:[/bold]")
        for name, status in checks.items():
            icon = "✅" if status else "❌"
            console.print(f"  {icon} {name}")

        # Install missing components
        if not checks["hive"]:
            console.print("\n[yellow]Hive chưa cài đặt.[/yellow]")
            if console.input("[bold]Cài Hive? (y/n): [/bold]").lower() == "y":
                self.install_hive()

        if not checks["uv"]:
            console.print("[yellow]uv chưa cài. Cài: pip install uv[/yellow]")

        # Register MCP tools
        self.register_mcp_tools()

        # Create Hive agent
        if self.hive_dir:
            self.create_hive_agent()

        console.print("\n[bold green]✅ Setup hoàn tất![/bold green]")
        console.print("""
[bold]Sử dụng:[/bold]

  [cyan]Hybrid mode (Hive + MAS):[/cyan]
    hive run mas-researcher --goal "Nghiên cứu về..."

  [cyan]Standalone mode (CrewAI only):[/cyan]
    python -m utils.cli

  [cyan]Web UI:[/cyan]
    streamlit run ui/app.py
""")


def load_config():
    """Load Hive-MAS configuration."""
    import yaml
    config_path = Path(__file__).parent / "config" / "hive_mas_config.yml"
    if config_path.exists():
        return yaml.safe_load(config_path.read_text(encoding="utf-8"))
    return {}


if __name__ == "__main__":
    bridge = HiveMASBridge(mode="hybrid")
    bridge.setup()
