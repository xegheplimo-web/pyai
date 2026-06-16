"""
Document Reader Tool - Extract text from PDF, DOCX, and other document formats.
"""
import json
from pathlib import Path
from typing import Optional

from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from utils.logger import log


class DocumentReaderInput(BaseModel):
    """Input schema for document reader."""
    file_path: str = Field(description="Path to the document file")
    max_length: Optional[int] = Field(default=10000, description="Maximum content length")


class DocumentReaderTool(BaseTool):
    """Read and extract text from PDF, DOCX, TXT, and MD files."""

    name: str = "document_reader"
    description: str = (
        "Extract text content from local document files. "
        "Supports PDF, DOCX, TXT, and Markdown formats."
    )
    args_schema: type[BaseModel] = DocumentReaderInput

    def _run(self, file_path: str, max_length: int = 10000) -> str:
        """Read document and extract text."""
        path = Path(file_path)

        if not path.exists():
            return json.dumps({"error": f"File not found: {file_path}"}, ensure_ascii=False)

        suffix = path.suffix.lower()
        content = ""

        try:
            if suffix == ".pdf":
                content = self._read_pdf(path)
            elif suffix == ".docx":
                content = self._read_docx(path)
            elif suffix in (".txt", ".md", ".markdown"):
                content = path.read_text(encoding="utf-8")
            else:
                return json.dumps({"error": f"Unsupported format: {suffix}"}, ensure_ascii=False)

        except Exception as e:
            log.error(f"Document read error: {e}")
            return json.dumps({"error": str(e), "file_path": file_path}, ensure_ascii=False)

        original_length = len(content)
        if len(content) > max_length:
            content = content[:max_length] + f"\n\n[... Truncated from {original_length} chars]"

        return json.dumps({
            "file_path": str(path),
            "format": suffix,
            "content": content,
            "content_length": original_length,
        }, ensure_ascii=False, indent=2)

    @staticmethod
    def _read_pdf(path: Path) -> str:
        """Extract text from PDF using pypdf."""
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n\n".join(pages)

    @staticmethod
    def _read_docx(path: Path) -> str:
        """Extract text from DOCX using python-docx."""
        from docx import Document
        doc = Document(str(path))
        return "\n\n".join(para.text for para in doc.paragraphs if para.text.strip())
