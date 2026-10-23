export interface IActivityLogEvent {
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** Write the audit row through the same manager as the business change. */
export async function writeActivityLog(
  manager: { query: (sql: string, parameters?: unknown[]) => Promise<unknown> },
  event: IActivityLogEvent,
): Promise<void> {
  await manager.query(
    `INSERT INTO "activity_logs"
       ("user_id", "entity_type", "entity_id", "action", "description", "old_values", "new_values", "metadata")
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)`,
    [
      event.actorUserId,
      event.entityType,
      event.entityId,
      event.action,
      event.description,
      event.oldValues ? JSON.stringify(event.oldValues) : null,
      event.newValues ? JSON.stringify(event.newValues) : null,
      event.metadata ? JSON.stringify(event.metadata) : null,
    ],
  );
}
