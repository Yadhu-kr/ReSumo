import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
    HRFlowable,
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        
        # Draw running header & footer on all pages
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#1E293B"))
        self.drawString(54, 752, "ReSumo — Technical Execution Pipeline & Architecture Specification")
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawRightString(612 - 54, 752, "CSD 415 Evaluation Document")
        
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.6)
        self.line(54, 745, 612 - 54, 745)

        # Running Footer
        self.line(54, 45, 612 - 54, 45)
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(54, 32, "AI-Driven Recruitment & Onboarding Automation with Human-in-the-Loop Approval")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(612 - 54, 32, page_text)

        self.restoreState()

def build_pdf(filename="ReSumo_Technical_Architecture_and_Execution_Pipeline.pdf"):
    # 54pt = 0.75 in margins
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )

    # Custom Palette
    c_primary = colors.HexColor("#0F172A")    # Slate 900
    c_brand = colors.HexColor("#1E3A8A")      # Blue 900
    c_accent = colors.HexColor("#2563EB")     # Blue 600
    c_red = colors.HexColor("#991B1B")        # Red 800
    c_slate_dark = colors.HexColor("#334155") # Slate 700
    c_slate_light = colors.HexColor("#F8FAFC")# Slate 50
    c_border = colors.HexColor("#CBD5E1")

    # Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=c_primary,
        spaceAfter=3,
    )
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=c_brand,
        spaceAfter=8,
    )
    meta_style = ParagraphStyle(
        'MetaStyle',
        fontName='Helvetica',
        fontSize=8,
        leading=11.5,
        textColor=c_slate_dark,
    )
    h1_style = ParagraphStyle(
        'H1',
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=c_brand,
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True,
    )
    h2_style = ParagraphStyle(
        'H2',
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=c_primary,
        spaceBefore=6,
        spaceAfter=3,
        keepWithNext=True,
    )
    body_style = ParagraphStyle(
        'Body',
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=c_primary,
        spaceAfter=4,
    )
    bullet_style = ParagraphStyle(
        'Bullet',
        fontName='Helvetica',
        fontSize=8.2,
        leading=11,
        textColor=c_primary,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=2.5,
    )
    code_block = ParagraphStyle(
        'Code',
        fontName='Courier',
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#0F172A"),
        backColor=colors.HexColor("#F1F5F9"),
        borderPadding=5,
        spaceBefore=3,
        spaceAfter=4,
    )
    callout_style = ParagraphStyle(
        'Callout',
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#1E3A8A"),
        backColor=colors.HexColor("#EFF6FF"),
        borderPadding=5,
        spaceBefore=3,
        spaceAfter=4,
    )

    story = []

    # =========================================================================
    # PAGE 1: TITLE, EXECUTIVE SUMMARY & INGESTION / OCR
    # =========================================================================
    story.append(Paragraph("ReSumo Platform Technical Architecture", title_style))
    story.append(Paragraph("End-to-End System Execution Flow: Ingestion, Full-SFT Parser, Embeddings, Database & Semantic RAG", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.2, color=c_brand, spaceBefore=0, spaceAfter=6))

    meta_text = """
    <b>Project Title:</b> AI-Driven Recruitment & Onboarding Automation with Human-in-the-Loop Approval<br/>
    <b>Course:</b> CSD 415 — Project Evaluation | <b>Department:</b> Computer Science & Engineering<br/>
    <b>Supervisor:</b> Dr. Sumod Sundar (Associate Dean, Department of Computer Science)<br/>
    <b>Authors:</b> Niya Susan Rajeev (PRC23CS074), Murali Krishnan R (PRC23CS070), Yadhu Krishnan R (PRC23CS088), Jan Cherian Thomas (PRC23CS052)<br/>
    <b>Evaluation Date:</b> October 28, 2026
    """
    story.append(Paragraph(meta_text, meta_style))
    story.append(Spacer(1, 6))

    story.append(Paragraph("1. Chronological Pipeline Execution Overview", h1_style))
    
    flow_data = [
        ["Stage", "Pipeline Stage", "Core Technology", "Execution Details & State Artifacts"],
        ["01", "Upload Gateway", "FastAPI / UUIDv4", "File validation (PDF/DOCX, <5MB), unique disk write."],
        ["02", "Text & OCR Engine", "pypdf / Tesseract v5", "Dual-mode parsing (<10 words triggers OCR fallback)."],
        ["03", "Full SFT LLM Parser", "Qwen2.5 (Full SFT)", "Strict extraction into standardized 15-key JSON schema."],
        ["04", "Transactional DB", "PostgreSQL / SQLAlchemy", "Candidate row saved with 'parsed' status and JSONB profile."],
        ["05", "Vector Embedding", "BAAI/bge-large-en-v1.5", "Encodes structured candidate profile into 1,024-dim vector."],
        ["06", "Vector Indexing", "ChromaDB (HNSW)", "Inserts normalized vector in Cosine Space for ANN lookup."],
        ["07", "Job Embedding", "FastAPI / bge-large", "Embeds Job Description into 1,024-dim query vector."],
        ["08", "Semantic Matching", "Cosine Metric Space", "Calculates contextual match % (Score = 1 - Cosine Distance)."],
        ["09", "Explainable RAG", "Grounded LLM Generator", "Generates human-readable fit rationale (strengths vs gaps)."],
        ["10", "Tiered HITL Signoff", "Hierarchical State Machine", "Policy escalation: Junior/Mid -> HM, Senior -> VP, Exec -> CEO."],
    ]
    t_flow = Table(flow_data, colWidths=[28, 95, 115, 266])
    t_flow.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_brand),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 7.5),
        ('BOTTOMPADDING', (0,0), (-1,0), 3.5),
        ('TOPPADDING', (0,0), (-1,0), 3.5),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,1), (-1,-1), 7),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_slate_light]),
    ]))
    story.append(t_flow)
    story.append(Spacer(1, 6))

    story.append(Paragraph("2. Stages 1 & 2: Document Ingestion & Dual-Mode OCR Fallback", h1_style))
    story.append(Paragraph(
        "<b>Source Files:</b> <code>backend/app/routers/resumes.py</code>, <code>backend/app/services/parser.py</code>, <code>backend/app/services/contact_extraction.py</code>",
        meta_style
    ))
    story.append(Paragraph("• <b>File Reception & Security:</b> The endpoint <code>POST /api/resumes/upload-resume</code> validates MIME types (<code>.pdf, .docx, .png, .jpg</code>) and enforces a strict 5MB payload limit to prevent buffer exhaustion attacks.", bullet_style))
    story.append(Paragraph("• <b>Atomic Disk Storage:</b> Generates a collision-free UUIDv4 identifier and writes the binary stream to <code>uploads/resumes/&lt;uuid&gt;&lt;ext&gt;</code>.", bullet_style))
    story.append(Paragraph("• <b>Dual-Mode Text Extraction:</b> The service <code>extract_text()</code> reads programmatic text via <code>pypdf</code> or <code>python-docx</code>. <b>OCR Trigger Condition:</b> If extracted text length is &lt; 10 words (scanned image, photocopied resume, flattened graphic PDF), it automatically invokes <b>Tesseract v5 OCR</b> with PIL image binarization.", bullet_style))
    story.append(Paragraph("• <b>Contact Extraction:</b> Runs deterministic regular expressions in <code>extract_contact_info()</code> to isolate Name, Email, Phone, and Portfolio links, creating the initial <code>Candidate</code> record in PostgreSQL with status <code>'uploaded'</code>.", bullet_style))

    story.append(PageBreak())

    # =========================================================================
    # PAGE 2: STAGE 3 - FULL SUPERVISED FINE-TUNED (FULL SFT) MODEL
    # =========================================================================
    story.append(Paragraph("3. Stage 3: Full Supervised Fine-Tuned (Full SFT) Resume Parser", h1_style))
    story.append(Paragraph(
        "<b>Source Files:</b> <code>backend/app/services/extraction.py</code>, <code>backend/app/services/qwen_prompt.py</code>",
        meta_style
    ))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "<b>Why Generalist LLMs Fail for Recruitment Ingestion:</b> Off-the-shelf foundation models (GPT-4, base Qwen) exhibit three core deficiencies in automated recruitment pipelines: (1) <i>Conversational verbosity</i> (emitting polite chatter like 'Here is your JSON:') that causes JSON decoding crashes; (2) <i>Hallucination</i> of missing past companies or skill proficiencies; and (3) <i>Schema key drift</i> (e.g. returning 'exp' or 'skills_list' instead of standardized schema keys).",
        body_style
    ))
    story.append(Spacer(1, 4))

    story.append(Paragraph("Fine-Tuning Methodology & Mathematical Formulation", h2_style))
    story.append(Paragraph("• <b>Base Foundation Model:</b> <b>Qwen2.5</b> Causal Language Model, pre-trained on diverse multilingual text and high-density technical code.", bullet_style))
    story.append(Paragraph("• <b>Training Dataset:</b> <code>sandeeppanem/resume-json-extraction-5k</code> on Hugging Face (5,000 real-world, diverse resumes paired with human-verified 15-key ground truth JSON extractions).", bullet_style))
    story.append(Paragraph("• <b>Data Sanitization:</b> Automated preprocessing pipeline (<code>clean_html</code>) strips HTML/DOM artifacts, unescapes entities, and collapses erratic line breaks into clean text.", bullet_style))
    story.append(Paragraph("• <b>Full SFT Paradigm:</b> Unlike parameter-efficient adapters (LoRA/QLoRA) that only train low-rank decomposition matrices ($r=16$), <b>Full Supervised Fine-Tuning updates 100% of all transformer parameters across all layers</b>. This embeds recruitment domain concepts, non-linear career trajectories, and strict JSON grammar directly into the model's core attention weights.", bullet_style))
    story.append(Paragraph("• <b>Loss Function & Training Objective:</b> Standard auto-regressive Cross-Entropy Loss computed exclusively over the target JSON tokens (prompt tokens masked out):", bullet_style))

    loss_box = """<b>Full SFT Cross-Entropy Loss:</b><br/>
    &nbsp;&nbsp;&nbsp;&nbsp;<b>L<sub>SFT</sub>(&theta;) = - &sum;<sub>t=1</sub><sup>T</sup> log P(y<sub>t</sub> | y<sub>&lt;t</sub>, x<sub>resume</sub>; &theta;)</b><br/>
    Where <i>x<sub>resume</sub></i> is the input resume text, <i>y<sub>t</sub></i> are the ground-truth JSON tokens, and <i>&theta;</i> represents all model weights."""
    story.append(Paragraph(loss_box, code_block))

    story.append(Paragraph("• <b>Local Quantized Serving:</b> Full fine-tuned model weights were exported and quantized to 8-bit GGUF format (<code>resume-parser-q8_0.gguf</code>) and served locally via <code>llama-server</code> / LM Studio on Port 8001/1234. <b>Privacy Advantage:</b> Zero candidate PII leaves the local host, guaranteeing complete GDPR compliance and data privacy.", bullet_style))
    story.append(Paragraph("• <b>Non-Blocking Execution:</b> Invoked asynchronously via Starlette's <code>run_in_threadpool()</code> to prevent local LLM inference (15–30s) from blocking FastAPI's async event loop.", bullet_style))

    story.append(Spacer(1, 4))
    story.append(Paragraph("The Standardized 15-Key JSON Schema Contract", h2_style))
    schema_box = """{
  "current_title": "string",            "previous_titles": ["string", ...],
  "current_company": "string",          "previous_companies": ["string", ...],
  "years_experience": float,            "seniority": "junior | mid | senior | lead | principal",
  "primary_domain": "string",           "industries": ["string", ...],
  "core_skills": ["string", ...],       "secondary_skills": ["string", ...],
  "tools": ["string", ...],             "leadership_experience": boolean,
  "key_achievements": ["string", ...],  "location": "string | null",
  "summary": "string (max 300 chars)"
}"""
    story.append(Paragraph(schema_box, code_block))
    story.append(Paragraph("<i>Null Handling: If a field is missing from the resume, the model outputs null or []. It never invents or guesses facts.</i>", meta_style))

    story.append(PageBreak())

    # =========================================================================
    # PAGE 3: STAGES 4, 5, 6 & 7 - DATABASE, EMBEDDING & CHROMADB RAG
    # =========================================================================
    story.append(Paragraph("4. Stages 4 & 5: Relational State & Dense Vector Embedding", h1_style))
    story.append(Paragraph(
        "<b>Source Files:</b> <code>backend/app/models.py</code>, <code>backend/app/services/embeddings.py</code>",
        meta_style
    ))
    story.append(Paragraph("• <b>PostgreSQL ACID Persistence:</b> The extracted JSON is validated against Pydantic v2 (<code>ParsedResumeData</code>). On successful validation, it is stored in the <code>candidates</code> table under <code>parsed_data</code> (JSONB) with <code>parsed_status = 'parsed'</code>. Multi-tenant company IDs prevent cross-organization data leakage.", bullet_style))
    story.append(Paragraph("• <b>Deterministic Representation String:</b> To prevent semantic dilution from resume filler words, the embedding engine constructs a locked, structured representation string directly from the 15 keys:", bullet_style))

    rep_box = """<b>Semantic Locked Representation String:</b><br/>
    Title: {current_title} | Seniority: {seniority} | Domain: {primary_domain}<br/>
    Skills: {core_skills} | Tools: {tools} | Experience: {years_experience} yrs<br/>
    Achievements: {key_achievements}"""
    story.append(Paragraph(rep_box, code_block))

    story.append(Paragraph("• <b>Embedding Model (BAAI/bge-large-en-v1.5):</b> 1,024 dense semantic vector dimensions, 512 maximum token sequence length. Pre-trained on hundreds of millions of semantic text pairs using InfoNCE contrastive learning.", bullet_style))
    story.append(Paragraph("• <b>L2 Vector Normalization:</b> All vectors are normalized to unit Euclidean sphere length (<b>||v||₂ = 1.0</b>). In unit space, dot product computation is mathematically identical to Cosine Similarity.", bullet_style))

    story.append(Spacer(1, 4))
    story.append(Paragraph("5. Stages 6 & 7: ChromaDB Indexing & Semantic Search Retrieval", h1_style))
    story.append(Paragraph(
        "<b>Source Files:</b> <code>backend/app/services/embeddings.py</code>, <code>backend/app/routers/jobs.py</code>",
        meta_style
    ))
    story.append(Paragraph("• <b>ChromaDB Vector Store:</b> ReSumo initializes a local persistent Chroma client storing vectors in the <code>candidates</code> collection. ChromaDB maintains a <b>Hierarchical Navigable Small World (HNSW)</b> graph index, providing logarithmic <i>O(log N)</i> nearest-neighbor retrieval.", bullet_style))
    story.append(Paragraph("• <b>Dual Database Architecture Rationale:</b> PostgreSQL serves as the ACID transactional source of truth (users, applications, foreign keys, audit logs), while ChromaDB acts as a dedicated ANN vector engine. Decoupling vector search from relational tables prevents database connection pool starvation.", bullet_style))
    story.append(Paragraph("• <b>Job Requisition Embedding:</b> When HR posts a job opening, its title, required seniority, and description are embedded into a 1,024-dimensional query vector <b>q</b>.", bullet_style))
    story.append(Paragraph("• <b>Cosine Similarity Ranking:</b> ChromaDB queries all candidate vectors <b>d<sub>i</sub></b> in Cosine Space:", bullet_style))

    cosine_box = """<b>Cosine Similarity Metric:</b><br/>
    &nbsp;&nbsp;&nbsp;&nbsp;<b>Cosine Sim(q, d<sub>i</sub>) = (q &middot; d<sub>i</sub>) / ( ||q||<sub>2</sub> &middot; ||d<sub>i</sub>||<sub>2</sub> )</b><br/>
    In ChromaDB: <i>Distance = 1.0 - Cosine Similarity</i>. The candidate match percentage is computed as: <b>Match % = (1.0 - Distance) &times; 100%</b>."""
    story.append(Paragraph(cosine_box, code_block))

    story.append(Paragraph("• <b>Threshold & Fallback Filtering:</b> Returns candidates matching <code>Cosine Sim >= MIN_SIMILARITY</code> (e.g. 0.50) up to <code>TOP_K</code>. <b>Chroma Fallback Path:</b> If Stage 3 extraction failed due to a damaged resume, ReSumo embeds the candidate's raw plaintext into ChromaDB, ensuring the candidate remains retrievable in search results.", bullet_style))

    story.append(PageBreak())

    # =========================================================================
    # PAGE 4: STAGES 8, 9 & 10 - XAI, TIERED HITL & VIVA CHEATSHEET
    # =========================================================================
    story.append(Paragraph("6. Stages 8 & 9: Explainable AI (XAI) & Tiered HITL Governance", h1_style))
    story.append(Paragraph(
        "<b>Source Files:</b> <code>backend/app/routers/jobs.py</code>, <code>backend/app/routers/approvals.py</code>, <code>frontend/src/features/recruiter/RecruiterJobsPage.tsx</code>",
        meta_style
    ))
    story.append(Paragraph("• <b>Explainable AI (XAI) Match Rationale:</b> Unlike black-box screening systems that output an ungrounded score, ReSumo's RAG pipeline passes the top-matched candidate profile and job requisition into an LLM with strict grounding directives. It outputs a clear justification citing exact technical overlap, seniority alignment, and specific skill gaps.", bullet_style))
    story.append(Paragraph("• <b>Tiered Human-in-the-Loop (HITL) Policy:</b> ReSumo guarantees that AI never makes hiring decisions autonomously. The AI acts purely as a decision-support copilot. Shortlisting triggers a deterministic multi-tier approval state machine:", bullet_style))

    hitl_table_data = [
        ["Candidate Seniority", "Designated Human Approver", "Verification Policy & Approval Action"],
        ["Junior / Mid", "Hiring Manager (HM)", "Validates core skills overlap, project portfolio, and coding test."],
        ["Senior / Lead", "Engineering Director / VP", "Reviews compensation bounds, architectural scope, and leadership."],
        ["Principal / Executive", "Chief Executive Officer (CEO)", "Final sign-off on executive compensation, equity, and strategic alignment."],
    ]
    t_hitl = Table(hitl_table_data, colWidths=[90, 135, 279])
    t_hitl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_brand),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 7.5),
        ('BOTTOMPADDING', (0,0), (-1,0), 3.5),
        ('TOPPADDING', (0,0), (-1,0), 3.5),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,1), (-1,-1), 7),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_slate_light]),
    ]))
    story.append(t_hitl)
    story.append(Spacer(1, 4))

    story.append(Paragraph("7. Stage 10: AI Interview Console & 5-Pillar Onboarding", h1_style))
    story.append(Paragraph("• <b>Dynamic Interview Console:</b> Generates customized technical interview questions tailored to the candidate's specific parsed resume gaps, paired with a 5-dimension rubric scorecard and dual-interviewer consensus calculation.", bullet_style))
    story.append(Paragraph("• <b>Automated Onboarding Tracker:</b> Upon candidate offer acceptance, ReSumo automatically provisions and tracks 5 operational onboarding pillars: (1) IT & Hardware Access, (2) Legal & Compliance, (3) Banking & Payroll, (4) Corporate Orientation, and (5) HRMS Profile Integration.", bullet_style))

    story.append(Spacer(1, 4))
    story.append(Paragraph("8. Faculty Viva Defense Cheatsheet (Quick Reference)", h1_style))
    viva_text = """
    <b>Q1: Why Full SFT instead of LoRA or QLoRA?</b><br/>
    <i>A: LoRA and QLoRA freeze base weights and only train small low-rank adapter matrices (r=16), limiting the model's structural adaptation capacity. With Full SFT, we updated 100% of all transformer parameters across all layers. This enabled the model to deeply assimilate complex recruitment terminology, varied resume structures, and strict 15-key JSON syntax without adapter bottlenecks or inference overhead. Once trained, the full weights were converted to 8-bit GGUF for rapid local execution.</i><br/><br/>
    <b>Q2: Why use both ChromaDB and PostgreSQL? Why not pgvector alone?</b><br/>
    <i>A: PostgreSQL is our ACID-compliant transactional source of truth for users, jobs, multi-tier approvals, and immutable audit logs. ChromaDB is our dedicated, high-performance vector database optimized specifically for HNSW Approximate Nearest Neighbor (ANN) search. Decoupling transactional queries from high-dimensional vector math prevents connection pool starvation and ensures high concurrency.</i><br/><br/>
    <b>Q3: How does the system prevent LLM hallucinations?</b><br/>
    <i>A: In Stage 3, the fine-tuned parser is trained strictly on target JSON tokens with reasoning traces disabled, and falls back to null/empty lists for missing data. In Stage 8, RAG prompts instruct the LLM to ground its match rationales exclusively in the retrieved candidate profile and job specification.</i>
    """
    story.append(Paragraph(viva_text, callout_style))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated {filename}")

if __name__ == "__main__":
    out_pdf = "/Users/yadhukrishnanr/Documents/Development/ReSumo/docs/ReSumo_Technical_Architecture_and_Execution_Pipeline.pdf"
    build_pdf(out_pdf)
