import { PineconeClient } from '@pinecone-database/pinecone';

let pineconeClient: PineconeClient | null = null;

function normalizePineconeEnvironment(value: string): string {
  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return value;
  }

  try {
    const hostname = new URL(value).hostname;
    const match = hostname.match(/\.svc\.([^.]+)\.pinecone\.io$/);
    if (match?.[1]) {
      return match[1];
    }
  } catch {
    // Fall through to a clearer validation error below.
  }

  throw new Error(
    'Invalid PINECONE_ENVIRONMENT. Use environment id (e.g. "us-east1-gcp") or a valid Pinecone index URL.',
  );
}

function getPineconeHostFromEnv(): string | null {
  const explicitHost = process.env.PINECONE_INDEX_HOST ?? '';
  const fallback = process.env.PINECONE_ENVIRONMENT ?? '';
  const rawHost = explicitHost || fallback;

  if (!rawHost) {
    return null;
  }

  if (rawHost.startsWith('https://') || rawHost.startsWith('http://')) {
    return rawHost.replace(/\/+$/, '');
  }

  if (rawHost.includes('.pinecone.io')) {
    return `https://${rawHost.replace(/\/+$/, '')}`;
  }

  return null;
}

export async function getPineconeClient() {
  if (pineconeClient) {
    return pineconeClient;
  }

  if (!process.env.PINECONE_ENVIRONMENT || !process.env.PINECONE_API_KEY) {
    throw new Error('Pinecone environment or api key vars missing');
  }

  try {
    const environment = normalizePineconeEnvironment(
      process.env.PINECONE_ENVIRONMENT ?? '',
    );
    const pinecone = new PineconeClient();

    await pinecone.init({
      environment,
      apiKey: process.env.PINECONE_API_KEY ?? '',
    });

    pineconeClient = pinecone;
    return pineconeClient;
  } catch (error: any) {
    const details = error?.message ? `: ${error.message}` : '';
    console.log('error', error);
    throw new Error(`Failed to initialize Pinecone Client${details}`);
  }
}

type QueryRequest = {
  vector: number[];
  topK: number;
  includeMetadata?: boolean;
  namespace?: string;
};

type QueryResponse = {
  matches?: any[];
};

export async function queryPinecone(queryRequest: QueryRequest) {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error('PINECONE_API_KEY is missing');
  }

  const host = getPineconeHostFromEnv();
  if (host) {
    const endpoints = ['/query', '/vectors/query'];
    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      const response = await fetch(`${host}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Api-Key': apiKey,
        },
        body: JSON.stringify(queryRequest),
      });

      if (response.ok) {
        return (await response.json()) as QueryResponse;
      }

      const details = await response.text();
      lastError = new Error(
        `Pinecone query failed at ${endpoint} (${response.status}): ${details.slice(0, 500)}`,
      );

      if (response.status !== 404 && response.status !== 405) {
        throw lastError;
      }
    }

    throw lastError ?? new Error('Pinecone query failed');
  }

  if (!process.env.PINECONE_INDEX_NAME) {
    throw new Error(
      'PINECONE_INDEX_NAME is missing. Set PINECONE_INDEX_HOST (or URL-like PINECONE_ENVIRONMENT) to query by host, or set index name for legacy mode.',
    );
  }

  const pinecone = await getPineconeClient();
  const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
  return index.query({ queryRequest }) as Promise<QueryResponse>;
}
