export enum UserRole {
  CUSTOMER = 'customer',
  SELLER = 'seller',
  ADMIN = 'admin',
}

/** État du compte vendeur (validation par un administrateur). */
export enum SellerStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}

export enum ProductStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  PUBLISHED = 'published',
  OUT_OF_STOCK = 'out_of_stock',
  ARCHIVED = 'archived',
}

export enum OrderStatus {
  PENDING_PAYMENT = 'pending_payment',
  PAYMENT_SUBMITTED = 'payment_submitted',
  PAID = 'paid',
  PROCESSING = 'processing',
  READY = 'ready',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
}

export enum MobileMoneyProvider {
  MVOLA = 'mvola',
  ORANGE_MONEY = 'orange_money',
  AIRTEL_MONEY = 'airtel_money',
}

export enum PaymentStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  REFUNDED = 'refunded',
}

export enum NotificationType {
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_PAID = 'ORDER_PAID',
  ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED',
  PAYMENT_SUBMITTED = 'PAYMENT_SUBMITTED',
  PAYMENT_VERIFIED = 'PAYMENT_VERIFIED',
  PAYMENT_REJECTED = 'PAYMENT_REJECTED',
  SELLER_APPLICATION_RECEIVED = 'SELLER_APPLICATION_RECEIVED',
  SELLER_APPROVED = 'SELLER_APPROVED',
  SELLER_REJECTED = 'SELLER_REJECTED',
  SELLER_SUSPENDED = 'SELLER_SUSPENDED',
  LOW_STOCK = 'LOW_STOCK',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  BOTH = 'both',
}

export enum AuditAction {
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGIN_FAILED = 'USER_LOGIN_FAILED',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_REGISTERED = 'USER_REGISTERED',
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  USER_SUSPENDED = 'USER_SUSPENDED',
  USER_REACTIVATED = 'USER_REACTIVATED',

  PROFILE_UPDATED = 'PROFILE_UPDATED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED = 'PASSWORD_RESET_COMPLETED',

  SELLER_REGISTERED = 'SELLER_REGISTERED',
  SELLER_APPROVED = 'SELLER_APPROVED',
  SELLER_REJECTED = 'SELLER_REJECTED',
  SELLER_SUSPENDED = 'SELLER_SUSPENDED',
  SELLER_UPDATED = 'SELLER_UPDATED',

  PRODUCT_CREATED = 'PRODUCT_CREATED',
  PRODUCT_UPDATED = 'PRODUCT_UPDATED',
  PRODUCT_DELETED = 'PRODUCT_DELETED',
  PRODUCT_PUBLISHED = 'PRODUCT_PUBLISHED',
  PRODUCT_ARCHIVED = 'PRODUCT_ARCHIVED',

  CATEGORY_CREATED = 'CATEGORY_CREATED',
  CATEGORY_UPDATED = 'CATEGORY_UPDATED',
  CATEGORY_DELETED = 'CATEGORY_DELETED',

  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_STATUS_UPDATED = 'ORDER_STATUS_UPDATED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',

  PAYMENT_SUBMITTED = 'PAYMENT_SUBMITTED',
  PAYMENT_VERIFIED = 'PAYMENT_VERIFIED',
  PAYMENT_REJECTED = 'PAYMENT_REJECTED',
  PAYMENT_REFUNDED = 'PAYMENT_REFUNDED',

  FILE_UPLOADED = 'FILE_UPLOADED',
  FILE_DELETED = 'FILE_DELETED',
}

export enum AuditEntity {
  USER = 'user',
  SELLER = 'seller',
  PRODUCT = 'product',
  CATEGORY = 'category',
  ORDER = 'order',
  PAYMENT = 'payment',
  CART = 'cart',
  FILE = 'file',
  AUTH = 'auth',
}

export enum ShippingMethod {
  STANDARD = 'standard',
  EXPRESS = 'express',
  PICKUP = 'pickup',
}

/** Buckets MinIO autorisés. Jamais choisis librement par le client. */
export enum StorageBucket {
  PRODUCTS = 'products',
  AVATARS = 'avatars',
  SELLER_DOCUMENTS = 'seller-documents',
  PAYMENT_PROOFS = 'payment-proofs',
}
