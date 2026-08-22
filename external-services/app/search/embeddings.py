"""
Text search and math utilities.
No local ML models — all embeddings rely 100% on third-party LLM API keys.
"""

from typing import List


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Calculate cosine similarity between two vector lists."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    denom = norm_a * norm_b
    return dot / denom if denom else 0.0
