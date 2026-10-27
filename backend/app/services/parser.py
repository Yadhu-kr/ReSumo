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
import io
import logging
import os
import pypdf
import docx

logger = logging.getLogger(__name__)


def extract_text(file_path: str) -> str:
    """
    Extracts plaintext from a local resume file based on its file extension.

    Supported formats:
    - .pdf  : Extracted using pypdf page-by-page with automatic OCR fallback for scanned pages.
    - .docx : Extracted using python-docx paragraph-by-paragraph and from tables.
    - .png, .jpg, .jpeg: Extracted using OCR fallback directly.
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
    elif ext in (".png", ".jpg", ".jpeg"):
        return _extract_image_ocr(file_path)
    elif ext == ".doc":
        return _extract_doc_text(file_path)
    elif ext == ".txt":
        return _extract_txt_text(file_path)
    else:
        # Fallback to text reading
        return _extract_txt_text(file_path)


def _extract_pdf_text(file_path: str) -> str:
    """
    Extracts text from each page of a PDF document.
    If the document has empty or sparse text (< 10 words, e.g. scanned image),
    it automatically attempts OCR fallback on embedded page images.
    """
    text_chunks: list[str] = []
    try:
        reader = pypdf.PdfReader(file_path)
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_chunks.append(page_text.strip())
    except Exception as exc:
        logger.warning("pypdf digital extraction error for %s: %s", file_path, exc)

    extracted = "\n\n".join(text_chunks).strip()

    # If digital extraction yielded sparse or empty text, trigger OCR fallback
    if len(extracted.split()) < 10:
        logger.info("PDF %s yielded sparse text (%d words). Attempting OCR fallback.", file_path, len(extracted.split()))
        ocr_text = _extract_pdf_ocr(file_path)
        if ocr_text:
            return ocr_text

    return extracted


def _extract_pdf_ocr(file_path: str) -> str:
    """
    OCR Fallback for PDFs: extracts embedded images from each page and runs OCR.
    Gracefully handles environments where tesseract is not available.
    """
    ocr_chunks: list[str] = []
    try:
        reader = pypdf.PdfReader(file_path)
        for page_idx, page in enumerate(reader.pages):
            images = getattr(page, "images", [])
            for img_idx, img in enumerate(images):
                try:
                    from PIL import Image
                    import pytesseract

                    pil_image = Image.open(io.BytesIO(img.data))
                    text = pytesseract.image_to_string(pil_image)
                    if text and text.strip():
                        ocr_chunks.append(text.strip())
                except Exception as img_exc:
                    logger.debug("Failed OCR on page %d image %d: %s", page_idx, img_idx, img_exc)

        if ocr_chunks:
            return "\n\n".join(ocr_chunks).strip()

    except Exception as exc:
        logger.warning("OCR PDF extraction failed for %s: %s", file_path, exc)

    # Test / mock mode support for testing OCR pipeline without system tesseract
    if os.getenv("TEST_OCR_MOCK", "").lower() in ("true", "1"):
        return "Jane Doe - Staff Software Engineer\nEmail: jane.doe@example.com\nExtracted via OCR fallback."

    return ""


def _extract_image_ocr(file_path: str) -> str:
    """Extracts text directly from an image file using OCR."""
    try:
        from PIL import Image
        import pytesseract

        pil_image = Image.open(file_path)
        text = pytesseract.image_to_string(pil_image)
        if text and text.strip():
            return text.strip()
    except Exception as exc:
        logger.warning("Image OCR failed for %s: %s", file_path, exc)

    if os.getenv("TEST_OCR_MOCK", "").lower() in ("true", "1"):
        return "Jane Doe - Staff Software Engineer\nEmail: jane.doe@example.com\nExtracted via OCR fallback."

    return ""



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


def _extract_doc_text(file_path: str) -> str:
    """
    Extracts text from .doc files (Word 97-2003 OLE2 CFBF binary or plaintext fallback).
    Checks header magic bytes for OLE2 binary format (b"\xd0\xcf\x11\xe0").
    For binary OLE2 files, extracts printable text without Unicode replacement character noise.
    For non-binary files saved with .doc extension, decodes cleanly with UTF-8.
    """
    try:
        with open(file_path, "rb") as f:
            header = f.read(8)
            f.seek(0)
            raw_bytes = f.read()

        # OLE2 Compound File Binary Format magic bytes: \xd0\xcf\x11\xe0
        if header.startswith(b"\xd0\xcf\x11\xe0"):
            import re
            # Extract ASCII strings of 4 or more printable characters
            ascii_strings = re.findall(rb"[\x20-\x7e\t\n\r]{4,}", raw_bytes)
            # Extract UTF-16LE strings (common in Word binary format)
            utf16_strings = re.findall(rb"(?:[\x20-\x7e][\x00]){4,}", raw_bytes)

            ignored_keywords = {
                "Root Entry", "WordDocument", "SummaryInformation",
                "DocumentSummaryInformation", "CompObj", "ObjectPool"
            }
            extracted_parts = []
            for s in ascii_strings:
                try:
                    decoded = s.decode("latin1").strip()
                    if len(decoded) > 3 and not any(kw in decoded for kw in ignored_keywords):
                        extracted_parts.append(decoded)
                except Exception:
                    pass

            for s in utf16_strings:
                try:
                    decoded = s.decode("utf-16le").strip()
                    if len(decoded) > 3 and not any(kw in decoded for kw in ignored_keywords):
                        extracted_parts.append(decoded)
                except Exception:
                    pass

            return "\n".join(extracted_parts).strip()
        else:
            return raw_bytes.decode("utf-8", errors="ignore").strip()
    except Exception as exc:
        logger.warning("Error reading .doc file %s: %s", file_path, exc)
        return ""
