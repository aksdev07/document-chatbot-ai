import type { NextApiRequest, NextApiResponse } from 'next';
import { readLocalIndex, searchLocalIndex } from '@/utils/local-rag';

type SourceDocument = {
  pageContent: string;
  metadata: Record<string, unknown>;
};

type ChatResponse = {
  text: string;
  sourceDocuments: SourceDocument[];
};

class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'llama3.1:8b';
const embeddingCache = new Map<string, number[]>();

async function embedQuery(input: string): Promise<number[]> {
  const cached = embeddingCache.get(input);
  if (cached) {
    return cached;
  }

  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_EMBED_MODEL,
        input,
      }),
    });
  } catch (error) {
    const details = error instanceof Error ? `: ${error.message}` : '';
    throw new ApiError(
      `Could not connect to Ollama at ${OLLAMA_BASE_URL}. Start Ollama and ensure the URL is correct${details}`,
      503,
    );
  }

  if (!response.ok) {
    const details = await response.text();
    throw new ApiError(
      `Failed to create embedding (${response.status}): ${details.slice(0, 300)}`,
      response.status,
    );
  }

  const data = (await response.json()) as {
    embeddings?: number[][];
    embedding?: number[];
  };

  const embedding = Array.isArray(data.embeddings) && data.embeddings[0]
    ? data.embeddings[0]
    : data.embedding;

  if (!embedding) {
    throw new ApiError('Ollama embedding response did not include an embedding vector', 500);
  }

  embeddingCache.set(input, embedding);
  return embedding;
}

async function chatCompletion(
  question: string,
  context: string,
  history: [string, string][],
): Promise<string> {
  const systemPrompt = `You are a helpful AI assistant. Use the provided context to answer the user question.
If you do not know, say you do not know. Do not invent facts.
If the question is unrelated to the context, say you only answer based on the provided context.`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  history.forEach(([userQuestion, assistantAnswer]) => {
    messages.push({ role: 'user', content: userQuestion });
    messages.push({ role: 'assistant', content: assistantAnswer });
  });

  messages.push({
    role: 'user',
    content: `Context:\n${context}\n\nQuestion: ${question}\n\nHelpful answer in markdown:`,
  });

  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_CHAT_MODEL,
        stream: false,
        messages,
      }),
    });
  } catch (error) {
    const details = error instanceof Error ? `: ${error.message}` : '';
    throw new ApiError(
      `Could not connect to Ollama at ${OLLAMA_BASE_URL}. Start Ollama and ensure the URL is correct${details}`,
      503,
    );
  }

  if (!response.ok) {
    const details = await response.text();
    throw new ApiError(
      `Failed to generate answer (${response.status}): ${details.slice(0, 300)}`,
      response.status,
    );
  }

  const data = (await response.json()) as {
    message?: { content?: string };
  };
  return data.message?.content || '';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatResponse | { error: string } | { message: string }>,
) {
  const { question, history } = req.body;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!question) {
    res.status(400).json({ message: 'No question in the request' });
    return;
  }

  const sanitizedQuestion = String(question).trim().replaceAll('\n', ' ');

  try {
    const index = await readLocalIndex();
    const queryEmbedding = await embedQuery(sanitizedQuestion);
    const matches = searchLocalIndex(index, queryEmbedding, 4);

    const sourceDocuments: SourceDocument[] = matches.map((item) => ({
      pageContent: item.metadata.text,
      metadata: {
        source: item.metadata.source,
        chunk: item.metadata.chunk,
      },
    }));

    const context = sourceDocuments.map((doc) => doc.pageContent).join('\n\n');
    const text = await chatCompletion(
      sanitizedQuestion,
      context,
      (history || []) as [string, string][],
    );

    res.status(200).json({ text, sourceDocuments });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
      res.status(400).json({
        error: 'Local index not found. Run `npm run ingest` first.',
      });
      return;
    }

    if (error instanceof ApiError) {
      res.status(error.status).json({ error: error.message });
      return;
    }

    const message = error instanceof Error ? error.message : 'Something went wrong';
    res.status(500).json({ error: message });
  }
}
