"""
MCP Server for MAS-OpenClaw Tools
Bridges SearXNG search, Web Scraper, Document Reader into Hive's MCP protocol.

Hive connects to this server via stdio and calls tools through the MCP protocol.
"""
import json
import sys
import traceback
from typing import Any

# Add parent directory to path
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tools.search_tool import SearXNGSearchTool, MultiCategorySearchTool
from tools.web_scraper_tool import WebScraperTool, BatchWebScraperTool
from tools.document_tool import DocumentReaderTool
from hive_integration.tools.mcp_tools import MCP_TOOLS


class MASMCPServer:
    """Simple MCP server that exposes MAS-OpenClaw tools to Hive."""

    def __init__(self):
        self.tools = {
            "searxng_search": SearXNGSearchTool(),
            "multi_category_search": MultiCategorySearchTool(),
            "web_scraper": WebScraperTool(),
            "batch_web_scraper": BatchWebScraperTool(),
            "document_reader": DocumentReaderTool(),
        }

    def handle_request(self, request: dict) -> dict:
        """Handle incoming MCP request."""
        method = request.get("method", "")
        request_id = request.get("id", 0)
        params = request.get("params", {})

        try:
            if method == "initialize":
                return self._initialize(request_id)
            elif method == "tools/list":
                return self._list_tools(request_id)
            elif method == "tools/call":
                return self._call_tool(request_id, params)
            else:
                return {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {"code": -32601, "message": f"Method not found: {method}"},
                }
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32603, "message": str(e), "data": traceback.format_exc()},
            }

    def _initialize(self, request_id: int) -> dict:
        """MCP initialize handshake."""
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {
                    "name": "mas-openclaw-mcp",
                    "version": "1.0.0",
                },
            },
        }

    def _list_tools(self, request_id: int) -> dict:
        """Return available tools."""
        tools = []
        for tool_def in MCP_TOOLS.values():
            tools.append({
                "name": tool_def["name"],
                "description": tool_def["description"],
                "inputSchema": tool_def["inputSchema"],
            })

        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {"tools": tools},
        }

    def _call_tool(self, request_id: int, params: dict) -> dict:
        """Execute a tool call."""
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})

        if tool_name not in self.tools:
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32602, "message": f"Unknown tool: {tool_name}"},
            }

        tool = self.tools[tool_name]
        result = tool._run(**arguments)

        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "content": [{"type": "text", "text": result}],
                "isError": False,
            },
        }

    def run(self):
        """Run the MCP server on stdio."""
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue

            try:
                request = json.loads(line)
                response = self.handle_request(request)
                sys.stdout.write(json.dumps(response) + "\n")
                sys.stdout.flush()
            except json.JSONDecodeError:
                error_response = {
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": {"code": -32700, "message": "Parse error"},
                }
                sys.stdout.write(json.dumps(error_response) + "\n")
                sys.stdout.flush()


if __name__ == "__main__":
    server = MASMCPServer()
    server.run()
