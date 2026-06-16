"""
SearXNG Search Tool - Multi-source web search via SearXNG
Aggregates Google, Bing, DuckDuckGo, Wikipedia, ArXiv, GitHub, etc.
"""
import json
import time
from typing import Optional

import httpx
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from utils.config import config
from utils.logger import log


class SearXNGSearchInput(BaseModel):
    """Input schema for SearXNG search."""
    query: str = Field(description="Search query string")
    categories: Optional[str] = Field(
        default="general",
        description="Search categories: general, images, videos, news, science, it, files, social media"
    )
    language: Optional[str] = Field(
        default="vi",
        description="Language code: vi, en, ja, ko, zh, etc."
    )
    max_results: Optional[int] = Field(
        default=10,
        description="Maximum number of results to return"
    )
    time_range: Optional[str] = Field(
        default=None,
        description="Time filter: day, week, month, year"
    )


class SearXNGSearchTool(BaseTool):
    """Search the web using SearXNG meta search engine."""

    name: str = "searxng_search"
    description: str = (
        "Search the web across multiple sources (Google, Bing, DuckDuckGo, Wikipedia, "
        "ArXiv, GitHub, StackOverflow, Reddit, etc.) via SearXNG. "
        "Returns structured results with titles, URLs, snippets, and source engines."
    )
    args_schema: type[BaseModel] = SearXNGSearchInput

    def _run(
        self,
        query: str,
        categories: str = "general",
        language: str = "vi",
        max_results: int = 10,
        time_range: str | None = None,
    ) -> str:
        """Execute search via SearXNG API."""
        params = {
            "q": query,
            "format": "json",
            "categories": categories,
            "language": language,
            "pageno": 1,
        }
        if time_range:
            params["time_range"] = time_range

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.get(
                    f"{config.SEARXNG_HOST}/search",
                    params=params,
                    headers={"Accept": "application/json"},
                )
                response.raise_for_status()
                data = response.json()

        except httpx.ConnectError:
            log.error("[bold red]Cannot connect to SearXNG![/bold red] Make sure it's running on {config.SEARXNG_HOST}")
            return json.dumps({
                "error": "SearXNG connection failed",
                "suggestion": "Run: docker compose up -d searxng",
                "results": [],
            }, ensure_ascii=False)

        except Exception as e:
            log.error(f"Search error: {e}")
            return json.dumps({"error": str(e), "results": []}, ensure_ascii=False)

        # Parse and format results
        results = []
        for item in data.get("results", [])[:max_results]:
            result = {
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "snippet": item.get("content", ""),
                "engine": item.get("engine", ""),
                "score": item.get("score", 0),
                "category": item.get("category", ""),
            }
            # Clean up snippet
            if result["snippet"] and len(result["snippet"]) > 300:
                result["snippet"] = result["snippet"][:300] + "..."
            results.append(result)

        log.info(f"[green]Found {len(results)} results for:[/green] {query}")

        # Save results
        self._save_results(query, results)

        return json.dumps({
            "query": query,
            "total_results": len(results),
            "results": results,
        }, ensure_ascii=False, indent=2)

    def _save_results(self, query: str, results: list):
        """Cache search results for later reference."""
        config.ensure_dirs()
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        safe_query = "".join(c if c.isalnum() or c in " -_" else "_" for c in query)[:50]
        filepath = config.SEARCH_RESULTS_DIR / f"{timestamp}_{safe_query}.json"

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump({"query": query, "results": results, "timestamp": timestamp}, f, ensure_ascii=False, indent=2)


class MultiCategorySearchTool(BaseTool):
    """Search across multiple categories simultaneously for comprehensive coverage."""

    name: str = "multi_category_search"
    description: str = (
        "Perform parallel searches across multiple categories (web, news, science, IT, social media) "
        "to get comprehensive coverage of a topic. Best for research queries."
    )
    args_schema: type[BaseModel] = SearXNGSearchInput

    def _run(
        self,
        query: str,
        categories: str = "general,news,science,it",
        language: str = "vi",
        max_results: int = 5,
        time_range: str | None = None,
    ) -> str:
        """Search multiple categories in sequence (SearXNG handles one category per request)."""
        all_results = []
        category_list = [c.strip() for c in categories.split(",")]
        search_tool = SearXNGSearchTool()

        for cat in category_list:
            log.info(f"[cyan]Searching category:[/cyan] {cat}")
            result_json = search_tool._run(
                query=query,
                categories=cat,
                language=language,
                max_results=max_results,
                time_range=time_range,
            )
            try:
                parsed = json.loads(result_json)
                for r in parsed.get("results", []):
                    r["search_category"] = cat
                    all_results.append(r)
            except json.JSONDecodeError:
                continue

        # Deduplicate by URL
        seen_urls = set()
        unique_results = []
        for r in all_results:
            if r["url"] not in seen_urls:
                seen_urls.add(r["url"])
                unique_results.append(r)

        return json.dumps({
            "query": query,
            "categories_searched": category_list,
            "total_results": len(unique_results),
            "results": unique_results[:max_results * len(category_list)],
        }, ensure_ascii=False, indent=2)
