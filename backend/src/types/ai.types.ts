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
  /**
   * Outils déclarés au modèle (function calling natif). Présents : le modèle
   * peut répondre directement (cas courant, un seul appel modèle) ou réclamer
   * des appels d'outils ; absents : aucun appel d'outil n'est possible.
   */
  tools?: AIToolDeclaration[];
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

/**
 * Description d'un outil transmise au modèle : ce sont ces déclarations, et
 * elles seules, qui bornent les appels que le modèle peut proposer.
 *
 * Le type de paramètre reste volontairement réduit (chaîne, entier, nombre) :
 * les identifiants sont des chaînes que le modèle n'a pas à inventer, et la
 * validation réelle est faite par les schémas Zod côté serveur — cette
 * description ne sert qu'à guider le modèle, jamais à autoriser quoi que ce soit.
 */
export interface AIToolDeclaration {
  name: string;
  description: string;
  parameters?: {
    type: 'object';
    properties: Record<string, { type: 'string' | 'integer' | 'number'; description?: string }>;
    required?: string[];
  };
}

/** Appel d'outil proposé par le modèle, à valider puis exécuter côté serveur. */
export interface AIToolCallProposal {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Étape d'une réponse : du texte (émission progressive) ou une demande d'outils
 * du modèle.
 */
export type AIAnswerStep =
  { type: 'text'; text: string } | { type: 'toolCalls'; calls: AIToolCallProposal[] };

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
  /**
   * Variante en flux **qui déclare aussi les outils** (function calling natif) :
   * le modèle répond directement si le contexte pré-extrait suffit (cas courant,
   * un seul appel modèle), sinon il émet un pas `toolCalls` et le service
   * exécute les outils avant de reposer la question — une seule fois, sans
   * outils, pour borner la boucle.
   *
   * Optionnelle : sans elle, ou sans `input.tools`, le service passe par
   * `generateAnswerStream` et la sélection d'outils reste déterministe.
   */
  generateAnswerStreamWithTools?(input: AIRequest): AsyncGenerator<AIAnswerStep, void, unknown>;
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
