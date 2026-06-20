import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';

/** L2-normalize so cosine similarity stays valid for reduced-dimension vectors. */
function normalize(vector: number[]): number[] {
  let sumSquares = 0;
  for (const x of vector) sumSquares += x * x;
  const magnitude = Math.sqrt(sumSquares);
  return magnitude === 0 ? vector : vector.map((x) => x / magnitude);
}

/**
 * Embeddings stay on Gemini (`gemini-embedding-001`) even though chat moved to
 * NVIDIA Kimi: it runs on a separate quota from Gemini chat, and keeps the
 * existing 768-dim Atlas `vector_index` valid (NVIDIA's embedding models are
 * 1024/2048-dim and would force a re-index).
 *
 * gemini-embedding-001 only returns unit-length vectors at its full 3072-dim
 * width, so at 768 we re-normalize for cosine similarity to stay valid.
 */
class EmbeddingService {
  private readonly ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.ai.models.embedContent({
      model: env.GEMINI_EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: env.EMBEDDING_DIMENSIONS },
    });

    const values = response.embeddings?.[0]?.values;
    if (!values?.length) {
      throw new Error('Embedding API returned no vector.');
    }
    return values.length === 3072 ? values : normalize(values);
  }
}

export const embeddings = new EmbeddingService();
