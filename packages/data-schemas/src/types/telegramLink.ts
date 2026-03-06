import type { Document, Types } from 'mongoose';

export interface ITelegramLink extends Document {
  chatId: string;
  userId: Types.ObjectId;
  conversationId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
