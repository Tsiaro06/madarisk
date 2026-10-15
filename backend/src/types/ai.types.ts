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

/**
 * Un tour de mémoire de conversation, exprimé dans les rôles du fournisseur
 * (`user` / `model`). La persistance, elle, utilise `AIMessageRole` :
 * la traduction est le fait de `buildMemory` dans `ai.service.ts`.
 */
export interface AIMemoryTurn {
  role: 'user' | 'model';
  content: string;
}

export interface AIRequest {
  question: string;
  systemPrompt: string;
  context: {
    toolResults: AIToolResult[];
    dataTimestamp: string | null;
    /**
     * Tours précédents de la conversation, du plus ancien au plus récent, à
     * transmettre AVANT la question courante. Sans cet historique, l'assistant
     * ignore tout échange antérieur (« tu ne te souviens pas de ce que je viens
     * de dire ») alors que les messages sont bien persistés.
     */
    history: AIMemoryTurn[];
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
  /**
   * Variante en flux : n'émet que le texte de la réponse, morceau par morceau.
   * Optionnelle — un fournisseur qui ne l'implémente pas fait retomber le
   * service sur `generateAnswer` (réponse complète d'un bloc), ce qui garantit
   * un comportement correct même sans support du streaming.
   */
  generateAnswerStream?(input: AIRequest): AsyncGenerator<string, void, unknown>;
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

/**
 * Métadonnées d'un tour en flux. Elles sont connues AVANT la génération (les
 * outils sont exécutés côté serveur en amont), et sont donc envoyées en tête de
 * flux : le client peut afficher les sources et la date sans attendre le texte.
 */
export interface AIStreamMeta {
  conversationId: string;
  internalSources: string[];
  dataTimestamp: string | null;
  limitations: string[];
}

/**
 * Événements d'une réponse en flux (`POST /ai/chat` avec `stream: true`).
 * Le type d'événement est aussi le nom de l'événement SSE.
 */
export type AIChatStreamEvent =
  | { type: 'meta'; data: AIStreamMeta }
  | { type: 'chunk'; data: { text: string } }
  | { type: 'done'; data: { conversationId: string } };
