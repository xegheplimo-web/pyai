# 🔗 MAS-OpenClaw

**Hệ thống Đa tác tử Tìm kiếm Thông minh** — Kiến trúc 3 tầng OpenClaw × Ruflo × Hive, nghiên cứu tự chủ như Perplexity, chạy hoàn toàn local trên RTX 3090.

> **💡 Lưu ý quan trọng**: OpenClaw **đã có sẵn UI, Telegram, WhatsApp, SearXNG, Ollama extensions** — không cần viết Streamlit hay bot riêng! Chạy `npx openclaw onboard` để bắt đầu.

## 🖥️ Tối ưu cho cấu hình

| Linh kiện | Cấu hình | Phân bổ cho MAS |
|-----------|----------|-----------------|
| **CPU** | AMD Ryzen 9 9950X (16C/32T) | 12 threads cho inference + 4 threads cho search |
| **RAM** | 96 GB | 16GB cho model + 80GB cho cache & data |
| **GPU** | RTX 3090 24GB VRAM | Qwen2.5:14b Q4_K_M (~8.5GB) → còn dư 15.5GB |
| **SSD** | Samsung 990 PRO 4TB | Model storage + search cache |
| **OS** | Windows 11 Pro | Docker Desktop + WSL2 |

## 🏗️ Kiến trúc Hệ thống

```
┌─────────────────────────────────────────────────────┐
│                   NGƯỜI DÙNG                        │
│            (Streamlit Web UI / CLI)                  │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│              ORCHESTRATOR AGENT                      │
│   Phân tích query → Lập kế hoạch → Điều phối        │
├──────────┬──────────┬──────────┬────────────────────┤
│ SEARCH   │ RESEARCH  │ ANALYSIS │ RESPONSE           │
│ AGENT    │ AGENT     │ AGENT    │ AGENT              │
│ 🔎      │ 📖       │ 🔬      │ ✍️                 │
│ Tìm kiếm │ Đọc sâu  │ Phân tích│ Tổng hợp           │
│ đa nguồn │ trích xuất│ xác minh │ trả lời            │
├──────────┴──────────┴──────────┴────────────────────┤
│                    TOOLS LAYER                       │
│  SearXNG │ Web Scraper │ Doc Reader │ Batch Scraper  │
├──────────────────────────────────────────────────────┤
│                 INFRASTRUCTURE                       │
│  Ollama (Qwen2.5:14b) │ SearXNG │ Docker            │
└──────────────────────────────────────────────────────┘
```

## 🚀 Cài đặt Nhanh

### Yêu cầu trước
- **Docker Desktop** với WSL2 backend ([cài đặt](https://docs.docker.com/desktop/install/windows-install/))
- **NVIDIA Driver** 535+ ([cài đặt](https://www.nvidia.com/Download/index.aspx))
- **Python 3.10+** ([cài đặt](https://www.python.org/downloads/))
- **NVIDIA Container Toolkit** ([cài đặt](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html))

### Cài tự động (Khuyến nghị)

```powershell
# Mở PowerShell với quyền Administrator
cd mas-openclaw
.\scripts\setup.ps1
```

Script sẽ tự động:
1. ✅ Kiểm tra hardware & GPU
2. ✅ Kiểm tra Docker & Python
3. ✅ Tạo virtual environment
4. ✅ Cài tất cả Python packages
5. ✅ Khởi động SearXNG + Ollama qua Docker
6. ✅ Pull model Qwen2.5:14b (~8GB download)

### Cài thủ công

```powershell
# 1. Clone & cd
cd mas-openclaw

# 2. Tạo venv & kích hoạt
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 3. Cài packages
pip install -r requirements.txt
playwright install chromium

# 4. Copy config
copy .env.example .env

# 5. Khởi động SearXNG
docker compose up -d searxng

# 6. Khởi động Ollama (chọn 1 trong 2)
# Option A: Native (khuyến nghị cho hiệu năng tốt nhất)
ollama serve
# Mở terminal khác:
ollama pull qwen2.5:14b

# Option B: Docker
docker compose up -d ollama
docker exec mas-ollama ollama pull qwen2.5:14b
```

## 🎯 Sử dụng

### Khởi động nhanh

```powershell
.\scripts\start.ps1
```

### Web UI (Perplexity-like)

```powershell
.\.venv\Scripts\Activate.ps1
streamlit run ui/app.py
# Mở http://localhost:8501
```

### CLI Interactive

```powershell
.\.venv\Scripts\Activate.ps1

# Chế độ nghiên cứu sâu (mặc định)
python -m utils.cli

# Chế độ nhanh
python -m utils.cli quick

# Chế độ tiêu chuẩn
python -m utils.cli standard
```

### Lệnh trong CLI

```
/deep <query>     - Nghiên cứu sâu (multi-source, cross-verify)
/standard <query> - Nghiên cứu tiêu chuẩn
/quick <query>    - Tìm kiếm nhanh
/quit             - Thoát
```

## 🔧 Tối ưu Model cho RTX 3090

| Quantization | VRAM | Tốc độ | Chất lượng | Khuyến nghị |
|---|---|---|---|---|
| Q4_K_M | ~8.5 GB | ⚡⚡⚡⚡ | ★★★☆ | ✅ Mặc định - cân bằng |
| Q5_K_M | ~10 GB | ⚡⚡⚡ | ★★★★ | Nghiên cứu chuyên sâu |
| Q6_K | ~12 GB | ⚡⚡ | ★★★★★ | Chất lượng cao nhất |
| F16 | ~28 GB | ⚡ | ★★★★★+ | ❌ Vượt VRAM |

### Chuyển quantization

```bash
# Pull model với quantization khác
ollama pull qwen2.5:14b-q5_K_M
ollama pull qwen2.5:14b-q6_K

# Cập nhật .env
OLLAMA_MODEL=qwen2.5:14b-q5_K_M
```

## 🔍 Nguồn Tìm kiếm

SearXNG tổng hợp từ **15+ nguồn**:

| Loại | Nguồn |
|------|-------|
| **Web** | Google, Bing, DuckDuckGo, Brave |
| **Học thuật** | ArXiv, Semantic Scholar, PubMed |
| **Kỹ thuật** | GitHub, StackOverflow, Docs.rs |
| **Bách khoa** | Wikipedia, Wikidata |
| **Xã hội** | Reddit, HackerNews |
| **Video** | YouTube |

## ⚙️ Cấu hình Nâng cao

### Tăng context window (cho nghiên cứu sâu)

```env
# .env
OLLAMA_NUM_CTX=32768   # 32K context (chậm hơn nhưng nhớ nhiều hơn)
```

### Tăng concurrent agents

```env
# .env - Tối đa 8 agents với 32 threads
MAS_MAX_CONCURRENT_AGENTS=8
CPU_THREADS=16
```

### Chạy Ollama native (hiệu năng tốt nhất)

```powershell
# Thay vì Docker, chạy Ollama native:
winget install Ollama.Ollama
ollama serve

# Lợi ích:
# + 10-20% tốc độ inference nhanh hơn
# + GPU scheduling linh hoạt hơn
# + Không overhead của Docker layer
```

## 📊 Hiệu năng Dự kiến

| Chế độ | Thời gian | Số nguồn | Phù hợp |
|--------|----------|---------|---------|
| ⚡ Quick | 5-15s | 1 search | Câu hỏi đơn giản |
| 📊 Standard | 30-90s | 3-5 sources | Nghiên cứu thông thường |
| 🔬 Deep | 2-5 min | 8-15 sources | Nghiên cứu chuyên sâu |

## 🐛 Xử lý Sự cố

### Ollama không kết nối
```powershell
# Kiểm tra Ollama đang chạy
curl http://localhost:11434/api/tags

# Khởi động lại
ollama serve
```

### SearXNG không kết nối
```powershell
# Kiểm tra container
docker ps | findstr searxng

# Khởi động lại
docker compose restart searxng

# Xem log
docker compose logs searxng
```

### GPU không được nhận diện
```powershell
# Kiểm tra NVIDIA driver
nvidia-smi

# Kiểm tra Docker GPU
docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi
```

### Model chậm
```powershell
# Kiểm tra GPU utilization
nvidia-smi

# Giảm context window
# .env: OLLAMA_NUM_CTX=8192

# Hoặc dùng quantization thấp hơn
ollama pull qwen2.5:14b-q4_K_M
```

## 📁 Cấu trúc Project

```
mas-openclaw/
├── agents/
│   ├── agent_definitions.py   # 5 agent definitions
│   └── orchestrator.py        # Pipeline & crew assembly
├── tools/
│   ├── search_tool.py         # SearXNG search (single + multi)
│   ├── web_scraper_tool.py    # Web page content extraction
│   └── document_tool.py       # PDF/DOCX reader
├── ui/
│   └── app.py                 # Streamlit web interface
├── utils/
│   ├── config.py              # Configuration loader
│   ├── logger.py              # Rich + file logging
│   └── cli.py                 # CLI entry point
├── config/
│   └── searxng/
│       └── settings.yml       # SearXNG engine config
├── hive_integration/
│   ├── bridge.py              # Hive ↔ MAS bridge
│   ├── config/
│   │   └── hive_mas_config.yml # Hive agent graph spec
│   └── tools/
│       ├── mcp_tools.py       # MCP tool definitions
│       └── mcp_server.py      # MCP server for Hive
├── scripts/
│   ├── setup.ps1              # Auto-setup for Windows
│   ├── setup_hive.ps1         # Hive integration setup
│   └── start.ps1              # Quick launcher
├── data/                      # Runtime data (gitignored)
│   ├── cache/
│   ├── logs/
│   └── search_results/
├── docker-compose.yml         # SearXNG + Ollama services
├── .env.example               # Environment template
├── pyproject.toml             # Python project config
└── requirements.txt           # Pip requirements
```

## 🐝 Tích hợp Hive (OpenHive)

[Hive](https://github.com/aden-hive/hive) là production harness cho AI agents — bổ sung cho MAS-OpenClaw những gì CrewAI thiếu:

| Hive bổ sung | Lợi ích |
|---|---|
| 🛡️ **Crash Recovery** | Tự phục hồi khi agent lỗi, không mất kết quả |
| 🧬 **Evolution** | Agent tự tối ưu prompt/flow sau mỗi lần chạy |
| 👨‍⚖️ **Judge** | Đánh giá chất lượng đầu ra, phát hiện doom loop |
| 💰 **Cost Enforcement** | Theo dõi chi phí (miễn phí với local model!) |
| 🔄 **Human-in-the-Loop** | Phê duyệt kết quả trước khi hoàn tất |
| 📊 **Session Isolation** | Mỗi run hoàn toàn cô lập, audit trail |

### Cài đặt tích hợp

```powershell
# Cài Hive + đăng ký MAS tools
.\scripts\setup_hive.ps1
```

### Sử dụng Hive Mode

```powershell
# Chạy qua Hive harness (có crash recovery + evolution)
cd %USERPROFILE%\hive
hive run mas-researcher --goal "Nghiên cứu về ảnh hưởng của AI tới giáo dục Việt Nam"

# Hoặc dùng bridge
python -m hive_integration.bridge
```

### Kiến trúc Hybrid

```
┌──────────────────────────────────────┐
│     HIVE (Production Harness)        │
│  • Judge đánh giá chất lượng         │
│  • Crash recovery & self-healing     │
│  • Evolution (tự tối ưu)             │
│  • Human-in-the-Loop                 │
├──────────────────────────────────────┤
│   MAS-OpenClaw (Intelligence Layer)  │
│  • 5 Agent chuyên môn                │
│  • SearXNG (15+ nguồn, tự host)     │
│  • Web Scraper + Document Reader     │
│  • Qwen2.5:14b local (miễn phí)     │
└──────────────────────────────────────┘
```

## 🔗 Kiến trúc 3 Tầng: OpenClaw × Ruflo × Hive

### Tại sao cần 3 tầng?

| Tầng | Dự án | Vai trò | Thiếu gì nếu không có? |
|------|-------|---------|----------------------|
| **Gateway** | OpenClaw | Tiếp nhận từ Telegram/WhatsApp/Web, routing, skills | Không có kênh giao tiếp với người dùng |
| **Orchestration** | Ruflo | Swarm coordination, AgentDB + HNSW memory, SONA learning, 311 MCP tools | Không có trí tuệ bầy đàn, không học được |
| **Production** | Hive | Crash recovery, Judge đánh giá, Evolution, Human-in-the-Loop | Không chịu lỗi, không tự phục hồi, không tiến hóa |

### Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────┐
│           OPENCLAW — TẦNG GIAO TIẾP                 │
│  📱 Telegram  💬 WhatsApp  🌐 Web UI  🖥️ CLI       │
│  Skills, Routing, Sessions, Memory (Markdown)       │
└────────────────────┬────────────────────────────────┘
                     │ Message → Swarm Task
┌────────────────────▼────────────────────────────────┐
│           RUFLO — TẦNG ĐIỀU PHỐI                    │
│  🐝 Swarm (Mesh/Hierarchical/Adaptive)              │
│  🧠 AgentDB + HNSW (vector memory, 150x faster)    │
│  📚 SONA Learning (tự tối ưu từ kinh nghiệm)       │
│  🔄 Multi-LLM Routing (3b light + 14b heavy)       │
│  🔧 311 MCP Tools + 5 MAS Search Tools             │
│  🤝 Consensus: Raft / Byzantine / Gossip           │
└────────────────────┬────────────────────────────────┘
                     │ Agent Graph → Execution
┌────────────────────▼────────────────────────────────┐
│           HIVE — TẦNG VẬN HÀNH                      │
│  🛡️ Crash Recovery (checkpoint-based)              │
│  👨‍⚖️ Judge (đánh giá chất lượng, phát hiện doom loop) │
│  🧬 Evolution (tự tối ưu prompt/flow khi thất bại)  │
│  🔄 Human-in-the-Loop (phê duyệt kết quả)          │
│  💰 Cost Enforcement (miễn phí với local model!)    │
│  📊 Session Isolation + Audit Trail                 │
└─────────────────────────────────────────────────────┘
```

### 4 Execution Modes (tự detect)

| Mode | Components | Khi nào dùng |
|------|-----------|-------------|
| 🔗 **TRIPLE** | OpenClaw + Ruflo + Hive | Full stack, production-ready |
| 🧠 **RUFLO** | OpenClaw + Ruflo | Nghiên cứu thông minh, không cần chịu lỗi |
| 🐝 **HIVE** | OpenClaw + Hive | Chạy ổn định 24/7, không cần swarm |
| 🤖 **STANDALONE** | CrewAI only | Fallback khi Ruflo/Hive chưa cài |

### Cài đặt Triple Stack

```powershell
# Cài tất cả 3 tầng trong 1 lệnh
.\scripts\setup_triple.ps1
```

### Sử dụng Triple Mode

```powershell
# Khởi động triple orchestrator (auto-detect available components)
python -m ruflo_integration.triple_orchestrator

# Hoặc dùng Web UI / API như bình thường
streamlit run ui/app.py
uvicorn utils.api_server:app --port 8000
```

### Data Flow ví dụ

```
User (Telegram): "/deep Tác động AI đến giáo dục VN"
  ↓
OpenClaw Gateway → Route "deep research" → Ruflo
  ↓
Ruflo: Tạo swarm (topology: mesh)
  ├─ Researcher Agent → SearXNG search (Google, ArXiv, Reddit)
  ├─ Analyst Agent → Cross-verify 10+ sources
  ├─ Writer Agent → Tổng hợp câu trả lời
  └─ Tester Agent (3b) → Quick quality check
  ↓
Hive: Execute trên production runtime
  ├─ Judge đánh giá mỗi 2 phút
  ├─ Crash recovery nếu agent lỗi
  └─ Evolution nếu thất bại (tối ưu prompt)
  ↓
OpenClaw → Gửi kết quả về Telegram/Web UI
```

## 📝 Ghi chú

- **Hoàn toàn local**: Không gửi dữ liệu ra ngoài, bảo mật tuyệt đối
- **Đa ngôn ngữ**: Hỏi bằng tiếng Việt, nghiên cứu bằng tiếng Anh, trả lời bằng tiếng Việt
- **Trích dẫn nguồn**: Mỗi thông tin đều có nguồn tham khảo rõ ràng
- **Mở rộng**: Dễ dàng thêm agent mới, tool mới, hoặc model khác
- **Production-ready**: Tích hợp Hive để chạy 24/7 với self-healing

---

## 🚀 Đề xuất nâng cấp (v2.0 Roadmap)

### 1. ⚡ Async Pipeline — Nhanh 3-4x

Hiện tại search & scrape chạy tuần tự. Chuyển sang async song song:

```
TRƯỚC: Search→Search→Search→Scrape→Scrape→Scrape  ~120s
SAU:   Search─┐                                       
       Search─┤→ Merge → Scrape─┐                      ~30s
       Search─┘   → Scrape─┤→ Merge → Analyze
                    → Scrape─┘
```

**File mới:** `tools/async_pipeline.py`
- `AsyncSearchPipeline` — 5 concurrent searches + 10 concurrent scrapes
- Tự động cache kết quả vào SQLite Memory
- Quick: ~5s | Standard: ~15s | Deep: ~30s

### 2. 🧠 Dual-Model Strategy — Tiết kiệm 30% inference

```
┌──────────────────────────────────────────┐
│ RTX 3090 24GB VRAM                       │
│  ┌──────────┐  ┌──────────────┐          │
│  │ Qwen2.5  │  │ Qwen2.5      │          │
│  │ :3b (~2G)│  │ :14b (~8.5G) │          │
│  │ Routing  │  │ Deep Work    │          │
│  └──────────┘  └──────────────┘          │
│  FREE: ~13.5GB cho embedding/VLM         │
└──────────────────────────────────────────┘
```

- Query đơn giản → 3b trả lời ngay (~2s)
- Query phức tạp → 3b routing + 14b research
- **File mới:** `utils/dual_model.py`

### 3. 💾 Memory System — Agent có trí nhớ

```
┌─────────────┐  ┌─────────────┐  ┌──────────────┐
│ Conversation│  │ Research    │  │ Knowledge    │
│ Memory      │  │ Cache       │  │ Base         │
│ (chat ctx)  │  │ (avoid dup) │  │ (verified    │
│             │  │             │  │  facts)      │
└─────────────┘  └─────────────┘  └──────────────┘
         ↕                ↕                ↕
              SQLite + Optional ChromaDB
```

- Hỏi "so sánh với cái trước" → agent hiểu context
- Research cũ tự reuse → không lặp lại search
- Facts đã verify → xây knowledge base dần
- **File mới:** `utils/memory.py`

### 4. 📱 Telegram Bot — Hỏi từ điện thoại

```bash
# Cài: Thêm TELEGRAM_BOT_TOKEN vào .env
python -m utils.telegram_bot
```

- `/quick AI là gì` → trả lời trong 5s
- `/deep Tác động AI đến GD VN` → nghiên cứu 2-5 phút, bot báo khi xong
- `/history` → xem lại research đã làm
- **File mới:** `utils/telegram_bot.py`

### 5. 🌐 REST API — Tích hợp bên ngoài

```bash
uvicorn utils.api_server:app --host 0.0.0.0 --port 8000
```

- `POST /research` — Core research endpoint
- `POST /search` — Quick SearXNG search
- `GET /history` — Lịch sử research
- `WS /ws/research` — Streaming real-time
- Auto OpenAPI docs tại `/docs`
- **File mới:** `utils/api_server.py`

### 6. ⏰ Scheduled Research — Google Alerts on steroids

```python
# Ví dụ: tự nghiên cứu mỗi sáng 8h
scheduler.add_schedule("AI mới nhất", schedule_type="daily", time_str="08:00")
```

- Tự động chạy theo lịch (daily/weekly/interval)
- Kết quả lưu file + gửi Telegram
- **File mới:** `utils/scheduled_research.py`

### 7. 📊 Priority Matrix

| Đề xuất | Impact | Effort | Priority |
|---------|--------|--------|----------|
| ⚡ Async Pipeline | Giảm 3-4x thời gian | Medium | 🔴 P0 |
| 🧠 Dual Model | Tiết kiệm 30% inference | Low | 🔴 P0 |
| 💾 Memory | Tránh lặp, có context | Medium | 🔴 P0 |
| 📱 Telegram Bot | Mobile access | Low | 🟡 P1 |
| 🌐 REST API | Tích hợp bên ngoài | Medium | 🟡 P1 |
| ⏰ Scheduled | Tự động hóa | Low | 🟢 P2 |
