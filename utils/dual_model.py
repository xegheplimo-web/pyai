"""
MAS-OpenClaw Dual-Model Strategy
Sử dụng 2 model cùng lúc để tối ưu tốc độ + chất lượng.

Ý tưởng:
- Model nhỏ (Qwen2.5:3b) cho task đơn giản: phân tích query, routing, format
- Model lớn (Qwen2.5:14b) cho task phức tạp: phân tích sâu, tổng hợp, viết lách

VRAM Budget trên RTX 3090 24GB:
┌───────────────────────────────────────┐
│ Qwen2.5:3b Q4  │ ~2 GB │ Routing    │  ← Luôn loaded
│ Qwen2.5:14b Q4 │ ~8.5GB│ Heavy work │  ← Loaded khi cần
│ Overhead        │ ~2 GB │ CUDA/ctx   │
│ FREE            │ ~11GB │ Future     │
└───────────────────────────────────────┘

Lợi ích:
- Quick query → 3b trả lời ngay (~2s thay vì ~10s)
- Deep query → 3b routing + 14b research (tiết kiệm ~30% inference)
- Tiềm năng thêm model thứ 3 (VD: embedding model) với 11GB còn dư
"""
import time
from typing import Optional

import httpx
from rich.console import Console

from utils.config import config
from utils.logger import log

console = Console()


class DualModelManager:
    """
    Manage two models: lightweight for routing, heavy for research.
    
    Auto-detects query complexity and routes to the right model.
    """

    LIGHT_MODEL = "qwen2.5:3b"     # ~2GB VRAM, ~2s response
    HEAVY_MODEL = "qwen2.5:14b"    # ~8.5GB VRAM, ~10s response

    def __init__(self):
        self.ollama_host = config.OLLAMA_HOST
        self._available_models = None

    def check_models(self) -> dict:
        """Check which models are available in Ollama."""
        try:
            r = httpx.get(f"{self.ollama_host}/api/tags", timeout=5)
            models = [m["name"] for m in r.json().get("models", [])]
            return {
                "light": any(self.LIGHT_MODEL.split(":")[0] in m and ":3b" in m for m in models),
                "heavy": any("qwen2.5:14b" in m for m in models),
                "all_models": models,
            }
        except Exception as e:
            log.error(f"Cannot check Ollama models: {e}")
            return {"light": False, "heavy": False, "all_models": []}

    def classify_query(self, query: str) -> str:
        """
        Phân loại query → quyết định dùng model nào.
        
        Simple queries → LIGHT model (3b): "thời tiết hôm nay", "1+1 bằng mấy"
        Complex queries → HEAVY model (14b): "phân tích", "so sánh", "nghiên cứu"
        """
        # Quick heuristic-based classification (no LLM call needed)
        complex_keywords = [
            "phân tích", "so sánh", "nghiên cứu", "đánh giá", "chi tiết",
            "tại sao", "giải thích", "mối liên hệ", "ảnh hưởng", "tác động",
            "analyze", "compare", "research", "evaluate", "explain why",
            "deep dive", "comprehensive", "in-depth",
        ]

        query_lower = query.lower()

        # Check complexity signals
        complex_score = sum(1 for kw in complex_keywords if kw in query_lower)

        # Long queries tend to be complex
        if len(query) > 100:
            complex_score += 2

        # Multiple questions = complex
        if query.count("?") > 1 or query.count("và") > 1:
            complex_score += 1

        # Technical terms
        technical = any(kw in query_lower for kw in [
            "algorithm", "thuật toán", "architecture", "kiến trúc",
            "benchmark", "framework", "API", "database",
        ])
        if technical:
            complex_score += 2

        model = self.HEAVY_MODEL if complex_score >= 1 else self.LIGHT_MODEL
        log.info(f"[cyan]Query classified as {'HEAVY' if complex_score >= 1 else 'LIGHT'}:[/cyan] {query[:50]}...")
        return model

    def pull_light_model(self):
        """Pull the lightweight model if not available."""
        models = self.check_models()
        if not models["light"]:
            console.print(f"[yellow]📥 Pulling {self.LIGHT_MODEL}...[/yellow]")
            import subprocess
            result = subprocess.run(
                ["ollama", "pull", self.LIGHT_MODEL],
                capture_output=True, text=True, timeout=300,
            )
            if result.returncode == 0:
                console.print(f"[green]✅ {self.LIGHT_MODEL} ready![/green]")
            else:
                console.print(f"[red]❌ Failed to pull: {result.stderr}[/red]")
        else:
            console.print(f"[green]✅ {self.LIGHT_MODEL} already available[/green]")

    def get_model_for_task(self, task_type: str) -> str:
        """
        Return the appropriate model for a specific task type.
        
        Task types:
        - routing: Phân loại query → LIGHT
        - search_query: Tạo search keywords → LIGHT
        - format: Format output → LIGHT
        - analyze: Phân tích sâu → HEAVY
        - synthesize: Tổng hợp câu trả lời → HEAVY
        - verify: Xác minh thông tin → HEAVY
        """
        light_tasks = {"routing", "search_query", "format", "extract_keywords"}
        heavy_tasks = {"analyze", "synthesize", "verify", "deep_read", "cross_reference"}

        if task_type in light_tasks:
            return self.LIGHT_MODEL
        elif task_type in heavy_tasks:
            return self.HEAVY_MODEL
        else:
            return self.HEAVY_MODEL  # Default to heavy for unknown tasks

    def estimate_vram(self) -> dict:
        """Estimate VRAM usage with current models."""
        return {
            "light_model_vram": "~2 GB",
            "heavy_model_vram": "~8.5 GB",
            "total_used": "~10.5 GB",
            "rtx_3090_total": "24 GB",
            "remaining": "~13.5 GB",
            "note": "Enough room for embedding model, VLM, or another 7b model",
        }


def setup_dual_model():
    """Interactive setup for dual-model strategy."""
    console.print(Panel(
        "[bold]🧠 Dual-Model Strategy Setup[/bold]\n\n"
        "Sử dụng 2 model tối ưu tốc độ + chất lượng:\n"
        f"  ⚡ {DualModelManager.LIGHT_MODEL} — Routing, simple queries (~2s)\n"
        f"  🔬 {DualModelManager.HEAVY_MODEL} — Deep research (~10s)\n\n"
        "VRAM: ~10.5 GB / 24 GB → còn dư ~13.5 GB",
        border_style="magenta",
    ))

    manager = DualModelManager()
    models = manager.check_models()

    console.print(f"\n[bold]📋 Available models:[/bold]")
    for m in models["all_models"]:
        icon = "✅" if "14b" in m or "3b" in m else "  "
        console.print(f"  {icon} {m}")

    if not models["light"]:
        if console.input(f"\n[yellow]Pull {DualModelManager.LIGHT_MODEL}? (y/n): [/yellow]").lower() == "y":
            manager.pull_light_model()

    if not models["heavy"]:
        console.print(f"[red]❌ {DualModelManager.HEAVY_MODEL} not found! Run: ollama pull {DualModelManager.HEAVY_MODEL}[/red]")
    else:
        console.print(f"[green]✅ {DualModelManager.HEAVY_MODEL} ready[/green]")

    vram = manager.estimate_vram()
    console.print(f"\n[bold]📊 VRAM Estimate:[/bold]")
    for k, v in vram.items():
        console.print(f"  {k}: {v}")

    console.print("\n[bold green]✅ Dual-model strategy ready![/bold green]")
