"""
MAS-OpenClaw Orchestrator - Task Pipeline & Crew Assembly
Coordinates agents through a structured research pipeline.
"""
import json
import time
from enum import Enum
from typing import Optional

from crewai import Crew, Process, Task
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn

from agents.agent_definitions import (
    get_agent,
    create_orchestrator_agent,
    create_search_agent,
    create_research_agent,
    create_analysis_agent,
    create_response_agent,
)
from tools.search_tool import SearXNGSearchTool, MultiCategorySearchTool
from tools.web_scraper_tool import WebScraperTool, BatchWebScraperTool
from tools.document_tool import DocumentReaderTool
from utils.config import config
from utils.logger import log

console = Console()


class ResearchDepth(str, Enum):
    QUICK = "quick"      # 1 search, no deep reading
    STANDARD = "standard"  # 2-3 searches, read top results
    DEEP = "deep"        # Multi-category search, read all, cross-verify


class MASOrchestrator:
    """
    Main orchestrator for the Multi-Agent System.

    Pipeline:
    1. ORCHESTRATOR analyzes query → creates research plan
    2. SEARCH AGENT finds relevant sources
    3. RESEARCH AGENT reads and extracts from sources
    4. ANALYSIS AGENT cross-references and verifies
    5. RESPONSE AGENT formats final answer with citations
    """

    def __init__(self, depth: ResearchDepth = ResearchDepth.DEEP):
        self.depth = depth
        self.search_tool = SearXNGSearchTool()
        self.multi_search_tool = MultiCategorySearchTool()
        self.scraper_tool = WebScraperTool()
        self.batch_scraper_tool = BatchWebScraperTool()
        self.doc_tool = DocumentReaderTool()

        # Create agents with tools attached
        self.orchestrator = create_orchestrator_agent()
        self.searcher = create_search_agent()
        self.searcher.tools = [self.search_tool, self.multi_search_tool]
        self.researcher = create_research_agent()
        self.researcher.tools = [self.scraper_tool, self.batch_scraper_tool, self.doc_tool]
        self.analyst = create_analysis_agent()
        self.responder = create_response_agent()

        log.info(f"[bold green]MAS Orchestrator initialized[/bold green] (depth={depth.value})")

    def research(self, query: str) -> str:
        """
        Execute full research pipeline on a query.

        Returns formatted response with citations.
        """
        start_time = time.time()
        console.print(Panel(
            f"[bold cyan]Query:[/bold cyan] {query}\n"
            f"[bold cyan]Depth:[/bold cyan] {self.depth.value}",
            title="🔍 MAS-OpenClaw Research",
            border_style="cyan",
        ))

        # ---- STEP 1: Plan ----
        console.print("\n[bold yellow]📋 Step 1/5: Phân tích & Lập kế hoạch[/bold yellow]")
        plan_task = Task(
            description=(
                f"Phân tích câu hỏi sau và tạo kế hoạch nghiên cứu chi tiết:\n\n"
                f"Query: {query}\n\n"
                f"Nhiệm vụ:\n"
                f"1. Xác định các khía cạnh cần nghiên cứu\n"
                f"2. Đề xuất từ khóa tìm kiếm tối ưu (cả tiếng Việt và tiếng Anh)\n"
                f"3. Xác định loại nguồn phù hợp (web, academic, technical, v.v.)\n"
                f"4. Đề xuất thứ tự nghiên cứu\n\n"
                f"Trả về kế hoạch dưới dạng danh sách có cấu trúc."
            ),
            agent=self.orchestrator,
            expected_output="Kế hoạch nghiên cứu chi tiết với từ khóa, nguồn, và thứ tự thực hiện",
        )

        # ---- STEP 2: Search ----
        console.print("[bold yellow]🔎 Step 2/5: Tìm kiếm nguồn[/bold yellow]")
        search_task = Task(
            description=(
                f"Dựa trên kế hoạch nghiên cứu, tìm kiếm nguồn thông tin cho query:\n\n"
                f"Query: {query}\n\n"
                f"Nhiệm vụ:\n"
                f"1. Tìm kiếm web tổng hợp (Google, Bing, DuckDuckGo)\n"
                f"2. Tìm kiếm học thuật nếu cần (ArXiv, Semantic Scholar)\n"
                f"3. Tìm kiếm kỹ thuật nếu cần (GitHub, StackOverflow)\n"
                f"4. Tìm kiếm tin tức gần đây nếu cần\n"
                f"5. Tổng hợp và xếp hạng nguồn theo độ liên quan\n\n"
                f"Độ sâu nghiên cứu: {self.depth.value}\n"
                f"- quick: 1 tìm kiếm tổng hợp\n"
                f"- standard: 2-3 tìm kiếm theo category\n"
                f"- deep: tìm kiếm đa category, đa ngôn ngữ"
            ),
            agent=self.searcher,
            expected_output="Danh sách nguồn đã xếp hạng với tiêu đề, URL, snippet, và nguồn engine",
            context=[plan_task],
        )

        # ---- STEP 3: Research ----
        console.print("[bold yellow]📖 Step 3/5: Đọc sâu nguồn[/bold yellow]")
        research_task = Task(
            description=(
                f"Đọc sâu vào các nguồn đã tìm được cho query:\n\n"
                f"Query: {query}\n\n"
                f"Nhiệm vụ:\n"
                f"1. Đọc nội dung từ top 5-10 nguồn phù hợp nhất\n"
                f"2. Trích xuất thông tin chính, số liệu, và lập luận\n"
                f"3. Đánh giá độ tin cậy của từng nguồn\n"
                f"4. Ghi chú nguồn trích dẫn cho mỗi thông tin\n"
                f"5. Tổng hợp thông tin theo chủ đề\n\n"
                f"Lưu ý: Luôn ghi rõ [Nguồn: URL] cho mỗi thông tin."
            ),
            agent=self.researcher,
            expected_output="Bản tóm tắt nghiên cứu chi tiết với thông tin trích xuất và nguồn cho mỗi điểm",
            context=[plan_task, search_task],
        )

        # ---- STEP 4: Analysis ----
        console.print("[bold yellow]🔬 Step 4/5: Phân tích & Xác minh[/bold yellow]")
        analysis_task = Task(
            description=(
                f"Phân tích chéo và xác minh thông tin nghiên cứu cho query:\n\n"
                f"Query: {query}\n\n"
                f"Nhiệm vụ:\n"
                f"1. So sánh thông tin từ nhiều nguồn\n"
                f"2. Phát hiện mâu thuẫn hoặc không nhất quán\n"
                f"3. Đánh giá bias và độ tin cậy\n"
                f"4. Xác định các góc nhìn khác nhau\n"
                f"5. Tổng hợp thành bức tranh toàn cảnh\n"
                f"6. Đánh giá mức độ chắc chắn cho mỗi kết luận"
            ),
            agent=self.analyst,
            expected_output="Phân tích chéo với đánh giá độ tin cậy, các góc nhìn, và mức độ chắc chắn",
            context=[plan_task, research_task],
        )

        # ---- STEP 5: Response ----
        console.print("[bold yellow]✍️ Step 5/5: Tổng hợp câu trả lời[/bold yellow]")
        response_task = Task(
            description=(
                f"Tổng hợp câu trả lời hoàn chỉnh cho query:\n\n"
                f"Query: {query}\n\n"
                f"Cấu trúc câu trả lời:\n"
                f"## 📌 Tóm tắt nhanh\n"
                f"2-3 câu tóm tắt chính\n\n"
                f"## 📊 Chi tiết\n"
                f"Nội dung chi tiết với các heading con phù hợp\n\n"
                f"## 🔍 Nhiều góc nhìn\n"
                f"Các perspective khác nhau (nếu có)\n\n"
                f"## ✅ Kết luận\n"
                f"Tóm tắt kết luận\n\n"
                f"## 📚 Nguồn tham khảo\n"
                f"Danh sách nguồn với URL\n\n"
                f"QUAN TRỌNG:\n"
                f"- Mỗi thông tin phải có nguồn trích dẫn\n"
                f"- Sử dụng markdown formatting\n"
                f"- Trả lời bằng tiếng Việt\n"
                f"- Số liệu cụ thể thay vì nói chung"
            ),
            agent=self.responder,
            expected_output="Câu trả lời hoàn chỉnh với cấu trúc markdown, trích dẫn nguồn, và nhiều góc nhìn",
            context=[plan_task, search_task, research_task, analysis_task],
        )

        # ---- Run Crew ----
        crew = Crew(
            agents=[self.orchestrator, self.searcher, self.researcher, self.analyst, self.responder],
            tasks=[plan_task, search_task, research_task, analysis_task, response_task],
            process=Process.sequential,
            verbose=True,
            max_rpm=30,
        )

        try:
            result = crew.kickoff()
            elapsed = time.time() - start_time

            console.print(Panel(
                f"[bold green]Hoàn thành trong {elapsed:.1f}s[/bold green]\n\n{result}",
                title="✅ Kết quả nghiên cứu",
                border_style="green",
            ))

            return str(result)

        except Exception as e:
            log.error(f"Crew execution failed: {e}")
            console.print(f"[bold red]Lỗi: {e}[/bold red]")
            return f"Lỗi khi thực hiện nghiên cứu: {e}"

    def quick_search(self, query: str) -> str:
        """Quick search mode - single search, no deep reading."""
        console.print(f"\n[bold cyan]⚡ Quick Search:[/bold cyan] {query}")
        search_result = self.search_tool._run(query=query, max_results=5)
        return search_result

    def interactive(self):
        """Run interactive CLI mode."""
        console.print(Panel(
            "[bold]MAS-OpenClaw[/bold] - Hệ thống Đa tác tử Tìm kiếm Thông minh\n\n"
            "Lệnh:\n"
            "  /deep <query>   - Nghiên cứu sâu (mặc định)\n"
            "  /quick <query>  - Tìm kiếm nhanh\n"
            "  /standard <query> - Nghiên cứu tiêu chuẩn\n"
            "  /quit           - Thoát\n\n"
            f"Model: {config.OLLAMA_MODEL} | Depth: {self.depth.value}",
            title="🤖 MAS-OpenClaw v1.0",
            border_style="blue",
        ))

        while True:
            try:
                user_input = console.input("\n[bold green]You>[/bold green] ").strip()
                if not user_input:
                    continue

                if user_input == "/quit":
                    console.print("[yellow]Tạm biệt! 👋[/yellow]")
                    break
                elif user_input.startswith("/quick "):
                    self.depth = ResearchDepth.QUICK
                    query = user_input[7:].strip()
                    self.quick_search(query)
                elif user_input.startswith("/standard "):
                    self.depth = ResearchDepth.STANDARD
                    query = user_input[10:].strip()
                    self.research(query)
                elif user_input.startswith("/deep "):
                    self.depth = ResearchDepth.DEEP
                    query = user_input[6:].strip()
                    self.research(query)
                else:
                    self.research(user_input)

            except KeyboardInterrupt:
                console.print("\n[yellow]Ctrl+C - Thoát...[/yellow]")
                break
            except EOFError:
                break
