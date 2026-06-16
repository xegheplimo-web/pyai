"""
MAS-OpenClaw CLI Entry Point
"""
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from agents.orchestrator import MASOrchestrator, ResearchDepth
from utils.config import config
from utils.logger import log


def main():
    """Main CLI entry point."""
    from rich.console import Console
    console = Console()

    config.ensure_dirs()

    console.print("""
[bold magenta]╔══════════════════════════════════════════════╗
║         🔍 MAS-OpenClaw v1.0                  ║
║   Multi-Agent Search System - Qwen2.5:14b     ║
╚══════════════════════════════════════════════╝[/bold magenta]
""")

    # Check services
    import httpx
    services_ok = True

    try:
        r = httpx.get(f"{config.SEARXNG_HOST}/healthz", timeout=5)
        console.print("[green]✅ SearXNG connected[/green]")
    except Exception:
        console.print("[red]❌ SearXNG not reachable![/red] Run: docker compose up -d searxng")
        services_ok = False

    try:
        r = httpx.get(f"{config.OLLAMA_HOST}/api/tags", timeout=5)
        models = r.json().get("models", [])
        qwen_found = any("qwen2.5" in m.get("name", "") for m in models)
        if qwen_found:
            console.print(f"[green]✅ Ollama + {config.OLLAMA_MODEL} ready[/green]")
        else:
            console.print(f"[yellow]⚠️ Ollama running but {config.OLLAMA_MODEL} not found[/yellow]")
            console.print(f"   Run: ollama pull {config.OLLAMA_MODEL}")
            services_ok = False
    except Exception:
        console.print("[red]❌ Ollama not reachable![/red] Run: ollama serve")
        services_ok = False

    if not services_ok:
        console.print("\n[yellow]Some services are not ready. Start them first:[/yellow]")
        console.print("  1. docker compose up -d searxng")
        console.print("  2. ollama serve")
        console.print(f"  3. ollama pull {config.OLLAMA_MODEL}")
        console.print("\n[dim]Or run scripts/setup.ps1 to set up everything automatically.[/dim]")
        sys.exit(1)

    # Parse args
    depth = ResearchDepth.DEEP
    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        if arg in ("quick", "fast"):
            depth = ResearchDepth.QUICK
        elif arg in ("standard", "normal"):
            depth = ResearchDepth.STANDARD
        elif arg in ("deep", "full"):
            depth = ResearchDepth.DEEP

    # Start orchestrator
    orchestrator = MASOrchestrator(depth=depth)
    orchestrator.interactive()


if __name__ == "__main__":
    main()
