import fs from 'node:fs/promises';
import path from 'node:path';

export type LocalIndexItem = {
  id: string;
  embedding: number[];
  metadata: {
    text: string;
    source: string;
    chunk: number;
  };
};

export type LocalIndex = {
  embeddingModel: string;
  dimension: number;
  createdAt: string;
  items: LocalIndexItem[];
};

export const LOCAL_INDEX_PATH = path.join(process.cwd(), 'data', 'local-index.json');

function dotProduct(a: number[], b: number[]): number {
  let total = 0;
  const size = Math.min(a.length, b.length);
  for (let i = 0; i < size; i += 1) {
    total += a[i] * b[i];
  }
  return total;
}

function magnitude(values: number[]): number {
  let total = 0;
  for (const value of values) {
    total += value * value;
  }
  return Math.sqrt(total);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (!magA || !magB) {
    return 0;
  }
  return dotProduct(a, b) / (magA * magB);
}

export function searchLocalIndex(
  index: LocalIndex,
  queryEmbedding: number[],
  topK = 4,
): LocalIndexItem[] {
  const scored = index.items.map((item) => ({
    item,
    score: cosineSimilarity(queryEmbedding, item.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((entry) => entry.item);
}

export async function readLocalIndex(): Promise<LocalIndex> {
  const content = await fs.readFile(LOCAL_INDEX_PATH, 'utf8');
  return JSON.parse(content) as LocalIndex;
}

export async function writeLocalIndex(index: LocalIndex): Promise<void> {
  const folder = path.dirname(LOCAL_INDEX_PATH);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(LOCAL_INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
}
