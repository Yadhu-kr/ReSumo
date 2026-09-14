"""
Embedding and Vector Storage Service for Phase 2 RAG Matching.

Responsibilities:
1. Persistent Chroma storage for candidates and jobs using cosine distance.
2. Embedding text construction strictly from the 10 locked fields in Candidate.parsed_data.
3. SentenceTransformer embedding generation (default: BAAI/bge-large-en-v1.5).
4. Candidate and Job vector upsert, deletion, and nearest-neighbor querying.
"""
import os
from typing import Any

# Globals for lazy loading
_chroma_client = None
_embedding_model = None


def get_chroma_client(persist_dir: str | None = None):
    """Returns a persistent ChromaDB client."""
    global _chroma_client
    if persist_dir:
        import chromadb
        return chromadb.PersistentClient(path=persist_dir)
    if _chroma_client is None:
        import chromadb
        dir_path = os.getenv("CHROMA_DATA_DIR", "data/chroma")
        os.makedirs(dir_path, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=dir_path)
    return _chroma_client


def get_candidates_collection(client=None):
    """Returns the Chroma collection for candidate embeddings with cosine distance."""
    if client is None:
        client = get_chroma_client()
    return client.get_or_create_collection(
        name="candidates",
        metadata={"hnsw:space": "cosine"},
    )


def get_jobs_collection(client=None):
    """Returns the Chroma collection for job embeddings with cosine distance."""
    if client is None:
        client = get_chroma_client()
    return client.get_or_create_collection(
        name="jobs",
        metadata={"hnsw:space": "cosine"},
    )


def get_embedding_model():
    """Lazy-loads the SentenceTransformer model."""
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer
        model_name = os.getenv("EMBEDDING_MODEL_NAME", "BAAI/bge-large-en-v1.5")
        _embedding_model = SentenceTransformer(model_name)
    return _embedding_model


def compute_embedding(text: str) -> list[float]:
    """Generates normalized dense vector embeddings for a given text string."""
    model = get_embedding_model()
    # If the model has encode, use it (standard SentenceTransformer API)
    vector = model.encode(text, normalize_embeddings=True)
    if hasattr(vector, "tolist"):
        return vector.tolist()
    return list(vector)


def build_candidate_embedding_text(parsed_data: dict[str, Any] | None) -> str | None:
    """
    Constructs candidate embedding text by concatenating the 10 locked fields:
    - current_title
    - previous_titles
    - primary_domain
    - industries
    - core_skills
    - secondary_skills
    - tools
    - years_experience
    - seniority
    - summary

    Skips embedding (returns None) if parsed_data is None or empty.
    """
    if not parsed_data or not isinstance(parsed_data, dict):
        return None

    parts: list[str] = []

    if parsed_data.get("current_title"):
        parts.append(f"Current Title: {parsed_data['current_title']}")

    prev_titles = parsed_data.get("previous_titles")
    if prev_titles and isinstance(prev_titles, list):
        parts.append(f"Previous Titles: {', '.join(str(t) for t in prev_titles)}")

    if parsed_data.get("primary_domain"):
        parts.append(f"Primary Domain: {parsed_data['primary_domain']}")

    industries = parsed_data.get("industries")
    if industries and isinstance(industries, list):
        parts.append(f"Industries: {', '.join(str(i) for i in industries)}")

    core_skills = parsed_data.get("core_skills")
    if core_skills and isinstance(core_skills, list):
        parts.append(f"Core Skills: {', '.join(str(s) for s in core_skills)}")

    sec_skills = parsed_data.get("secondary_skills")
    if sec_skills and isinstance(sec_skills, list):
        parts.append(f"Secondary Skills: {', '.join(str(s) for s in sec_skills)}")

    tools = parsed_data.get("tools")
    if tools and isinstance(tools, list):
        parts.append(f"Tools: {', '.join(str(t) for t in tools)}")

    years_exp = parsed_data.get("years_experience")
    if years_exp is not None:
        parts.append(f"Years of Experience: {years_exp}")

    if parsed_data.get("seniority"):
        parts.append(f"Seniority: {parsed_data['seniority']}")

    if parsed_data.get("summary"):
        parts.append(f"Summary: {parsed_data['summary']}")

    if not parts:
        return None

    return "\n".join(parts)


def build_job_embedding_text(title: str, description: str, role_tier: str) -> str:
    """Constructs job embedding text from title, role_tier, and description."""
    return f"Job Title: {title}\nRole Tier: {role_tier}\nDescription: {description}"


def upsert_candidate_vector(candidate_id: str, parsed_data: dict[str, Any] | None, client=None) -> bool:
    """
    Builds embedding text and upserts candidate vector into Chroma.
    Returns True if embedded and upserted, False if skipped (parsed_data is null/empty).
    """
    text = build_candidate_embedding_text(parsed_data)
    if not text:
        return False

    vector = compute_embedding(text)
    collection = get_candidates_collection(client)
    collection.upsert(
        ids=[candidate_id],
        embeddings=[vector],
        documents=[text],
        metadatas=[{"candidate_id": candidate_id, "seniority": str(parsed_data.get("seniority", ""))}],
    )
    return True


def delete_candidate_vector(candidate_id: str, client=None):
    """Deletes a candidate vector from Chroma."""
    try:
        collection = get_candidates_collection(client)
        collection.delete(ids=[candidate_id])
    except Exception:
        pass


def upsert_job_vector(job_id: str, title: str, description: str, role_tier: str, client=None) -> bool:
    """Builds embedding text and upserts job vector into Chroma."""
    text = build_job_embedding_text(title, description, role_tier)
    vector = compute_embedding(text)
    collection = get_jobs_collection(client)
    collection.upsert(
        ids=[job_id],
        embeddings=[vector],
        documents=[text],
        metadatas=[{"job_id": job_id, "title": title, "role_tier": role_tier}],
    )
    return True


def delete_job_vector(job_id: str, client=None):
    """Deletes a job vector from Chroma."""
    try:
        collection = get_jobs_collection(client)
        collection.delete(ids=[job_id])
    except Exception:
        pass


def query_top_candidates(
    job_text: str,
    top_k: int = 5,
    client=None,
) -> list[dict[str, Any]]:
    """
    Queries Chroma for top-k candidates by cosine similarity against the job text.
    Returns list of dicts: {'candidate_id': str, 'similarity_score': float, 'distance': float}
    """
    collection = get_candidates_collection(client)
    total_count = collection.count()
    if total_count == 0:
        return []

    limit = min(top_k, total_count)
    vector = compute_embedding(job_text)

    results = collection.query(
        query_embeddings=[vector],
        n_results=limit,
        include=["documents", "distances", "metadatas"],
    )

    matches: list[dict[str, Any]] = []
    if results and results.get("ids") and results["ids"][0]:
        ids = results["ids"][0]
        distances = results["distances"][0] if results.get("distances") else [0.0] * len(ids)
        for cid, dist in zip(ids, distances):
            # Chroma cosine distance d in [0, 2]; similarity = 1 - d
            similarity = max(0.0, min(1.0, 1.0 - dist))
            matches.append({
                "candidate_id": cid,
                "distance": dist,
                "similarity_score": round(similarity, 4),
            })

    # Ensure sorted by similarity descending
    matches.sort(key=lambda m: m["similarity_score"], reverse=True)
    return matches
