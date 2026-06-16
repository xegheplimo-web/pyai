"""
MAS-OpenClaw Streamlit Web UI
Perplexity-like interface with multi-agent research
"""
import sys
import time
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import streamlit as st
from utils.config import config

# ============================================================
# Page Configuration
# ============================================================
st.set_page_config(
    page_title="MAS-OpenClaw",
    page_icon="🔍",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ============================================================
# Custom CSS - Dark theme, Perplexity-inspired
# ============================================================
st.markdown("""
<style>
    /* Main container */
    .stApp {
        background: #0f0f1a;
        color: #e0e0e0;
    }

    /* Header */
    .main-header {
        text-align: center;
        padding: 2rem 0;
    }
    .main-header h1 {
        font-size: 2.5rem;
        font-weight: 700;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }
    .main-header p {
        color: #888;
        font-size: 1.1rem;
    }

    /* Search box */
    .search-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 1rem 0;
    }

    /* Chat messages */
    .stChatMessage {
        background: #1a1a2e;
        border-radius: 12px;
        padding: 1rem;
        margin: 0.5rem 0;
        border: 1px solid #2a2a4a;
    }

    /* Source cards */
    .source-card {
        background: #1a1a2e;
        border: 1px solid #2a2a4a;
        border-radius: 8px;
        padding: 0.75rem;
        margin: 0.25rem;
        transition: all 0.2s;
    }
    .source-card:hover {
        border-color: #667eea;
        transform: translateY(-2px);
    }
    .source-title {
        color: #667eea;
        font-weight: 600;
        font-size: 0.9rem;
    }
    .source-snippet {
        color: #aaa;
        font-size: 0.8rem;
        margin-top: 0.25rem;
    }
    .source-engine {
        color: #666;
        font-size: 0.7rem;
        margin-top: 0.25rem;
    }

    /* Status indicator */
    .status-active {
        color: #4caf50;
        font-weight: bold;
    }
    .status-inactive {
        color: #f44336;
        font-weight: bold;
    }

    /* Sidebar */
    [data-testid="stSidebar"] {
        background: #141428;
    }

    /* Agent status */
    .agent-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0.5rem 0;
    }
    .agent-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #4caf50;
        animation: pulse 2s infinite;
    }
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.4; }
        100% { opacity: 1; }
    }

    /* Depth selector */
    .depth-btn {
        padding: 0.5rem 1rem;
        border-radius: 20px;
        border: 1px solid #2a2a4a;
        background: transparent;
        color: #888;
        cursor: pointer;
        transition: all 0.2s;
    }
    .depth-btn.active {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-color: transparent;
        color: white;
    }
</style>
""", unsafe_allow_html=True)


# ============================================================
# Session State Initialization
# ============================================================
def init_session():
    """Initialize session state variables."""
    if "messages" not in st.session_state:
        st.session_state.messages = []
    if "research_depth" not in st.session_state:
        st.session_state.research_depth = "deep"
    if "orchestrator" not in st.session_state:
        st.session_state.orchestrator = None
    if "search_history" not in st.session_state:
        st.session_state.search_history = []
    if "processing" not in st.session_state:
        st.session_state.processing = False


def get_orchestrator():
    """Lazy-load orchestrator (heavy initialization)."""
    if st.session_state.orchestrator is None:
        from agents.orchestrator import MASOrchestrator, ResearchDepth
        depth_map = {
            "quick": ResearchDepth.QUICK,
            "standard": ResearchDepth.STANDARD,
            "deep": ResearchDepth.DEEP,
        }
        depth = depth_map.get(st.session_state.research_depth, ResearchDepth.DEEP)
        st.session_state.orchestrator = MASOrchestrator(depth=depth)
    return st.session_state.orchestrator


# ============================================================
# Sidebar
# ============================================================
def render_sidebar():
    """Render sidebar with settings and agent status."""
    with st.sidebar:
        st.markdown("## ⚙️ Cài đặt")

        # Research depth
        st.markdown("### 🎯 Độ sâu nghiên cứu")
        depth_cols = st.columns(3)
        depths = ["quick", "standard", "deep"]
        depth_labels = ["⚡ Nhanh", "📊 Tiêu chuẩn", "🔬 Sâu"]
        depth_descs = [
            "Tìm kiếm đơn giản",
            "2-3 nguồn, đọc top kết quả",
            "Đa nguồn, đọc sâu, xác minh chéo",
        ]

        for i, (col, depth, label) in enumerate(zip(depth_cols, depths, depth_labels)):
            with col:
                if st.button(
                    label,
                    key=f"depth_{depth}",
                    use_container_width=True,
                    type="primary" if st.session_state.research_depth == depth else "secondary",
                ):
                    st.session_state.research_depth = depth
                    st.session_state.orchestrator = None  # Reset to reinitialize
                    st.rerun()

        st.caption(depth_descs[depths.index(st.session_state.research_depth)])

        st.divider()

        # Agent status
        st.markdown("### 🤖 Trạng thái Agent")
        agents = [
            ("Orchestrator", "Điều phối", True),
            ("Search", "Tìm kiếm", True),
            ("Research", "Nghiên cứu", True),
            ("Analysis", "Phân tích", True),
            ("Response", "Trả lời", True),
        ]
        for name, role, active in agents:
            st.markdown(
                f'<div class="agent-status">'
                f'  <div class="agent-dot"></div>'
                f'  <span><b>{name}</b> - {role}</span>'
                f'</div>',
                unsafe_allow_html=True,
            )

        st.divider()

        # System info
        st.markdown("### 💻 Hệ thống")
        st.markdown(f"""
        - **Model:** `{config.OLLAMA_MODEL}`
        - **Context:** `{config.OLLAMA_NUM_CTX}` tokens
        - **GPU:** RTX 3090 24GB
        - **RAM:** 96 GB
        - **CPU:** Ryzen 9 9950X
        - **Search:** SearXNG
        """)

        st.divider()

        # Actions
        if st.button("🗑️ Xóa lịch sử", use_container_width=True):
            st.session_state.messages = []
            st.rerun()

        if st.button("🔄 Reset Agent", use_container_width=True):
            st.session_state.orchestrator = None
            st.rerun()


# ============================================================
# Main Chat Interface
# ============================================================
def render_chat():
    """Render main chat interface."""
    # Header
    st.markdown("""
    <div class="main-header">
        <h1>🔍 MAS-OpenClaw</h1>
        <p>Hệ thống Đa tác tử Tìm kiếm Thông minh — Nghiên cứu tự chủ như Perplexity</p>
    </div>
    """, unsafe_allow_html=True)

    # Display chat history
    for msg in st.session_state.messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"], unsafe_allow_html=True)

    # Chat input
    if prompt := st.chat_input("Hỏi bất cứ điều gì...", disabled=st.session_state.processing):
        st.session_state.processing = True

        # Add user message
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)

        # Process with MAS
        with st.chat_message("assistant"):
            depth = st.session_state.research_depth
            status_text = {
                "quick": "⚡ Đang tìm kiếm nhanh",
                "standard": "📊 Đang nghiên cứu tiêu chuẩn",
                "deep": "🔬 Đang nghiên cứu sâu",
            }

            with st.status(status_text.get(depth, "Đang xử lý..."), expanded=True) as status:
                st.write("📋 Khởi tạo agent...")
                orchestrator = get_orchestrator()

                if depth == "quick":
                    st.write("🔎 Tìm kiếm...")
                    result = orchestrator.quick_search(prompt)
                else:
                    st.write("🔎 Bước 1: Phân tích & Tìm kiếm nguồn...")
                    st.write("📖 Bước 2: Đọc sâu nguồn tài liệu...")
                    st.write("🔬 Bước 3: Phân tích & Xác minh chéo...")
                    st.write("✍️ Bước 4: Tổng hợp câu trả lời...")
                    result = orchestrator.research(prompt)

                status.update(label="✅ Hoàn thành!", state="complete", expanded=False)

            st.markdown(result)

        st.session_state.messages.append({"role": "assistant", "content": result})
        st.session_state.processing = False


# ============================================================
# Main
# ============================================================
def main():
    init_session()
    render_sidebar()
    render_chat()


if __name__ == "__main__":
    main()
