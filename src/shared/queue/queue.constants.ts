/** Files BullMQ. */
export const QUEUE_NAMES = {
  EMAIL: 'email',
  NOTIFICATIONS: 'notifications',
  MEDIA: 'media',
  ANALYTICS: 'analytics',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  SEND_MAIL: 'send-mail',
  NOTIFY_ORDER_CREATED: 'notify-order-created',
  NOTIFY_ORDER_PAID: 'notify-order-paid',
  NOTIFY_ORDER_STATUS: 'notify-order-status',
  NOTIFY_PAYMENT_SUBMITTED: 'notify-payment-submitted',
  NOTIFY_PAYMENT_VERIFIED: 'notify-payment-verified',
  NOTIFY_PAYMENT_REJECTED: 'notify-payment-rejected',
  NOTIFY_SELLER_APPLICATION: 'notify-seller-application',
  NOTIFY_SELLER_APPROVED: 'notify-seller-approved',
  NOTIFY_SELLER_REJECTED: 'notify-seller-rejected',
  NOTIFY_LOW_STOCK: 'notify-low-stock',
  PROCESS_IMAGE: 'process-image',
  COMPUTE_ANALYTICS: 'compute-analytics',
} as const;

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface OrderNotificationJobData {
  orderId: string;
}
