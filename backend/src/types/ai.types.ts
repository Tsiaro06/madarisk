import { UserRole } from './auth.types';

export type AIMessageRole = 'UTILISATEUR' | 'ASSISTANT' | 'OUTIL' | 'SYSTEME';

export interface AuthUser {
  id: string;
  role: UserRole;
}

export interface AIToolResult {
  tool: string;
  result: unknown;
}

export interface AIRequest {
  question: string;
  systemPrompt: string;
  context: {
    toolResults: AIToolResult[];
    dataTimestamp: string | null;
  };
}

export interface AIResponse {
  answer: string;
  internalSources: string[];
  dataTimestamp: string | null;
  limitations: string[];
}

export interface AIProvider {
  isAvailable(): boolean;
  generateAnswer(input: AIRequest): Promise<AIResponse>;
}

export interface AITool {
  name: string;
  description: string;
  execute(parameters: unknown, user: AuthUser): Promise<unknown>;
}

export interface AIConversationRow {
  id: string;
  userId: string;
  title: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIConversationListItem extends AIConversationRow {
  messageCount: number;
}

export interface AIMessageRow {
  id: string;
  conversationId: string;
  role: AIMessageRole;
  content: string;
  tokenCount: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AIConversationDetail extends AIConversationRow {
  messages: AIMessageRow[];
}

export interface AIChatResult {
  conversationId: string;
  answer: string;
  internalSources: string[];
  dataTimestamp: string | null;
  limitations: string[];
}
