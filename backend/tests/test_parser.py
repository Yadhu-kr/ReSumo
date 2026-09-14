import os
import pytest
import pypdf
import docx

from app.services.parser import extract_text


def test_extract_text_txt(tmp_path):
    txt_file = tmp_path / "resume.txt"
    content = "Alex Mercer\nSoftware Engineer\nPython, FastAPI, SQL"
    txt_file.write_text(content, encoding="utf-8")

    extracted = extract_text(str(txt_file))
    assert "Alex Mercer" in extracted
    assert "Python, FastAPI, SQL" in extracted


def test_extract_text_docx(tmp_path):
    docx_file = tmp_path / "resume.docx"
    doc = docx.Document()
    doc.add_heading("Jane Doe", 0)
    doc.add_paragraph("Machine Learning Specialist with PyTorch and NLP experience.")
    table = doc.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Skill: Python"
    table.rows[0].cells[1].text = "Level: Expert"
    doc.save(str(docx_file))

    extracted = extract_text(str(docx_file))
    assert "Jane Doe" in extracted
    assert "Machine Learning Specialist" in extracted
    assert "Skill: Python" in extracted


def test_extract_text_pdf(tmp_path):
    pdf_file = tmp_path / "resume.pdf"
    
    # Create a valid PDF with text using pypdf
    writer = pypdf.PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    # Note: pypdf blank pages don't have text streams, but we can write an empty or minimal structure
    with open(pdf_file, "wb") as f:
        writer.write(f)

    # Empty/blank PDF should return empty string without error
    extracted = extract_text(str(pdf_file))
    assert isinstance(extracted, str)


def test_extract_text_file_not_found():
    with pytest.raises(FileNotFoundError):
        extract_text("non_existent_file.pdf")
