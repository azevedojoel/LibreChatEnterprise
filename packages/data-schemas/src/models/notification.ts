import notificationSchema, { INotification } from '~/schema/notification';

/**
 * Creates or returns the Notification model using the provided mongoose instance and schema
 */
export function createNotificationModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.Notification ||
    mongoose.model<INotification>('Notification', notificationSchema)
  );
}
