"""
MAS-OpenClaw Async Pipeline - Song song hóa search & scrape
Thay vì tìm kiếm tuần tự → song song → giảm 50-70% thời gian.

Trước: Search(cat1) → Search(cat2) → Search(cat3) → Scrape(url1) → Scrape(url2) → ...
Sau:   Search(cat1) ─┐
       Search(cat2) ─┤→ Merge → Scrape(url1) ─┐
       Search(cat3) ─┘   → Scrape(url2) ─┤→ Merge → Analyze → Response
                                           → Scrape(url3) ─┘
"""
import asyncio
import json
import time
from typing import Optional

import httpx
from rich.console import Console

from utils.config import config
from utils.logger import log
from utils.memory import get_memory

console = Console()


class AsyncSearchPipeline:
    """
    Async pipeline cho tìm kiếm & đọc sâu song song.
    
    Tối ưu cho RTX 3090 + 96GB RAM:
    - 10-20 concurrent HTTP requests (search + scrape)
    - Memory cache tránh lặp
    - Smart deduplication
    """

    def __init__(self, max_concurrent_searches: int = 5, max_concurrent_scrapes: int = 10):
        self.max_concurrent_searches = max_concurrent_searches
        self.max_concurrent_scrapes = max_concurrent_scrapes
        self.memory = get_memory()
        self.searxng_host = config.SEARXNG_HOST

    async def search_single(
        self,
        client: httpx.AsyncClient,
        query: str,
        category: str = "general",
        language: str = "vi",
        max_results: int = 10,
    ) -> dict:
        """Execute a single async search via SearXNG."""
        # Check cache first
        cached = self.memory.get_cached_search(query, category, max_age_hours=6)
        if cached:
            return {"query": query, "category": category, "results": cached, "from_cache": True}

        params = {
            "q": query,
            "format": "json",
            "categories": category,
            "language": language,
            "pageno": 1,
        }

        try:
            response = await client.get(
                f"{self.searxng_host}/search",
                params=params,
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            data = response.json()

            results = []
            for item in data.get("results", [])[:max_results]:
                results.append({
                    "title": item.get("title", ""),
                    "url": item.get("url", ""),
                    "snippet": item.get("content", ""),
                    "engine": item.get("engine", ""),
                    "score": item.get("score", 0),
                })

            # Cache the results
            self.memory.cache_search(query, category, results)

            return {"query": query, "category": category, "results": results, "from_cache": False}

        except Exception as e:
            log.error(f"Search error ({category}): {e}")
            return {"query": query, "category": category, "results": [], "error": str(e)}

    async def search_multi_category(
        self,
        query: str,
        categories: list[str] = None,
        language: str = "vi",
        max_results_per_category: int = 5,
    ) -> list[dict]:
        """
        Tìm kiếm song song nhiều category.
        Thay vì tuần tự 4-6s/category → song song ~2s tổng.
        """
        if categories is None:
            categories = ["general", "news", "science", "it"]

        semaphore = asyncio.Semaphore(self.max_concurrent_searches)

        async def limited_search(client, cat):
            async with semaphore:
                return await self.search_single(
                    client, query, category=cat,
                    language=language, max_results=max_results_per_category,
                )

        async with httpx.AsyncClient(timeout=30.0) as client:
            tasks = [limited_search(client, cat) for cat in categories]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        # Merge & deduplicate
        all_items = []
        seen_urls = set()
        for result in results:
            if isinstance(result, Exception):
                continue
            for item in result.get("results", []):
                if item["url"] not in seen_urls:
                    seen_urls.add(item["url"])
                    item["search_category"] = result["category"]
                    all_items.append(item)

        # Sort by score
        all_items.sort(key=lambda x: x.get("score", 0), reverse=True)

        log.info(f"[green]Async search found {len(all_items)} unique results for:[/green] {query}")
        return all_items

    async def scrape_single(
        self,
        client: httpx.AsyncClient,
        url: str,
        max_length: int = 3000,
    ) -> Optional[dict]:
        """Async scrape a single URL."""
        try:
            response = await client.get(url)
            response.raise_for_status()
            html = response.text

            # Use trafilatura for extraction
            import trafilatura
            downloaded = trafilatura.fetch_response(url)
            if downloaded and downloaded.status == 200:
                content = trafilatura.extract(
                    downloaded, include_comments=False,
                    include_tables=True, favor_precision=True, url=url,
                )
            else:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(html, "lxml")
                for tag in soup(["script", "style", "nav", "footer", "header"]):
                    tag.decompose()
                content = soup.get_text(separator="\n", strip=True)

            if not content:
                return None

            if len(content) > max_length:
                content = content[:max_length] + "..."

            return {"url": url, "content": content, "content_length": len(content)}

        except Exception as e:
            log.warning(f"Scrape failed for {url}: {e}")
            return None

    async def scrape_batch(self, urls: list[str], max_length: int = 3000) -> list[dict]:
        """
        Scrape nhiều URL song song.
        Thay vì tuần tự 30s/URL → song song ~5s cho 10 URLs.
        """
        semaphore = asyncio.Semaphore(self.max_concurrent_scrapes)

        async def limited_scrape(client, url):
            async with semaphore:
                return await self.scrape_single(client, url, max_length)

        async with httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
        ) as client:
            tasks = [limited_scrape(client, url) for url in urls[:15]]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out failures
        successful = [r for r in results if isinstance(r, dict) and r is not None]
        log.info(f"[green]Async scraped {len(successful)}/{len(urls)} URLs[/green]")
        return successful

    async def full_research_pipeline(
        self,
        query: str,
        categories: list[str] = None,
        max_sources: int = 10,
    ) -> dict:
        """
        Pipeline hoàn chỉnh: search song song → scrape song song → trả kết quả.
        
        Benchmarks dự kiến (RTX 3090 + Ryzen 9 9950X):
        - Quick: ~5s (1 search, no scrape)
        - Standard: ~15s (3 searches + 5 scrapes)
        - Deep: ~30s (5 searches + 10 scrapes)
        
        So với pipeline tuần tự:
        - Quick: 5s → 5s (không đổi)
        - Standard: 45s → 15s (3x nhanh hơn)
        - Deep: 120s → 30s (4x nhanh hơn)
        """
        start = time.time()

        # Phase 1: Parallel search
        console.print("[bold cyan]🔎 Phase 1: Parallel search...[/bold cyan]")
        search_results = await self.search_multi_category(
            query, categories=categories, max_results_per_category=5,
        )

        # Phase 2: Select top URLs for scraping
        top_urls = [r["url"] for r in search_results[:max_sources]]
        
        console.print(f"[bold cyan]📖 Phase 2: Scraping {len(top_urls)} URLs in parallel...[/bold cyan]")
        scraped = await self.scrape_batch(top_urls, max_length=4000)

        elapsed = time.time() - start
        console.print(f"[bold green]✅ Pipeline completed in {elapsed:.1f}s[/bold green]")

        return {
            "query": query,
            "search_results": search_results,
            "scraped_content": scraped,
            "stats": {
                "total_urls_found": len(search_results),
                "urls_scraped": len(scraped),
                "elapsed_seconds": round(elapsed, 1),
            },
        }


def run_async_pipeline(query: str, categories: list = None, max_sources: int = 10) -> dict:
    """Sync wrapper for async pipeline (for use in CrewAI tools)."""
    pipeline = AsyncSearchPipeline()
    return asyncio.run(
        pipeline.full_research_pipeline(query, categories=categories, max_sources=max_sources)
    )
