import type { Document, Types } from 'mongoose';

export interface IToolOverride extends Document {
  toolId: string;
  /** null = global override; set = agent-specific override */
  agentId?: Types.ObjectId | null;
  /** null = agent/global scope; set = per-user override */
  userId?: Types.ObjectId | null;
  description?: string | null;
  /** Full JSON Schema; replaces base schema when present */
  schema?: Record<string, unknown> | null;
  /** When true/false, overrides default approval gating; null/undefined = use DESTRUCTIVE_TOOLS */
  requiresApproval?: boolean | null;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}
