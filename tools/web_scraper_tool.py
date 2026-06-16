"""
Web Scraper Tool - Extract clean text content from web pages
Uses trafilatura for high-quality content extraction.
"""
import json
from typing import Optional

import httpx
import trafilatura
from bs4 import BeautifulSoup
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from utils.config import config
from utils.logger import log


class WebScraperInput(BaseModel):
    """Input schema for web scraper."""
    url: str = Field(description="URL of the web page to scrape")
    max_length: Optional[int] = Field(
        default=5000,
        description="Maximum character length of extracted content"
    )
    include_metadata: Optional[bool] = Field(
        default=True,
        description="Include page metadata (title, author, date, description)"
    )


class WebScraperTool(BaseTool):
    """Scrape and extract clean content from web pages."""

    name: str = "web_scraper"
    description: str = (
        "Extract clean, readable text content from a web page URL. "
        "Removes ads, navigation, footers, and other noise. "
        "Returns the main article content along with metadata."
    )
    args_schema: type[BaseModel] = WebScraperInput

    def _run(
        self,
        url: str,
        max_length: int = 5000,
        include_metadata: bool = True,
    ) -> str:
        """Scrape web page and extract content."""
        try:
            with httpx.Client(
                timeout=30.0,
                follow_redirects=True,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/125.0.0.0 Safari/537.36"
                    )
                },
            ) as client:
                response = client.get(url)
                response.raise_for_status()
                html = response.text

        except httpx.HTTPError as e:
            log.error(f"Failed to fetch {url}: {e}")
            return json.dumps({"error": f"HTTP error: {e}", "url": url}, ensure_ascii=False)

        except Exception as e:
            log.error(f"Scrape error for {url}: {e}")
            return json.dumps({"error": str(e), "url": url}, ensure_ascii=False)

        # Extract content using trafilatura
        downloaded = trafilatura.fetch_response(url)
        if downloaded and downloaded.status == 200:
            content = trafilatura.extract(
                downloaded,
                include_comments=False,
                include_tables=True,
                favor_precision=True,
                url=url,
            )
        else:
            # Fallback to BeautifulSoup
            soup = BeautifulSoup(html, "lxml")
            # Remove script and style elements
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()
            content = soup.get_text(separator="\n", strip=True)

        if not content:
            return json.dumps({"error": "Could not extract content", "url": url}, ensure_ascii=False)

        # Truncate if needed
        original_length = len(content)
        if len(content) > max_length:
            content = content[:max_length] + f"\n\n[... Content truncated. Original length: {original_length} chars]"

        result = {
            "url": url,
            "content": content,
            "content_length": original_length,
        }

        # Extract metadata
        if include_metadata:
            metadata = trafilatura.extract(
                downloaded if downloaded else html,
                output_format="json",
                url=url,
            ) if downloaded else None

            soup = BeautifulSoup(html, "lxml")
            result["metadata"] = {
                "title": soup.title.string if soup.title else "",
                "description": (
                    soup.find("meta", attrs={"name": "description"})
                    .get("content", "")
                    if soup.find("meta", attrs={"name": "description"})
                    else ""
                ),
                "author": (
                    soup.find("meta", attrs={"name": "author"})
                    .get("content", "")
                    if soup.find("meta", attrs={"name": "author"})
                    else ""
                ),
            }

        log.info(f"[green]Scraped:[/green] {url} ({original_length} chars)")
        return json.dumps(result, ensure_ascii=False, indent=2)


class BatchWebScraperTool(BaseTool):
    """Scrape multiple URLs in batch for efficient parallel extraction."""

    name: str = "batch_web_scraper"
    description: str = (
        "Scrape multiple web pages in batch. Provide a JSON list of URLs. "
        "Returns extracted content from all pages."
    )

    def _run(self, urls_json: str, max_length: int = 3000) -> str:
        """Scrape multiple URLs."""
        try:
            urls = json.loads(urls_json)
            if isinstance(urls, str):
                urls = [urls]
        except json.JSONDecodeError:
            urls = [urls_json]

        scraper = WebScraperTool()
        results = []

        for url in urls[:10]:  # Max 10 URLs per batch
            log.info(f"[cyan]Scraping:[/cyan] {url}")
            result_json = scraper._run(url=url, max_length=max_length, include_metadata=False)
            try:
                parsed = json.loads(result_json)
                if "error" not in parsed:
                    results.append(parsed)
            except json.JSONDecodeError:
                continue

        return json.dumps({
            "total_scraped": len(results),
            "results": results,
        }, ensure_ascii=False, indent=2)
