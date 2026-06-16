"""
MAS-OpenClaw Memory System - Semantic Memory with SQLite + ChromaDB
Giúp agent nhớ context giữa các session và tìm kiếm ngữ nghĩa.

Tại sao cần?
- Hiện tại mỗi query là độc lập, không nhớ gì cả
- Người dùng hỏi "so sánh với cái trước" → agent không biết "cái trước" là gì
- Trùng lặp search → tốn thời gian, tốn inference

Lợi ích:
- Cache kết quả research → trả lời tức thì cho câu hỏi tương tự
- Semantic search → tìm research cũ theo nghĩa, không chỉ keyword
- Conversation memory → agent hiểu context của cuộc trò chuyện
- Usage analytics → biết chủ đề nào được hỏi nhiều
"""
import json
import hashlib
import time
from pathlib import Path
from typing import Optional

from utils.config import config
from utils.logger import log


class MemoryStore:
    """
    SQLite-based memory store với optional ChromaDB cho semantic search.
    
    3 loại memory:
    1. Conversation Memory - Lịch sử chat + context
    2. Research Cache - Kết quả research đã làm, tránh lặp
    3. Knowledge Base - Facts đã verify, dùng lại được
    """

    def __init__(self):
        import sqlite3
        config.ensure_dirs()
        self.db_path = config.DATA_DIR / "memory.db"
        self.conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_tables()
        self._chroma = None

    def _init_tables(self):
        """Create memory tables if not exist."""
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp REAL NOT NULL,
                metadata TEXT DEFAULT '{}'
            );
            
            CREATE TABLE IF NOT EXISTS research_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query_hash TEXT NOT NULL UNIQUE,
                query TEXT NOT NULL,
                depth TEXT NOT NULL,
                result TEXT NOT NULL,
                sources TEXT DEFAULT '[]',
                created_at REAL NOT NULL,
                accessed_at REAL NOT NULL,
                access_count INTEGER DEFAULT 0,
                quality_score REAL DEFAULT 0.0
            );
            
            CREATE TABLE IF NOT EXISTS knowledge_facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                topic TEXT NOT NULL,
                fact TEXT NOT NULL,
                source_url TEXT NOT NULL,
                confidence REAL DEFAULT 0.5,
                verified BOOLEAN DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS search_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query_hash TEXT NOT NULL UNIQUE,
                query TEXT NOT NULL,
                category TEXT DEFAULT 'general',
                results TEXT NOT NULL,
                created_at REAL NOT NULL
            );
            
            CREATE INDEX IF NOT EXISTS idx_conversations_session 
                ON conversations(session_id, timestamp);
            CREATE INDEX IF NOT EXISTS idx_research_hash 
                ON research_cache(query_hash);
            CREATE INDEX IF NOT EXISTS idx_knowledge_topic 
                ON knowledge_facts(topic);
            CREATE INDEX IF NOT EXISTS idx_search_hash 
                ON search_cache(query_hash);
        """)
        self.conn.commit()

    @staticmethod
    def _hash(text: str) -> str:
        """Create hash for deduplication."""
        normalized = text.lower().strip()
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]

    # ============================================================
    # Conversation Memory
    # ============================================================
    def save_conversation(self, session_id: str, role: str, content: str, metadata: dict = None):
        """Save a conversation message."""
        self.conn.execute(
            "INSERT INTO conversations (session_id, role, content, timestamp, metadata) VALUES (?, ?, ?, ?, ?)",
            (session_id, role, content, time.time(), json.dumps(metadata or {}, ensure_ascii=False)),
        )
        self.conn.commit()

    def get_conversation_history(self, session_id: str, limit: int = 20) -> list:
        """Get recent conversation history for a session."""
        rows = self.conn.execute(
            "SELECT * FROM conversations WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?",
            (session_id, limit),
        ).fetchall()
        return [dict(r) for r in reversed(rows)]

    def get_recent_topics(self, session_id: str, limit: int = 5) -> list:
        """Extract recent topics from conversation (user queries only)."""
        rows = self.conn.execute(
            "SELECT content FROM conversations WHERE session_id = ? AND role = 'user' ORDER BY timestamp DESC LIMIT ?",
            (session_id, limit),
        ).fetchall()
        return [r["content"] for r in rows]

    # ============================================================
    # Research Cache
    # ============================================================
    def cache_research(self, query: str, depth: str, result: str, sources: list = None):
        """Cache a research result for future reuse."""
        query_hash = self._hash(query)
        now = time.time()

        self.conn.execute(
            """INSERT OR REPLACE INTO research_cache 
               (query_hash, query, depth, result, sources, created_at, accessed_at, access_count) 
               VALUES (?, ?, ?, ?, ?, ?, ?, 0)""",
            (query_hash, query, depth, result, json.dumps(sources or [], ensure_ascii=False), now, now),
        )
        self.conn.commit()
        log.info(f"[cyan]Cached research:[/cyan] {query[:50]}...")

    def get_cached_research(self, query: str, max_age_hours: int = 24) -> Optional[str]:
        """
        Get cached research if exists and not too old.
        Returns None if not found or expired.
        """
        query_hash = self._hash(query)
        row = self.conn.execute(
            "SELECT * FROM research_cache WHERE query_hash = ?", (query_hash,)
        ).fetchone()

        if row is None:
            return None

        age_hours = (time.time() - row["created_at"]) / 3600
        if age_hours > max_age_hours:
            log.info(f"[yellow]Cache expired for:[/yellow] {query[:50]}... ({age_hours:.1f}h old)")
            return None

        # Update access stats
        self.conn.execute(
            "UPDATE research_cache SET accessed_at = ?, access_count = access_count + 1 WHERE query_hash = ?",
            (time.time(), query_hash),
        )
        self.conn.commit()

        log.info(f"[green]Cache hit:[/green] {query[:50]}... (accessed {row['access_count'] + 1}x)")
        return row["result"]

    # ============================================================
    # Knowledge Base
    # ============================================================
    def save_fact(self, topic: str, fact: str, source_url: str, confidence: float = 0.5, verified: bool = False):
        """Save a verified fact to the knowledge base."""
        now = time.time()
        self.conn.execute(
            """INSERT INTO knowledge_facts (topic, fact, source_url, confidence, verified, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (topic, fact, source_url, confidence, verified, now, now),
        )
        self.conn.commit()

    def get_facts(self, topic: str, min_confidence: float = 0.3) -> list:
        """Get verified facts about a topic."""
        rows = self.conn.execute(
            "SELECT * FROM knowledge_facts WHERE topic LIKE ? AND confidence >= ? ORDER BY confidence DESC",
            (f"%{topic}%", min_confidence),
        ).fetchall()
        return [dict(r) for r in rows]

    # ============================================================
    # Search Cache
    # ============================================================
    def cache_search(self, query: str, category: str, results: list):
        """Cache search results to avoid duplicate API calls."""
        query_hash = self._hash(f"{query}:{category}")
        self.conn.execute(
            "INSERT OR REPLACE INTO search_cache (query_hash, query, category, results, created_at) VALUES (?, ?, ?, ?, ?)",
            (query_hash, query, category, json.dumps(results, ensure_ascii=False), time.time()),
        )
        self.conn.commit()

    def get_cached_search(self, query: str, category: str = "general", max_age_hours: int = 6) -> Optional[list]:
        """Get cached search results if fresh enough."""
        query_hash = self._hash(f"{query}:{category}")
        row = self.conn.execute(
            "SELECT * FROM search_cache WHERE query_hash = ?", (query_hash,)
        ).fetchone()

        if row is None:
            return None

        age_hours = (time.time() - row["created_at"]) / 3600
        if age_hours > max_age_hours:
            return None

        return json.loads(row["results"])

    # ============================================================
    # Analytics
    # ============================================================
    def get_stats(self) -> dict:
        """Get memory usage statistics."""
        stats = {}
        for table in ["conversations", "research_cache", "knowledge_facts", "search_cache"]:
            count = self.conn.execute(f"SELECT COUNT(*) as c FROM {table}").fetchone()["c"]
            stats[table] = count
        return stats

    def cleanup(self, max_age_days: int = 30):
        """Remove old entries to keep database lean."""
        cutoff = time.time() - (max_age_days * 86400)
        for table, ts_col in [
            ("conversations", "timestamp"),
            ("research_cache", "created_at"),
            ("search_cache", "created_at"),
        ]:
            self.conn.execute(f"DELETE FROM {table} WHERE {ts_col} < ?", (cutoff,))
        self.conn.commit()
        log.info(f"[green]Cleaned up entries older than {max_age_days} days[/green]")


# Singleton
_memory = None

def get_memory() -> MemoryStore:
    """Get or create the global memory store."""
    global _memory
    if _memory is None:
        _memory = MemoryStore()
    return _memory
