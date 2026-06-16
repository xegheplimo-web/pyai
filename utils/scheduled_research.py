"""
MAS-OpenClaw Scheduled Research - Tự động nghiên cứu theo lịch
Tương tự Google Alerts nhưng mạnh hơn nhiều.

Tại sao cần?
- Theo dõi chủ đề tự động mỗi ngày/tuần
- Ví dụ: "AI mới nhất", "React updates", "giá vàng", "tin tức công nghệ VN"
- Kết quả gửi qua Telegram hoặc lưu vào file
- Không cần nhớ search mỗi ngày → bot tự làm

Chạy: python -m utils.scheduled_research
"""
import asyncio
import json
import schedule
import time
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from rich.console import Console
from rich.table import Table

from utils.config import config
from utils.logger import log
from utils.memory import get_memory

console = Console()


class ScheduledResearch:
    """
    Lên lịch nghiên cứu tự động.
    
    Ví dụ cấu hình:
    - "AI mới nhất" → mỗi ngày 8:00 sáng
    - "React framework updates" → mỗi thứ Hai 9:00
    - "Giá vàng hôm nay" → mỗi ngày 7:30 + 17:00
    """

    def __init__(self):
        self.memory = get_memory()
        self.schedules_file = config.DATA_DIR / "scheduled_research.json"
        self.results_dir = config.DATA_DIR / "scheduled_results"
        self.results_dir.mkdir(parents=True, exist_ok=True)
        self._jobs = []
        self._callbacks = []  # Functions to call with results

    def add_schedule(
        self,
        query: str,
        schedule_type: str,  # "daily", "weekly", "interval"
        time_str: str = "08:00",  # HH:MM for daily/weekly
        day_of_week: str = "monday",  # For weekly
        interval_hours: int = 24,  # For interval
        depth: str = "standard",
        language: str = "vi",
        notify_callback: Optional[Callable] = None,
    ) -> dict:
        """Add a new scheduled research job."""
        job = {
            "id": f"job_{int(time.time())}",
            "query": query,
            "schedule_type": schedule_type,
            "time_str": time_str,
            "day_of_week": day_of_week,
            "interval_hours": interval_hours,
            "depth": depth,
            "language": language,
            "created_at": datetime.now().isoformat(),
            "last_run": None,
            "run_count": 0,
            "enabled": True,
        }

        self._jobs.append(job)
        if notify_callback:
            self._callbacks.append(notify_callback)

        self._save_jobs()
        self._register_schedule(job)

        console.print(f"[green]✅ Scheduled:[/green] {query} ({schedule_type} at {time_str})")
        return job

    def _register_schedule(self, job: dict):
        """Register a job with the schedule library."""
        if not job["enabled"]:
            return

        if job["schedule_type"] == "daily":
            schedule.every().day.at(job["time_str"]).do(
                self._run_job, job=job,
            )
        elif job["schedule_type"] == "weekly":
            day_map = {
                "monday": schedule.every().monday,
                "tuesday": schedule.every().tuesday,
                "wednesday": schedule.every().wednesday,
                "thursday": schedule.every().thursday,
                "friday": schedule.every().friday,
                "saturday": schedule.every().saturday,
                "sunday": schedule.every().sunday,
            }
            day_scheduler = day_map.get(job["day_of_week"], schedule.every().monday)
            day_scheduler.at(job["time_str"]).do(self._run_job, job=job)
        elif job["schedule_type"] == "interval":
            schedule.every(job["interval_hours"]).hours.do(self._run_job, job=job)

    def _run_job(self, job: dict):
        """Execute a scheduled research job."""
        console.print(f"\n[bold cyan]⏰ Scheduled Research:[/bold cyan] {job['query']}")

        try:
            from agents.orchestrator import MASOrchestrator, ResearchDepth
            depth_map = {
                "quick": ResearchDepth.QUICK,
                "standard": ResearchDepth.STANDARD,
                "deep": ResearchDepth.DEEP,
            }

            orchestrator = MASOrchestrator(depth=depth_map.get(job["depth"], ResearchDepth.STANDARD))
            result = orchestrator.research(job["query"])

            # Save result
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_query = "".join(c if c.isalnum() or c in " -_" else "_" for c in job["query"])[:40]
            result_file = self.results_dir / f"{timestamp}_{safe_query}.md"
            result_file.write_text(
                f"# 📋 Scheduled Research: {job['query']}\n\n"
                f"**Time:** {datetime.now().isoformat()}\n"
                f"**Depth:** {job['depth']}\n\n---\n\n{result}",
                encoding="utf-8",
            )

            # Update job stats
            job["last_run"] = datetime.now().isoformat()
            job["run_count"] = job.get("run_count", 0) + 1
            self._save_jobs()

            # Notify callbacks
            for callback in self._callbacks:
                try:
                    callback(job, result)
                except Exception as e:
                    log.error(f"Callback error: {e}")

            console.print(f"[green]✅ Research saved to {result_file}[/green]")

        except Exception as e:
            log.error(f"Scheduled research failed: {e}")

    def _save_jobs(self):
        """Save jobs to disk."""
        self.schedules_file.write_text(
            json.dumps(self._jobs, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    def load_jobs(self):
        """Load saved jobs."""
        if self.schedules_file.exists():
            jobs = json.loads(self.schedules_file.read_text(encoding="utf-8"))
            self._jobs = jobs
            for job in jobs:
                if job.get("enabled", True):
                    self._register_schedule(job)

    def list_jobs(self) -> list:
        """List all scheduled jobs."""
        table = Table(title="📋 Scheduled Research Jobs")
        table.add_column("ID", style="cyan")
        table.add_column("Query", style="white")
        table.add_column("Schedule", style="green")
        table.add_column("Last Run", style="yellow")
        table.add_column("Runs", style="magenta")

        for job in self._jobs:
            table.add_row(
                job["id"],
                job["query"][:40],
                f"{job['schedule_type']} @ {job.get('time_str', 'N/A')}",
                job.get("last_run", "Never")[:19] if job.get("last_run") else "Never",
                str(job.get("run_count", 0)),
            )

        console.print(table)
        return self._jobs

    def remove_job(self, job_id: str):
        """Remove a scheduled job."""
        self._jobs = [j for j in self._jobs if j["id"] != job_id]
        self._save_jobs()
        schedule.clear()
        for job in self._jobs:
            if job.get("enabled", True):
                self._register_schedule(job)
        console.print(f"[yellow]Removed job: {job_id}[/yellow]")

    def run(self):
        """Start the scheduler loop."""
        self.load_jobs()
        console.print(Panel(
            "[bold]⏰ MAS-OpenClaw Scheduled Research[/bold]\n\n"
            f"Loaded {len(self._jobs)} jobs\n"
            "Scheduler running... (Ctrl+C to stop)",
            border_style="cyan",
        ))
        self.list_jobs()

        while True:
            schedule.run_pending()
            time.sleep(60)  # Check every minute


# ============================================================
# Quick Setup Presets
# ============================================================
PRESET_SCHEDULES = [
    {
        "query": "AI & Machine Learning tin tức mới nhất",
        "schedule_type": "daily",
        "time_str": "08:00",
        "depth": "standard",
    },
    {
        "query": "Cập nhật framework & thư viện JavaScript/Python",
        "schedule_type": "weekly",
        "time_str": "09:00",
        "day_of_week": "monday",
        "depth": "standard",
    },
    {
        "query": "Tin tức công nghệ Việt Nam",
        "schedule_type": "daily",
        "time_str": "07:30",
        "depth": "quick",
    },
]


def setup_presets():
    """Setup preset scheduled research jobs."""
    scheduler = ScheduledResearch()
    for preset in PRESET_SCHEDULES:
        scheduler.add_schedule(**preset)
    console.print("[green]✅ Preset schedules configured![/green]")


if __name__ == "__main__":
    scheduler = ScheduledResearch()
    scheduler.run()
