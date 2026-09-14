# Resume Extraction Model — Integration Contract

**Purpose:** lock down exactly what the fine-tuned extraction model needs to
produce and hand off, so it drops into the backend without rework on either side.

---

## 1. Output JSON Schema (must match exactly)

Base schema from `sandeeppanem/resume-json-extraction-5k`. If you changed any
field during training, **tell me before you finish** — this schema is wired
directly into the `Candidate` DB model, API responses, and the RAG matching
stage downstream.

```json
{
  "current_title": "string",
  "previous_titles": ["string", "..."],        // max 3
  "current_company": "string",
  "previous_companies": ["string", "..."],      // max 3
  "years_experience": 0.0,
  "seniority": "junior | mid | senior | lead | principal",
  "primary_domain": "string",
  "industries": ["string", "..."],              // max 3
  "core_skills": ["string", "..."],             // max 3
  "secondary_skills": ["string", "..."],        // max 3
  "tools": ["string", "..."],                   // max 3, nullable
  "leadership_experience": true,
  "key_achievements": ["string", "..."],        // max 3
  "location": "string | null",
  "summary": "string"                            // max 300 chars
}
```

**Note:** this schema has no `name`, `email`, or `phone`. That's intentional —
those get handled separately on the backend side, not by the extraction
model. Don't add them in.

---

## 2. Prompt / Format (must match exactly)

Model is `unsloth/gpt-oss-20b-unsloth-bnb-4bit`, trained on **harmony format**
— not the Qwen3 `<|im_start|>` template the original dataset ships in.

Please send me, verbatim:

- [ ] The exact **system prompt** used during training (word-for-word)
- [ ] The exact **harmony-format wrapper** used around the resume text
- [ ] The **reasoning effort level** used, if set (`low` / `medium` / `high`)
- [ ] Confirmation that `enable_thinking` / chain-of-thought output was
      **disabled** for training (we need raw JSON out, not reasoning traces)

At inference time I need to reproduce this exactly, or output quality drops.
If it's just a script, sending me the actual prompt-construction code is easiest.

---

## 3. What to hand off

Pick whichever applies — **please confirm which one before final handoff**:

| Option | What it is | What I need to run it |
|---|---|---|
| A. LoRA adapter only | Small adapter file(s) on top of `unsloth/gpt-oss-20b-unsloth-bnb-4bit` | Base model + `transformers` + `peft`, loaded together at inference |
| B. Merged model | Full merged weights, standalone | Heavier download, no base model needed separately |
| C. **GGUF (preferred)** | Quantized, standalone, runs in LM Studio | Nothing extra — this is what plugs directly into our local demo setup |

If you can export to GGUF after training (Unsloth supports this directly),
that's the one that saves me the most integration work.

---

## 4. Eval sanity check before handoff

Before sending it over, if possible run it on ~10-20 held-out resumes and
confirm:
- Output is valid JSON every time (no truncation, no explanation text mixed in)
- Field values look right, not hallucinated
- Nulls appear where info is genuinely missing, not guessed

Doesn't need to be formal — just a gut check so we're not debugging obvious
issues on my end after the handoff.

---

## 5. What happens on my end once I have it

`extract_resume_fields()` in the backend already has a flag
(`MOCK_EXTRACTION`) built for exactly this swap. Once I have the model +
prompt format confirmed, flipping it to real inference is a contained change
— nothing else in the pipeline should need to move.
