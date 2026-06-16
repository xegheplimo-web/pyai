"""
MAS-OpenClaw Telegram Bot - Truy cập MAS từ điện thoại
Hỏi bất cứ đâu, nhận câu trả lời nghiên cứu sâu ngay trên Telegram.

Tại sao cần?
- Không cần mở laptop, hỏi trực tiếp từ điện thoại
- Nhận notification khi research xong (deep mode mất 2-5 phút)
- Chia sẻ kết quả nghiên cứu cho team qua group chat
- Background processing - hỏi xong đi làm việc khác, bot báo khi xong

Cài đặt:
1. Chat với @BotFather trên Telegram → /newbot → lấy token
2. Thêm TELEGRAM_BOT_TOKEN vào .env
3. Chạy: python -m utils.telegram_bot
"""
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.config import config
from utils.logger import log
from utils.memory import get_memory

# Telegram Bot requires python-telegram-bot package
try:
    from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
    from telegram.ext import (
        Application,
        CommandHandler,
        MessageHandler,
        CallbackQueryHandler,
        ContextTypes,
        filters,
    )
    TELEGRAM_AVAILABLE = True
except ImportError:
    TELEGRAM_AVAILABLE = False


# ============================================================
# Bot Configuration
# ============================================================
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
ALLOWED_USERS = os.getenv("TELEGRAM_ALLOWED_USERS", "")  # comma-separated user IDs


def is_authorized(user_id: int) -> bool:
    """Check if user is authorized to use the bot."""
    if not ALLOWED_USERS:
        return True  # Open to all if not configured
    return str(user_id) in [u.strip() for u in ALLOWED_USERS.split(",")]


# ============================================================
# Bot Handlers
# ============================================================
async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command."""
    if not is_authorized(update.effective_user.id):
        await update.message.reply_text("⛔ Bạn không có quyền sử dụng bot này.")
        return

    await update.message.reply_text(
        "🔍 **MAS-OpenClaw Bot**\n\n"
        "Hệ thống nghiên cứu tự chủ đa tác tử\n\n"
        "📖 **Lệnh:**\n"
        "/quick _query_ — Tìm kiếm nhanh\n"
        "/standard _query_ — Nghiên cứu tiêu chuẩn\n"
        "/deep _query_ — Nghiên cứu sâu (2-5 phút)\n"
        "/history — Xem lịch sử research\n"
        "/stats — Thống kê hệ thống\n"
        "/help — Hướng dẫn\n\n"
        "💡 Hoặc chỉ cần gửi câu hỏi — mặc định là deep research.",
        parse_mode="Markdown",
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command."""
    await update.message.reply_text(
        "🔍 **MAS-OpenClaw Help**\n\n"
        "**Chế độ nghiên cứu:**\n"
        "• `/quick AI là gì` — ~5s, 1 tìm kiếm\n"
        "• `/standard So sánh React vs Vue` — ~30s, 3 nguồn\n"
        "• `/deep Tác động AI đến giáo dục VN` — ~2-5min, 10+ nguồn\n\n"
        "**Tính năng:**\n"
        "• Tìm kiếm đa nguồn (Google, Bing, ArXiv, GitHub...)\n"
        "• Đọc sâu & trích xuất nội dung\n"
        "• Phân tích chéo & xác minh\n"
        "• Trích dẫn nguồn rõ ràng\n"
        "• Hỗ trợ tiếng Việt\n\n"
        f"🤖 Model: {config.OLLAMA_MODEL}\n"
        f"🖥️ Chạy trên: RTX 3090 + Ryzen 9 9950X",
        parse_mode="Markdown",
    )


async def quick_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /quick command."""
    if not is_authorized(update.effective_user.id):
        return
    query = " ".join(context.args) if context.args else None
    if not query:
        await update.message.reply_text("❌ Vui lòng nhập câu hỏi: /quick _câu hỏi_")
        return

    await _research_and_reply(update, query, depth="quick")


async def standard_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /standard command."""
    if not is_authorized(update.effective_user.id):
        return
    query = " ".join(context.args) if context.args else None
    if not query:
        await update.message.reply_text("❌ Vui lòng nhập câu hỏi: /standard _câu hỏi_")
        return

    await _research_and_reply(update, query, depth="standard")


async def deep_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /deep command."""
    if not is_authorized(update.effective_user.id):
        return
    query = " ".join(context.args) if context.args else None
    if not query:
        await update.message.reply_text("❌ Vui lòng nhập câu hỏi: /deep _câu hỏi_")
        return

    await _research_and_reply(update, query, depth="deep")


async def history_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /history command."""
    if not is_authorized(update.effective_user.id):
        return
    memory = get_memory()
    session_id = f"telegram_{update.effective_user.id}"
    topics = memory.get_recent_topics(session_id, limit=10)

    if not topics:
        await update.message.reply_text("📋 Chưa có lịch sử nghiên cứu.")
        return

    text = "📋 **Lịch sử nghiên cứu gần đây:**\n\n"
    for i, topic in enumerate(topics, 1):
        text += f"{i}. {topic[:80]}\n"

    await update.message.reply_text(text, parse_mode="Markdown")


async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /stats command."""
    if not is_authorized(update.effective_user.id):
        return
    memory = get_memory()
    stats = memory.get_stats()

    text = (
        "📊 **Thống kê hệ thống**\n\n"
        f"💬 Conversations: {stats.get('conversations', 0)}\n"
        f"🔬 Research cached: {stats.get('research_cache', 0)}\n"
        f"📚 Knowledge facts: {stats.get('knowledge_facts', 0)}\n"
        f"🔎 Search cached: {stats.get('search_cache', 0)}\n"
    )
    await update.message.reply_text(text, parse_mode="Markdown")


async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle regular messages (default: deep research)."""
    if not is_authorized(update.effective_user.id):
        return
    query = update.message.text
    if not query or query.startswith("/"):
        return

    await _research_and_reply(update, query, depth="deep")


async def _research_and_reply(update: Update, query: str, depth: str = "deep"):
    """Run research and send result back to user."""
    # Send "thinking" indicator
    depth_emoji = {"quick": "⚡", "standard": "📊", "deep": "🔬"}
    await update.message.reply_text(
        f"{depth_emoji.get(depth, '🔍')} Đang nghiên cứu ({depth})...\n"
        f"📋 Query: _{query[:50]}{'...' if len(query) > 50 else ''}_",
        parse_mode="Markdown",
    )

    # Check cache first
    memory = get_memory()
    session_id = f"telegram_{update.effective_user.id}"
    cached = memory.get_cached_research(query, max_age_hours=24)
    if cached:
        await update.message.reply_text(
            f"📋 **Kết quả từ cache:**\n\n{cached[:4000]}",
            parse_mode="Markdown",
        )
        memory.save_conversation(session_id, "assistant", f"[CACHED] {query}")
        return

    # Run research (in thread pool to not block)
    try:
        from agents.orchestrator import MASOrchestrator, ResearchDepth
        depth_map = {
            "quick": ResearchDepth.QUICK,
            "standard": ResearchDepth.STANDARD,
            "deep": ResearchDepth.DEEP,
        }

        orchestrator = MASOrchestrator(depth=depth_map.get(depth, ResearchDepth.DEEP))
        result = await asyncio.get_event_loop().run_in_executor(
            None, orchestrator.research, query,
        )

        # Cache the result
        memory.cache_research(query, depth, result)
        memory.save_conversation(session_id, "user", query)
        memory.save_conversation(session_id, "assistant", result[:500])

        # Send result (Telegram has 4096 char limit per message)
        if len(result) > 4000:
            # Split into chunks
            chunks = [result[i:i+4000] for i in range(0, len(result), 4000)]
            for i, chunk in enumerate(chunks):
                prefix = f"📄 **Part {i+1}/{len(chunks)}**\n\n" if i > 0 else ""
                await update.message.reply_text(
                    f"{prefix}{chunk}",
                    parse_mode="Markdown",
                )
        else:
            await update.message.reply_text(result, parse_mode="Markdown")

    except Exception as e:
        log.error(f"Research error: {e}")
        await update.message.reply_text(f"❌ Lỗi nghiên cứu: {str(e)[:200]}")


# ============================================================
# Bot Runner
# ============================================================
def run_bot():
    """Start the Telegram bot."""
    if not TELEGRAM_AVAILABLE:
        print("❌ python-telegram-bot not installed. Run: pip install python-telegram-bot")
        return

    if not BOT_TOKEN:
        print("❌ TELEGRAM_BOT_TOKEN not set. Add it to .env:")
        print("   TELEGRAM_BOT_TOKEN=your_bot_token_here")
        print("\nGet token from @BotFather on Telegram")
        return

    print(f"🤖 Starting MAS-OpenClaw Telegram Bot...")
    print(f"   Model: {config.OLLAMA_MODEL}")
    print(f"   Depth: {config.RESEARCH_DEPTH}")

    app = Application.builder().token(BOT_TOKEN).build()

    # Register handlers
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("quick", quick_command))
    app.add_handler(CommandHandler("standard", standard_command))
    app.add_handler(CommandHandler("deep", deep_command))
    app.add_handler(CommandHandler("history", history_command))
    app.add_handler(CommandHandler("stats", stats_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, message_handler))

    # Start polling
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    run_bot()
