import html
import re

SYSTEM_PROMPT = (
    "You are an expert resume parser. Read the resume and return ONLY one JSON object "
    "with exactly these 15 keys, in this order:\n"
    "current_title (string), previous_titles (array, up to 3), current_company (string), "
    "previous_companies (array, up to 3), years_experience (number), "
    "seniority (junior|mid|senior|lead|principal), primary_domain (string), "
    "industries (array, up to 3), core_skills (array, up to 3), "
    "secondary_skills (array, up to 3), tools (array, up to 3, or null), "
    "leadership_experience (boolean), key_achievements (array, up to 3), "
    "location (string or null), summary (string, max 300 characters).\n"
    "Use null when the information is absent. Use only what the resume states. "
    "No explanations, no markdown."
)


def clean_html(text: str) -> str:
    t = re.sub(r"</?(?:br|p|div|tr|li|h[1-6])[^>]*>", "\n", text, flags=re.I)
    t = re.sub(r"<[a-zA-Z/][^>]*>", "", t)
    t = html.unescape(t)
    t = t.replace("\xa0", " ")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n\s*\n+", "\n\n", t)
    return t.strip()


def build_messages(resume_text: str):
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "Resume:\n" + clean_html(resume_text)},
    ]
