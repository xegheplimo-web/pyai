"""
Hive MCP Tools - Register MAS-OpenClaw tools as Hive MCP tools
This bridges SearXNG search, Web Scraper, and Document Reader into Hive's tool registry.
"""
import json
import os
from pathlib import Path

# MCP Tool definitions for Hive
# Each tool follows the MCP (Model Context Protocol) specification

MCP_TOOLS = {
    # ============================================================
    # Tool 1: SearXNG Search
    # ============================================================
    "searxng_search": {
        "name": "searxng_search",
        "description": (
            "Tìm kiếm web đa nguồn qua SearXNG (Google, Bing, DuckDuckGo, "
            "Wikipedia, ArXiv, GitHub, StackOverflow, Reddit, v.v.). "
            "Trả về tiêu đề, URL, snippet, và engine nguồn."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Từ khóa tìm kiếm"
                },
                "categories": {
                    "type": "string",
                    "description": "Danh mục: general, news, science, it, social media",
                    "default": "general"
                },
                "language": {
                    "type": "string",
                    "description": "Ngôn ngữ: vi, en, ja, ko, zh",
                    "default": "vi"
                },
                "max_results": {
                    "type": "integer",
                    "description": "Số kết quả tối đa",
                    "default": 10
                },
                "time_range": {
                    "type": "string",
                    "description": "Lọc thời gian: day, week, month, year",
                    "enum": ["day", "week", "month", "year", None]
                }
            },
            "required": ["query"]
        },
        "implementation": "tools.search_tool.SearXNGSearchTool",
    },

    # ============================================================
    # Tool 2: Multi-Category Search
    # ============================================================
    "multi_category_search": {
        "name": "multi_category_search",
        "description": (
            "Tìm kiếm song song nhiều danh mục (web, tin tức, khoa học, IT, xã hội) "
            "để có coverage toàn diện. Tốt nhất cho nghiên cứu chuyên sâu."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Từ khóa tìm kiếm"
                },
                "categories": {
                    "type": "string",
                    "description": "Danh mục cách nhau bởi phẩy: general,news,science,it",
                    "default": "general,news,science,it"
                },
                "language": {
                    "type": "string",
                    "default": "vi"
                },
                "max_results": {
                    "type": "integer",
                    "default": 5
                }
            },
            "required": ["query"]
        },
        "implementation": "tools.search_tool.MultiCategorySearchTool",
    },

    # ============================================================
    # Tool 3: Web Scraper
    # ============================================================
    "web_scraper": {
        "name": "web_scraper",
        "description": (
            "Trích xuất nội dung sạch từ trang web. Loại bỏ quảng cáo, "
            "navigation, footer. Trả về nội dung bài viết chính + metadata."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL trang web cần đọc"
                },
                "max_length": {
                    "type": "integer",
                    "description": "Độ dài tối đa nội dung (ký tự)",
                    "default": 5000
                },
                "include_metadata": {
                    "type": "boolean",
                    "description": "Bao gồm metadata (title, author, date)",
                    "default": True
                }
            },
            "required": ["url"]
        },
        "implementation": "tools.web_scraper_tool.WebScraperTool",
    },

    # ============================================================
    # Tool 4: Batch Web Scraper
    # ============================================================
    "batch_web_scraper": {
        "name": "batch_web_scraper",
        "description": (
            "Đọc nhiều trang web cùng lúc (tối đa 10). "
            "Truyền danh sách URL dạng JSON array."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "urls_json": {
                    "type": "string",
                    "description": "JSON array các URL cần đọc"
                },
                "max_length": {
                    "type": "integer",
                    "default": 3000
                }
            },
            "required": ["urls_json"]
        },
        "implementation": "tools.web_scraper_tool.BatchWebScraperTool",
    },

    # ============================================================
    # Tool 5: Document Reader
    # ============================================================
    "document_reader": {
        "name": "document_reader",
        "description": (
            "Đọc file tài liệu lokal: PDF, DOCX, TXT, Markdown. "
            "Trích xuất text từ các định dạng tài liệu phổ biến."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Đường dẫn file tài liệu"
                },
                "max_length": {
                    "type": "integer",
                    "default": 10000
                }
            },
            "required": ["file_path"]
        },
        "implementation": "tools.document_tool.DocumentReaderTool",
    },
}


def generate_mcp_config(output_path: str = None) -> dict:
    """
    Generate .mcp.json config file for Hive integration.
    
    This creates the MCP server configuration that Hive reads
    to register external tools.
    """
    config = {
        "mcpServers": {
            "mas-openclaw": {
                "command": "python",
                "args": ["-m", "hive_integration.tools.mcp_server"],
                "env": {
                    "SEARXNG_HOST": os.getenv("SEARXNG_HOST", "http://localhost:8888"),
                    "OLLAMA_HOST": os.getenv("OLLAMA_HOST", "http://localhost:11434"),
                },
                "tools": list(MCP_TOOLS.keys()),
            }
        }
    }

    if output_path:
        Path(output_path).write_text(
            json.dumps(config, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"✅ MCP config saved to {output_path}")

    return config


def get_tool_definitions() -> list:
    """Return tool definitions in Hive-compatible format."""
    return [
        {
            "name": tool["name"],
            "description": tool["description"],
            "inputSchema": tool["inputSchema"],
        }
        for tool in MCP_TOOLS.values()
    ]


if __name__ == "__main__":
    # Generate .mcp.json when run directly
    output = Path(__file__).parent.parent.parent / ".mcp.json"
    generate_mcp_config(str(output))
