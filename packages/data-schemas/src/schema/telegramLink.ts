import { Schema } from 'mongoose';
import type { ITelegramLink } from '~/types/telegramLink';

const telegramLinkSchema = new Schema<ITelegramLink>(
  {
    chatId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    conversationId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true, collection: 'telegramlinks' },
);

export default telegramLinkSchema;
