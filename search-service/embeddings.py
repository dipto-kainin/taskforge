"""
Embedding model wrapper for search-service.
Uses sentence-transformers/all-MiniLM-L6-v2 by default (384-dimensional embeddings).
No API keys required — runs entirely locally.
"""

import os
import logging
import numpy as np
from typing import List

logger = logging.getLogger(__name__)

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")


class EmbeddingModel:
    def __init__(self):
        self.model = None

    def load(self):
        """Load the sentence-transformers model."""
        try:
            from sentence_transformers import SentenceTransformer
            logger.info(f"Loading embedding model: {MODEL_NAME}")
            self.model = SentenceTransformer(MODEL_NAME)
            logger.info("Embedding model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise

    def encode(self, text: str) -> List[float]:
        """Encode text into a 384-dimensional embedding vector."""
        if self.model is None:
            raise RuntimeError("Embedding model not loaded")

        embedding = self.model.encode(text, convert_to_numpy=True)
        return embedding.tolist()

    def encode_batch(self, texts: List[str]) -> List[List[float]]:
        """Encode multiple texts into embeddings."""
        if self.model is None:
            raise RuntimeError("Embedding model not loaded")

        embeddings = self.model.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()

    @staticmethod
    def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
        """Compute cosine similarity between two vectors."""
        a = np.array(vec_a)
        b = np.array(vec_b)
        dot = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(dot / (norm_a * norm_b))
