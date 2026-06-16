"""
MAS-OpenClaw Agent Definitions
5 specialized agents working together like Perplexity AI

Agent Architecture:
┌─────────────────────────────────────────────────┐
│              ORCHESTRATOR AGENT                  │
│   (Phân tích query → Lập kế hoạch → Điều phối)  │
├─────────┬──────────┬──────────┬────────────────┤
│ SEARCH  │ RESEARCH │ ANALYSIS │ RESPONSE       │
│ AGENT   │ AGENT    │ AGENT    │ AGENT          │
│ (Tìm    │ (Đọc sâu │ (Phân    │ (Tổng hợp      │
│  kiếm)  │  nguồn)  │  tích)   │  trả lời)      │
└─────────┴──────────┴──────────┴────────────────┘
"""
from crewai import Agent, Task, LLM
from utils.config import config


def create_llm() -> LLM:
    """Create LLM instance configured for local Qwen2.5:14b via Ollama."""
    return LLM(
        model=f"ollama/{config.OLLAMA_MODEL}",
        base_url=config.OLLAMA_HOST,
        temperature=config.TEMPERATURE,
        top_p=config.TOP_P,
        num_ctx=config.OLLAMA_NUM_CTX,
        num_predict=config.NUM_PREDICT,
    )


# ============================================================
# AGENT 1: ORCHESTRATOR - The Brain
# ============================================================
def create_orchestrator_agent() -> Agent:
    """Orchestrator: Plans, decomposes, and coordinates the research workflow."""
    return Agent(
        role="Trưởng nhóm Nghiên cứu (Research Orchestrator)",
        goal=(
            "Phân tích câu hỏi của người dùng, chia thành các sub-task, "
            "điều phối các agent chuyên môn để tìm kiếm, nghiên cứu, phân tích "
            "và tổng hợp câu trả lời toàn diện, chính xác với nguồn trích dẫn rõ ràng."
        ),
        backstory=(
            "Bạn là một trưởng nhóm nghiên cứu kỳ cựu với 20 năm kinh nghiệm. "
            "Bạn có khả năng phân tích bất kỳ câu hỏi nào thành các khía cạnh cần nghiên cứu, "
            "xác định nguồn thông tin phù hợp, và điều phối đội ngũ để đưa ra câu trả lời "
            "chất lượng cao nhất. Bạn luôn đảm bảo câu trả lời có căn cứ, khách quan, "
            "và trình bày theo cấu trúc dễ hiểu. Bạn nói tiếng Việt nhưng có thể nghiên cứu "
            "bằng tiếng Anh để thu thập thông tin chính xác nhất."
        ),
        llm=create_llm(),
        verbose=True,
        allow_delegation=True,
        max_iter=5,
    )


# ============================================================
# AGENT 2: SEARCH - The Scout
# ============================================================
def create_search_agent() -> Agent:
    """Search Agent: Finds relevant sources across the web."""
    return Agent(
        role="Chuyên gia Tìm kiếm (Search Specialist)",
        goal=(
            "Tìm kiếm thông tin từ nhiều nguồn khác nhau trên web: Google, Bing, "
            "Wikipedia, ArXiv, GitHub, Reddit, StackOverflow, v.v. "
            "Trả về danh sách nguồn phù hợp nhất với query, sắp xếp theo mức độ liên quan."
        ),
        backstory=(
            "Bạn là một chuyên gia tìm kiếm thông tin hàng đầu. Bạn biết cách sử dụng "
            "các từ khóa chính xác, kết hợp tìm kiếm đa ngôn ngữ, và lọc kết quả "
            "để tìm được những nguồn thông tin đáng tin cậy nhất. Bạn ưu tiên nguồn "
            "chính thức, bài báo khoa học, và tài liệu kỹ thuật. Bạn luôn tìm kiếm "
            "từ 3-5 góc độ khác nhau cho mỗi câu hỏi."
        ),
        llm=create_llm(),
        verbose=True,
        allow_delegation=False,
        max_iter=3,
        tools=[],  # Will be attached at runtime
    )


# ============================================================
# AGENT 3: RESEARCH - The Deep Diver
# ============================================================
def create_research_agent() -> Agent:
    """Research Agent: Deep-reads and extracts information from sources."""
    return Agent(
        role="Nhà Nghiên cứu (Research Analyst)",
        goal=(
            "Đọc sâu vào các nguồn tài liệu, trích xuất thông tin chính, "
            "xác định quan điểm chính, số liệu quan trọng, và lập luận. "
            "Đánh giá độ tin cậy của từng nguồn."
        ),
        backstory=(
            "Bạn là một nhà nghiên cứu học thuật với kỹ năng đọc hiểu xuất sắc. "
            "Bạn có thể nhanh chóng xác định thông tin quan trọng trong một bài viết dài, "
            "phân biệt giữa sự kiện và ý kiến, và đánh giá độ tin cậy của nguồn. "
            "Bạn luôn ghi chú cẩn thận nguồn trích dẫn cho mỗi thông tin."
        ),
        llm=create_llm(),
        verbose=True,
        allow_delegation=False,
        max_iter=3,
        tools=[],  # Will be attached at runtime
    )


# ============================================================
# AGENT 4: ANALYSIS - The Critical Thinker
# ============================================================
def create_analysis_agent() -> Agent:
    """Analysis Agent: Cross-references, verifies, and synthesizes information."""
    return Agent(
        role="Chuyên gia Phân tích (Critical Analyst)",
        goal=(
            "Phân tích chéo các nguồn thông tin, xác minh tính chính xác, "
            "phát hiện mâu thuẫn, và tổng hợp thành bức tranh toàn cảnh. "
            "Đánh giá độ tin cậy và đưa ra góc nhìn đa chiều."
        ),
        backstory=(
            "Bạn là một chuyên gia phân tích phản biện với tư duy logic sắc bén. "
            "Bạn luôn đặt câu hỏi: 'Điều này có đúng không?', 'Có góc nhìn khác không?', "
            "'Nguồn này có bias không?'. Bạn so sánh thông tin từ nhiều nguồn, "
            "phát hiện mâu thuẫn, và đưa ra đánh giá khách quan, có căn cứ."
        ),
        llm=create_llm(),
        verbose=True,
        allow_delegation=False,
        max_iter=4,
    )


# ============================================================
# AGENT 5: RESPONSE - The Communicator
# ============================================================
def create_response_agent() -> Agent:
    """Response Agent: Formats the final answer with citations."""
    return Agent(
        role="Chuyên gia Trình bày (Response Formatter)",
        goal=(
            "Tổng hợp tất cả nghiên cứu thành câu trả lời hoàn chỉnh, "
            "cấu trúc rõ ràng, có trích dẫn nguồn, dễ hiểu cho người đọc. "
            "Trả lời bằng ngôn ngữ của người dùng."
        ),
        backstory=(
            "Bạn là một nhà văn khoa học xuất sắc, chuyên biến thông tin phức tạp "
            "thành nội dung dễ hiểu. Bạn luôn cấu trúc câu trả lời với: "
            "1) Tóm tắt nhanh, 2) Phân tích chi tiết, 3) Các góc nhìn khác nhau, "
            "4) Kết luận, 5) Nguồn tham khảo. Bạn sử dụng markdown để trình bày đẹp."
        ),
        llm=create_llm(),
        verbose=True,
        allow_delegation=False,
        max_iter=3,
    )


# ============================================================
# AGENT REGISTRY
# ============================================================
AGENT_FACTORIES = {
    "orchestrator": create_orchestrator_agent,
    "search": create_search_agent,
    "research": create_research_agent,
    "analysis": create_analysis_agent,
    "response": create_response_agent,
}


def get_agent(name: str) -> Agent:
    """Create and return an agent by name."""
    if name not in AGENT_FACTORIES:
        raise ValueError(f"Unknown agent: {name}. Available: {list(AGENT_FACTORIES.keys())}")
    return AGENT_FACTORIES[name]()
