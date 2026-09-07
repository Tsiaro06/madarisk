import { db } from '../config/database';
import { PaginatedResult } from '../types/territory.types';
import {
  AIConversationListItem,
  AIConversationRow,
  AIMessageRole,
  AIMessageRow,
} from '../types/ai.types';

interface ConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
}

function mapConversation(row: ConversationRow): AIConversationRow {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  token_count: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function mapMessage(row: MessageRow): AIMessageRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as AIMessageRole,
    content: row.content,
    tokenCount: row.token_count,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

const CONVERSATION_COLUMNS = `
  c.id,
  c.user_id,
  c.title,
  c.model,
  c.created_at,
  c.updated_at
`;

interface ConversationListRow extends ConversationRow {
  messageCount: number;
}

export const aiRepository = {
  async createConversation(data: {
    userId: string;
    title: string | null;
    model: string | null;
  }): Promise<AIConversationRow> {
    const result = await db.query<ConversationRow>(
      `INSERT INTO ai_conversations (user_id, title, model)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, title, model, created_at, updated_at`,
      [data.userId, data.title, data.model],
    );
    return mapConversation(result.rows[0]);
  },

  async findConversationById(id: string): Promise<AIConversationRow | null> {
    const result = await db.query<ConversationRow>(
      `SELECT ${CONVERSATION_COLUMNS}
       FROM ai_conversations c
       WHERE c.id = $1`,
      [id],
    );
    return result.rows[0] ? mapConversation(result.rows[0]) : null;
  },

  async touchConversation(id: string): Promise<void> {
    await db.query(`UPDATE ai_conversations SET updated_at = now() WHERE id = $1`, [id]);
  },

  async addMessage(data: {
    conversationId: string;
    role: AIMessageRole;
    content: string;
    tokenCount: number | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<AIMessageRow> {
    const result = await db.query<MessageRow>(
      `INSERT INTO ai_messages (conversation_id, role, content, token_count, metadata)
       VALUES ($1, $2::ai_message_role, $3, $4, $5)
       RETURNING
         id, conversation_id, role, content, token_count, metadata, created_at`,
      [
        data.conversationId,
        data.role,
        data.content,
        data.tokenCount,
        data.metadata !== undefined && data.metadata !== null
          ? JSON.stringify(data.metadata)
          : '{}',
      ],
    );
    return mapMessage(result.rows[0]);
  },

  async listMessages(conversationId: string): Promise<AIMessageRow[]> {
    const result = await db.query<MessageRow>(
      `SELECT
         id, conversation_id, role, content, token_count, metadata, created_at
       FROM ai_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC, id ASC`,
      [conversationId],
    );
    return result.rows.map(mapMessage);
  },

  async listConversations(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<AIConversationListItem>> {
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ai_conversations WHERE user_id = $1`,
      [userId],
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (page - 1) * limit;
    const pageResult = await db.query<ConversationListRow>(
      `SELECT
         ${CONVERSATION_COLUMNS},
         (SELECT COUNT(*)::int FROM ai_messages m WHERE m.conversation_id = c.id) AS "messageCount"
       FROM ai_conversations c
       WHERE c.user_id = $1
       ORDER BY c.updated_at DESC, c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    return {
      items: pageResult.rows.map((row) => ({
        ...mapConversation(row),
        messageCount: row.messageCount,
      })),
      page,
      limit,
      total,
    };
  },

  async deleteConversation(id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM ai_conversations WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
