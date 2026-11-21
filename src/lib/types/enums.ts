export const ACCOUNT_TYPES = ['buyer', 'seller', 'staff'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const USER_STATUS = ['active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUS)[number];

export const SELLER_STATUS = ['pending', 'approved', 'rejected', 'suspended'] as const;
export type SellerStatus = (typeof SELLER_STATUS)[number];

export const PRODUCT_STATUS = [
  'draft','published','paused','suspended','rejected','deleted','archived',
] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];

export const CODE_STATUS = ['issued','delivered','redeemed','expired','revoked'] as const;
export type CodeStatus = (typeof CODE_STATUS)[number];

export const DOWNLOAD_SESSION_STATUS = [
  'active','completed','expired','expired_partial','exhausted',
  'compensation_pending','compensation_active','revoked',
] as const;
export type DownloadSessionStatus = (typeof DOWNLOAD_SESSION_STATUS)[number];

export const COMPENSATION_STATUS = ['pending','approved','rejected','fulfilled','cancelled'] as const;
export type CompensationStatus = (typeof COMPENSATION_STATUS)[number];

export const EXCEPTION_STATUS = ['pending','approved','rejected','fulfilled'] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUS)[number];

export const FILE_SCAN_STATUS = [
  'uploading','uploaded','scanning','quarantined','processing','ready','failed','deleted','backup_only',
] as const;
export type FileScanStatus = (typeof FILE_SCAN_STATUS)[number];

export const CURRENCIES = ['EGP','KWD','SAR','USD'] as const;
export type Currency = (typeof CURRENCIES)[number];