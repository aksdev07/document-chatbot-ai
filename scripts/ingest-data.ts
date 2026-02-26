import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeLocalIndex, type LocalIndexItem } from '@/utils/local-rag';

const DOCS_DIR = 'docs';
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

function splitText(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }

  const overlap = Math.min(Math.max(chunkOverlap, 0), chunkSize - 1);
  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    chunks.push(normalized.slice(start, end));
    if (end === normalized.length) {
      break;
    }
    start = end - overlap;
  }

  return chunks;
}

function vectorId(source: string, chunkIndex: number): string {
  return createHash('sha1')
    .update(`${source}:${chunkIndex}`)
    .digest('hex');
}

async function findPdfFiles(directoryPath: string): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return findPdfFiles(fullPath);
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        return [fullPath];
      }
      return [];
    }),
  );

  return files.flat();
}

async function loadPdfParser(): Promise<(input: Buffer) => Promise<{ text: string }>> {
  try {
    const { default: pdf } = await import('pdf-parse/lib/pdf-parse.js');
    return pdf as (input: Buffer) => Promise<{ text: string }>;
  } catch (error) {
    throw new Error(
      `Failed to load pdf-parse${error instanceof Error ? `: ${error.message}` : ''}`,
    );
  }
}

async function embedText(text: string): Promise<number[]> {
  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_EMBED_MODEL,
        input: text,
      }),
    });
  } catch (error) {
    const details = error instanceof Error ? `: ${error.message}` : '';
    throw new Error(
      `Could not connect to Ollama at ${OLLAMA_BASE_URL}. Start Ollama and ensure the URL is correct${details}`,
    );
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Ollama embedding failed (${response.status}): ${details.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    embeddings?: number[][];
    embedding?: number[];
  };

  if (Array.isArray(data.embeddings) && data.embeddings[0]) {
    return data.embeddings[0];
  }
  if (Array.isArray(data.embedding)) {
    return data.embedding;
  }

  throw new Error('Ollama embedding response did not include an embedding vector');
}

export const run = async () => {
  await fs.mkdir(DOCS_DIR, { recursive: true });
  const pdfFiles = await findPdfFiles(DOCS_DIR);

  if (pdfFiles.length === 0) {
    throw new Error(
      `No PDF files found in "${DOCS_DIR}". Add one or more PDF files and run "npm run ingest" again.`,
    );
  }

  const parsePdf = await loadPdfParser();
  const items: LocalIndexItem[] = [];

  for (const file of pdfFiles) {
    const raw = await fs.readFile(file);
    const parsed = await parsePdf(raw);
    const source = path.relative(process.cwd(), file) || file;
    const chunks = splitText(parsed.text ?? '', CHUNK_SIZE, CHUNK_OVERLAP);

    for (const [chunkIndex, text] of chunks.entries()) {
      const embedding = await embedText(text);
      items.push({
        id: vectorId(source, chunkIndex),
        embedding,
        metadata: {
          text,
          source,
          chunk: chunkIndex,
        },
      });
    }

    console.log(`processed ${source}: ${chunks.length} chunk(s)`);
  }

  if (!items.length) {
    throw new Error('No text chunks were extracted from the provided PDF files');
  }

  await writeLocalIndex({
    embeddingModel: OLLAMA_EMBED_MODEL,
    dimension: items[0].embedding.length,
    createdAt: new Date().toISOString(),
    items,
  });

  console.log(
    `ingestion complete: ${items.length} chunk(s) saved to data/local-index.json`,
  );
};

(async () => {
  await run();
})();
