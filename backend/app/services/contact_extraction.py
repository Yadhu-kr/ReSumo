"""
Contact Information Extraction Service.

Extracts candidate email, phone number, LinkedIn/GitHub links, and full name
from resume plaintext using multi-pattern matching and heuristic analysis.
"""
import re
from typing import Optional, TypedDict


class ExtractedContactInfo(TypedDict, total=False):
    email: Optional[str]
    phone: Optional[str]
    name: Optional[str]
    linkedin_url: Optional[str]
    github_url: Optional[str]


EMAIL_REGEX = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
    re.IGNORECASE,
)

OBFUSCATED_EMAIL_REGEX = re.compile(
    r"([A-Za-z0-9._%+-]+(?:\s*(?:\[dot\]|\(dot\)|\bdot\b)\s*[A-Za-z0-9._%+-]+)*)"
    r"\s*(?:\[at\]|\(at\)|@)\s*"
    r"([A-Za-z0-9.-]+(?:\s*(?:\[dot\]|\(dot\)|\bdot\b)\s*[A-Za-z0-9.-]+)*)"
    r"\s*(?:\[dot\]|\(dot\)|\.|\bdot\b)\s*"
    r"([A-Za-z]{2,})",
    re.IGNORECASE,
)

PHONE_REGEX = re.compile(
    r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"
)

LINKEDIN_REGEX = re.compile(
    r"(?:https?://)?(?:www\.)?linkedin\.com/in/[A-Za-z0-9_.-]+/?",
    re.IGNORECASE,
)

GITHUB_REGEX = re.compile(
    r"(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9_.-]+/?",
    re.IGNORECASE,
)

NON_NAME_HEADERS = {
    "resume",
    "curriculum vitae",
    "cv",
    "profile",
    "summary",
    "contact",
    "education",
    "experience",
    "skills",
    "work experience",
}


def extract_contact_info(text: str) -> ExtractedContactInfo:
    """
    Extracts email, phone, name, and professional profiles from raw resume text.

    Args:
        text: Plaintext content of the candidate resume.

    Returns:
        Dictionary containing extracted contact fields.
    """
    if not text or not text.strip():
        return {
            "email": None,
            "phone": None,
            "name": None,
            "linkedin_url": None,
            "github_url": None,
        }

    # 1. Extract Email
    email = None
    email_matches = EMAIL_REGEX.findall(text)
    if email_matches:
        # Prefer the first valid email found
        email = email_matches[0].strip().lower()
    else:
        match = OBFUSCATED_EMAIL_REGEX.search(text)
        if match:
            user_part = re.sub(r"\s*(?:\[dot\]|\(dot\)|\bdot\b)\s*", ".", match.group(1)).strip(".")
            domain_part = re.sub(r"\s*(?:\[dot\]|\(dot\)|\bdot\b)\s*", ".", match.group(2)).strip(".")
            tld_part = match.group(3)
            email = f"{user_part}@{domain_part}.{tld_part}".lower()

    # 2. Extract Phone
    phone = None
    phone_matches = PHONE_REGEX.findall(text)
    if phone_matches:
        phone = phone_matches[0].strip()

    # 3. Extract Links
    linkedin_match = LINKEDIN_REGEX.search(text)
    linkedin_url = linkedin_match.group(0).strip() if linkedin_match else None

    github_match = GITHUB_REGEX.search(text)
    github_url = github_match.group(0).strip() if github_match else None

    # 4. Extract Name Candidate Heuristic
    name = _extract_candidate_name(text)

    return {
        "email": email,
        "phone": phone,
        "name": name,
        "linkedin_url": linkedin_url,
        "github_url": github_url,
    }


def _extract_candidate_name(text: str) -> Optional[str]:
    """
    Heuristically extracts the candidate's full name from the top header lines of a resume.
    """
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for line in lines[:5]:
        # Skip lines containing email, URL, or phone
        if "@" in line or "http" in line or "www." in line or PHONE_REGEX.search(line):
            continue

        clean_line = line.strip(" |,-*•#_")
        lower_line = clean_line.lower()

        # Skip headers like "CURRICULUM VITAE" or "RESUME"
        if lower_line in NON_NAME_HEADERS or len(clean_line) > 50:
            continue

        words = clean_line.split()
        # Full name is typically 2 to 4 alphabetic words
        if 2 <= len(words) <= 4:
            if all(re.match(r"^[A-Za-z.'-]+$", w) for w in words):
                return clean_line.title()

    return None
