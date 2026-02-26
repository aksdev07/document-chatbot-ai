export type SourceDocument = {
  pageContent: string;
  metadata: Record<string, unknown>;
};

export type Message = {
  type: 'apiMessage' | 'userMessage';
  message: string;
  isStreaming?: boolean;
  sourceDocs?: SourceDocument[];
};
