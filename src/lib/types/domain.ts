import type {
  AccountType, CodeStatus, CompensationStatus,
  Currency, DownloadSessionStatus, ExceptionStatus,
  ProductStatus, SellerStatus,
} from './enums';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  account_type: AccountType;
  status: 'active' | 'suspended' | 'deleted';
  mfa_enabled: boolean;
  mfa_enforced: boolean;
};

export type SellerProfile = {
  profile_id: string;
  display_name: string;
  bio: string | null;
  status: SellerStatus;
  agreement_accepted_at: string | null;
};

export type Product = {
  id: string;
  seller_id: string;
  title: string;
  slug: string;
  price_amount: number;
  price_currency: Currency;
  status: ProductStatus;
  published_at: string | null;
};

export type PurchaseCode = {
  id: string;
  order_item_id: string;
  code_prefix: string;
  status: CodeStatus;
  expires_at: string;
  delivered_at: string | null;
  redeemed_at: string | null;
};

export type DownloadSession = {
  id: string;
  code_id: string;
  order_item_id: string;
  status: DownloadSessionStatus;
  started_at: string;
  expires_at: string;
  is_compensation: boolean;
  parent_session_id: string | null;
};

export type CompensationRequest = {
  id: string;
  code_id: string;
  status: CompensationStatus;
  reason: string;
  admin_reason: string | null;
  sequence_number: number;
  requested_at: string;
  decided_at: string | null;
};

export type AttemptExceptionRequest = {
  id: string;
  code_id: string;
  status: ExceptionStatus;
  reason: string;
  granted_attempts: number | null;
  created_at: string;
};