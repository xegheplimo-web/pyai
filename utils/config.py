# MAS-OpenClaw Configuration Loader
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv(Path(__file__).parent.parent / ".env.example")


class Config:
    """Centralized configuration with hardware-optimized defaults."""

    # --- Paths ---
    BASE_DIR = Path(__file__).parent.parent
    DATA_DIR = BASE_DIR / "data"
    CACHE_DIR = DATA_DIR / "cache"
    LOG_DIR = DATA_DIR / "logs"
    SEARCH_RESULTS_DIR = DATA_DIR / "search_results"

    # --- Ollama ---
    OLLAMA_HOST: str = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:14b")
    OLLAMA_NUM_CTX: int = int(os.getenv("OLLAMA_NUM_CTX", "16384"))
    OLLAMA_FLASH_ATTENTION: bool = os.getenv("OLLAMA_FLASH_ATTENTION", "true").lower() == "true"

    # --- SearXNG ---
    SEARXNG_HOST: str = os.getenv("SEARXNG_HOST", "http://localhost:8888")

    # --- MAS ---
    MAX_CONCURRENT_AGENTS: int = int(os.getenv("MAS_MAX_CONCURRENT_AGENTS", "6"))
    AGENT_TIMEOUT: int = int(os.getenv("MAS_AGENT_TIMEOUT", "120"))
    MAX_SEARCH_RESULTS: int = int(os.getenv("MAS_MAX_SEARCH_RESULTS", "10"))
    RESEARCH_DEPTH: str = os.getenv("MAS_RESEARCH_DEPTH", "deep")
    VERIFY_SOURCES: bool = os.getenv("MAS_VERIFY_SOURCES", "true").lower() == "true"

    # --- Model Parameters ---
    TEMPERATURE: float = float(os.getenv("MODEL_TEMPERATURE", "0.3"))
    TOP_P: float = float(os.getenv("MODEL_TOP_P", "0.9"))
    TOP_K: int = int(os.getenv("MODEL_TOP_K", "40"))
    REPEAT_PENALTY: float = float(os.getenv("MODEL_REPEAT_PENALTY", "1.1"))
    NUM_PREDICT: int = int(os.getenv("MODEL_NUM_PREDICT", "4096"))

    # --- Performance ---
    GPU_MEMORY_UTILIZATION: float = float(os.getenv("GPU_MEMORY_UTILIZATION", "0.85"))
    CPU_THREADS: int = int(os.getenv("CPU_THREADS", "12"))

    # --- Web UI ---
    STREAMLIT_PORT: int = int(os.getenv("STREAMLIT_PORT", "8501"))
    STREAMLIT_HOST: str = os.getenv("STREAMLIT_HOST", "0.0.0.0")

    # --- Logging ---
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE: str = os.getenv("LOG_FILE", str(DATA_DIR / "logs" / "mas.log"))

    @classmethod
    def get_llm_config(cls) -> dict:
        """Return LLM configuration dict for CrewAI/Ollama."""
        return {
            "model": f"ollama/{cls.OLLAMA_MODEL}",
            "base_url": cls.OLLAMA_HOST,
            "temperature": cls.TEMPERATURE,
            "top_p": cls.TOP_P,
            "num_ctx": cls.OLLAMA_NUM_CTX,
            "num_predict": cls.NUM_PREDICT,
        }

    @classmethod
    def ensure_dirs(cls):
        """Create all necessary directories."""
        for d in [cls.DATA_DIR, cls.CACHE_DIR, cls.LOG_DIR, cls.SEARCH_RESULTS_DIR]:
            d.mkdir(parents=True, exist_ok=True)


config = Config()
