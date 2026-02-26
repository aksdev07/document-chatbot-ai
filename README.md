# Document Chatbot AI (Ollama + Next.js)

Local RAG chatbot for PDF files using:
- Next.js (UI + API route)
- Ollama (embeddings + chat)
- Local vector index (`data/local-index.json`)

No external vector database is required for the current flow.

## How It Works

1. Put PDF files in `docs/`.
2. Run ingestion (`npm run ingest`) to:
   - parse PDFs
   - chunk text
   - create embeddings with Ollama
   - save vectors to `data/local-index.json`
3. Start app (`npm run dev`).
4. Ask questions in UI.
5. API route retrieves top matching chunks from local index and sends context to Ollama chat model.

## Prerequisites

- Node.js >= 18
- Ollama installed and running

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create/update `.env`:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_CHAT_MODEL=llama3.1:8b
```

3. Pull required Ollama models:

```bash
ollama pull nomic-embed-text
ollama pull llama3.1:8b
```

4. Verify Ollama is reachable:

```bash
curl http://127.0.0.1:11434/api/tags
```

## Add Documents and Ingest

1. Put one or more PDF files in `docs/`.
2. Run:

```bash
npm run ingest
```

Expected success log:
- `processed docs/<file>.pdf: <n> chunk(s)`
- `ingestion complete: <n> chunk(s) saved to data/local-index.json`

## Run the Chat UI

```bash
npm run dev
```

Open `http://localhost:3000`.

## Useful Commands

```bash
npm run dev
npm run ingest
npm run type-check
npm run build
npm run start
```

## Important Files

- `scripts/ingest-data.ts` - PDF parsing, chunking, embedding, index generation
- `utils/local-rag.ts` - local index schema, read/write, cosine similarity search
- `pages/api/chat.ts` - query embed + retrieval + Ollama chat completion
- `pages/index.tsx` - chat interface
- `styles/Home.module.css` - primary UI styles

## Troubleshooting

### 1) Could not connect to Ollama at `127.0.0.1:11434`

- Ensure Ollama is running.
- Verify:

```bash
curl http://127.0.0.1:11434/api/tags
```

- Confirm `OLLAMA_BASE_URL` in `.env`.

### 2) `model '...' not found`

- Check installed models:

```bash
ollama list
```

- Set `.env` model names to exact installed tags.
- Pull missing model:

```bash
ollama pull <model-name>
```

### 3) `Local index not found. Run npm run ingest first.`

- Run ingestion first:

```bash
npm run ingest
```

### 4) Next dev lock issue

```bash
rm -f .next/dev/lock
npm run dev
```

## Deployment Notes

This project can run on a server, but Ollama must also be accessible from that server runtime.

- If Ollama runs on the same machine:
  - `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- If Ollama runs on another machine/container:
  - Set `OLLAMA_BASE_URL` to that reachable internal URL (for example `http://ollama:11434`).
- Ensure required models are pulled on the Ollama host:
  - `nomic-embed-text`
  - your selected chat model (for example `llama3.1:8b`)
- Run ingestion in the deployed environment (or ship `data/local-index.json` with your release).

Production commands:

```bash
npm run build
npm run start
```

Operational recommendations:
- Restrict network access to Ollama endpoint (private network / firewall rules).
- Keep `.env` out of source control.
- Add health checks for both app and Ollama `/api/tags`.

## License

MIT (see `package.json`).
