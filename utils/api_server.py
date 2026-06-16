"""
MAS-OpenClaw API Server - REST API cho tích hợp bên ngoài
Chạy FastAPI server để các ứng dụng khác gọi MAS.

Tại sao cần?
- Web UI Streamlit không đủ nếu muốn tích hợp vào app khác
- REST API chuẩn → dễ dàng kết nối từ mobile app, VS Code extension, etc.
- WebSocket cho real-time streaming (thấy agent làm việc live)
- OpenAPI docs tự động → frontend developer dễ tích hợp

Chạy: uvicorn utils.api_server:app --host 0.0.0.0 --port 8000 --reload
"""
import asyncio
import json
import time
import uuid
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from utils.config import config
from utils.logger import log
from utils.memory import get_memory

app = FastAPI(
    title="MAS-OpenClaw API",
    description="Multi-Agent Search System - Perplexity-like research powered by Qwen2.5:14b",
    version="1.0.0",
)

# CORS - cho phép frontend gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# Models
# ============================================================
class ResearchRequest(BaseModel):
    """Request model for research."""
    query: str = Field(..., description="Câu hỏi cần nghiên cứu", min_length=1)
    depth: str = Field(default="deep", description="quick | standard | deep")
    language: str = Field(default="vi", description="Ngôn ngữ trả lời")
    use_cache: bool = Field(default=True, description="Sử dụng cache nếu có")


class ResearchResponse(BaseModel):
    """Response model for research."""
    id: str
    query: str
    depth: str
    result: str
    sources: list = []
    cached: bool = False
    elapsed_seconds: float = 0.0


class QuickSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    max_results: int = Field(default=10)
    categories: str = Field(default="general")


class SystemStatus(BaseModel):
    ollama: bool
    searxng: bool
    model: str
    memory_stats: dict


# ============================================================
# Endpoints
# ============================================================
@app.get("/")
async def root():
    """API root - system info."""
    return {
        "name": "MAS-OpenClaw API",
        "version": "1.0.0",
        "model": config.OLLAMA_MODEL,
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    """Health check - kiểm tra tất cả services."""
    import httpx

    ollama_ok = False
    searxng_ok = False

    try:
        r = httpx.get(f"{config.OLLAMA_HOST}/api/tags", timeout=5)
        ollama_ok = r.status_code == 200
    except Exception:
        pass

    try:
        r = httpx.get(f"{config.SEARXNG_HOST}/healthz", timeout=5)
        searxng_ok = r.status_code == 200
    except Exception:
        pass

    memory = get_memory()
    status_code = 200 if (ollama_ok and searxng_ok) else 503

    return {
        "status": "healthy" if status_code == 200 else "degraded",
        "services": {
            "ollama": "up" if ollama_ok else "down",
            "searxng": "up" if searxng_ok else "down",
        },
        "model": config.OLLAMA_MODEL,
        "memory": memory.get_stats(),
    }


@app.post("/research", response_model=ResearchResponse)
async def research(request: ResearchRequest):
    """
    Nghiên cứu sâu - core endpoint.
    
    Depth modes:
    - quick: Tìm kiếm đơn giản (~5s)
    - standard: 2-3 nguồn (~30s) 
    - deep: Đa nguồn, xác minh chéo (~2-5min)
    """
    start = time.time()
    request_id = str(uuid.uuid4())[:8]
    memory = get_memory()

    # Check cache
    if request.use_cache:
        cached = memory.get_cached_research(request.query, max_age_hours=24)
        if cached:
            return ResearchResponse(
                id=request_id,
                query=request.query,
                depth=request.depth,
                result=cached,
                cached=True,
                elapsed_seconds=time.time() - start,
            )

    # Run research
    try:
        from agents.orchestrator import MASOrchestrator, ResearchDepth
        depth_map = {
            "quick": ResearchDepth.QUICK,
            "standard": ResearchDepth.STANDARD,
            "deep": ResearchDepth.DEEP,
        }

        orchestrator = MASOrchestrator(depth=depth_map.get(request.depth, ResearchDepth.DEEP))

        if request.depth == "quick":
            result = orchestrator.quick_search(request.query)
        else:
            # Run in thread pool to not block
            result = await asyncio.get_event_loop().run_in_executor(
                None, orchestrator.research, request.query,
            )

        # Cache result
        memory.cache_research(request.query, request.depth, result)

        return ResearchResponse(
            id=request_id,
            query=request.query,
            depth=request.depth,
            result=result,
            cached=False,
            elapsed_seconds=round(time.time() - start, 1),
        )

    except Exception as e:
        log.error(f"Research API error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search")
async def quick_search(request: QuickSearchRequest):
    """Tìm kiếm nhanh qua SearXNG - không qua agent."""
    from tools.search_tool import SearXNGSearchTool
    tool = SearXNGSearchTool()
    result = tool._run(
        query=request.query,
        categories=request.categories,
        max_results=request.max_results,
    )
    return json.loads(result)


@app.get("/history")
async def get_history(limit: int = 20):
    """Lấy lịch sử nghiên cứu."""
    memory = get_memory()
    # Return recent research cache entries
    rows = memory.conn.execute(
        "SELECT query, depth, created_at, access_count, quality_score FROM research_cache ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return {"history": [dict(r) for r in rows]}


@app.get("/stats")
async def get_stats():
    """Thống kê hệ thống."""
    memory = get_memory()
    return {
        "memory": memory.get_stats(),
        "config": {
            "model": config.OLLAMA_MODEL,
            "context_window": config.OLLAMA_NUM_CTX,
            "max_agents": config.MAX_CONCURRENT_AGENTS,
            "research_depth": config.RESEARCH_DEPTH,
        },
    }


# ============================================================
# WebSocket - Streaming Research
# ============================================================
@app.websocket("/ws/research")
async def websocket_research(websocket: WebSocket):
    """
    WebSocket endpoint cho streaming research.
    
    Client gửi: {"query": "...", "depth": "deep"}
    Server gửi: {"step": "searching", "message": "..."} 
                → {"step": "complete", "result": "..."}
    """
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_text()
            request = json.loads(data)

            query = request.get("query", "")
            depth = request.get("depth", "deep")

            if not query:
                await websocket.send_json({"step": "error", "message": "Query required"})
                continue

            # Send progress updates
            await websocket.send_json({"step": "planning", "message": f"📋 Phân tích: {query[:50]}..."})

            from agents.orchestrator import MASOrchestrator, ResearchDepth
            depth_map = {
                "quick": ResearchDepth.QUICK,
                "standard": ResearchDepth.STANDARD,
                "deep": ResearchDepth.DEEP,
            }

            orchestrator = MASOrchestrator(depth=depth_map.get(depth, ResearchDepth.DEEP))

            await websocket.send_json({"step": "searching", "message": "🔎 Đang tìm kiếm..."})

            # Run research
            result = await asyncio.get_event_loop().run_in_executor(
                None, orchestrator.research, query,
            )

            await websocket.send_json({
                "step": "complete",
                "result": result,
                "query": query,
                "depth": depth,
            })

    except WebSocketDisconnect:
        log.info("WebSocket disconnected")
    except Exception as e:
        log.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"step": "error", "message": str(e)})
        except Exception:
            pass


# ============================================================
# Startup
# ============================================================
@app.on_event("startup")
async def startup():
    """Initialize on startup."""
    config.ensure_dirs()
    log.info("[bold green]MAS-OpenClaw API Server started[/bold green]")
