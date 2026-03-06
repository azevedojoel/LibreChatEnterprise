import telegramLinkSchema from '~/schema/telegramLink';
import type { ITelegramLink } from '~/types/telegramLink';

export function createTelegramLinkModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.TelegramLink ||
    mongoose.model<ITelegramLink>('TelegramLink', telegramLinkSchema)
  );
}
