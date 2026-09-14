"""
Pre-processing service for resume file text extraction.

RESPONSIBILITY:
Binary-to-plaintext conversion only (PDF, DOCX, TXT -> clean plaintext string).
This plaintext serves as the raw input to be fed into the QLoRA fine-tuned
extraction LLM.

NOTE FOR ACADEMIC DEFENSE:
This module deliberately does NOT perform regex or heuristic entity extraction
(e.g., extracting skills or candidate names). All semantic understanding is
reserved for the fine-tuned LLM in downstream stages.
"""
import os
import pypdf
import docx


def extract_text(file_path: str) -> str:
    """
    Extracts plaintext from a local resume file based on its file extension.

    Supported formats:
    - .pdf  : Extracted using pypdf page-by-page.
    - .docx : Extracted using python-docx paragraph-by-paragraph and from tables.
    - .txt  : Read directly with UTF-8 encoding (with character replacement fallback).

    Returns:
        Clean plaintext extracted from the document, or empty string if no text is found.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found at path: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        return _extract_pdf_text(file_path)
    elif ext == ".docx":
        return _extract_docx_text(file_path)
    elif ext in (".txt", ".doc"):
        return _extract_txt_text(file_path)
    else:
        # Fallback to text reading
        return _extract_txt_text(file_path)


def _extract_pdf_text(file_path: str) -> str:
    """Extracts text from each page of a PDF document."""
    text_chunks: list[str] = []
    try:
        reader = pypdf.PdfReader(file_path)
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_chunks.append(page_text.strip())
    except Exception:
        # Return whatever text was successfully parsed before error
        pass
    return "\n\n".join(text_chunks).strip()


def _extract_docx_text(file_path: str) -> str:
    """Extracts text from paragraphs and tables of a DOCX document."""
    text_chunks: list[str] = []
    try:
        doc = docx.Document(file_path)
        for para in doc.paragraphs:
            if para.text.strip():
                text_chunks.append(para.text.strip())

        for table in doc.tables:
            for row in table.rows:
                row_texts = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if row_texts:
                    text_chunks.append(" | ".join(row_texts))
    except Exception:
        pass
    return "\n\n".join(text_chunks).strip()


def _extract_txt_text(file_path: str) -> str:
    """Reads plaintext files with UTF-8 encoding and fallback character replacement."""
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read().strip()
    except Exception:
        return ""
