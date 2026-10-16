"""
Offer Letter Generation Service.

Generates structured, professional offer letters in Markdown and HTML formats.
Includes compensation breakdown, equity grants, benefits summary, start date,
and legal acceptance clauses.
"""
import os
from datetime import datetime, timezone
from typing import Optional


def format_currency(amount: float, currency: str = "USD") -> str:
    """Formats salary amount with currency symbol or code."""
    symbols = {
        "USD": "$",
        "EUR": "€",
        "GBP": "£",
        "INR": "₹",
        "CAD": "CA$",
        "AUD": "AU$",
    }
    symbol = symbols.get(currency.upper(), f"{currency.upper()} ")
    return f"{symbol}{amount:,.2f}"


def generate_offer_letter_text(
    company_name: str,
    candidate_name: str,
    candidate_email: str,
    role_title: str,
    salary: float,
    currency: str = "USD",
    start_date: str = "",
    equity: Optional[str] = None,
    benefits_summary: Optional[str] = None,
    notes: Optional[str] = None,
) -> str:
    """
    Renders an official markdown employment offer letter.
    """
    date_str = datetime.now(timezone.utc).strftime("%B %d, %Y")
    formatted_salary = format_currency(salary, currency)

    equity_section = (
        f"### 3. Equity & Incentive Compensation\n"
        f"Subject to the approval of the Board of Directors, you will be granted:\n"
        f"**{equity}** under the company stock incentive plan, subject to standard vesting provisions.\n\n"
        if equity
        else ""
    )

    benefits_text = benefits_summary or (
        "Comprehensive health, dental, and vision insurance; 401(k) retirement plan with employer matching; "
        "flexible paid time off (PTO); and continuous learning & development stipends."
    )

    notes_section = (
        f"### 5. Special Terms & Additional Provisions\n"
        f"{notes}\n\n"
        if notes
        else ""
    )

    markdown_letter = f"""# OFFICIAL OFFER OF EMPLOYMENT

**{company_name}**  
Date: {date_str}  

**Personal & Confidential**  
To: **{candidate_name}** ({candidate_email})  

---

Dear **{candidate_name}**,

On behalf of **{company_name}**, we are thrilled to extend this formal offer of employment for the position of **{role_title}**. Following our evaluation and interview process, our team was deeply impressed with your technical capabilities, leadership philosophy, and alignment with our mission.

### 1. Position & Duties
You will serve in the capacity of **{role_title}**. In this role, you will be expected to perform the duties and responsibilities standard for this position, reporting to the hiring leadership team.

### 2. Compensation
* **Annual Base Salary:** **{formatted_salary}** per annum, payable in regular semi-monthly installments in accordance with standard payroll practices and subject to applicable tax withholdings.
* **Performance Bonus:** Eligible for annual performance reviews and incentive merit adjustments.

{equity_section}### 4. Benefits & Wellness
You will be entitled to participate in all benefit plans and programs generally made available to full-time employees of **{company_name}**, including:
* {benefits_text}

### 5. Start Date & Work Location
* **Anticipated Start Date:** **{start_date or "To be mutually agreed upon"}**
* **Employment Relationship:** This offer represents full-time employment subject to successful completion of standard background checks and verification of work authorization.

{notes_section}---

### Acceptance of Offer

Please confirm your acceptance of this offer by selecting "Accept Offer" in the candidate portal.

Sincerely,  
**The Talent Acquisition Team**  
*{company_name}*
"""
    return markdown_letter.strip()
