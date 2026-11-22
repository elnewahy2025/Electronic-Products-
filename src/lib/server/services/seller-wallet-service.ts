import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type WalletInfo = {
  id: string;
  currency: string;
  balance: number;
};

export type PayoutRow = {
  id: string;
  amount: number;
  currency: string;
  status: 'requested' | 'approved' | 'rejected' | 'paid';
  method: string | null;
  requested_at: string;
  decided_at: string | null;
  paid_at: string | null;
  reference: string | null;
};

export type WalletTransactionRow = {
  id: string;
  wallet_id: string;
  type: 'earning' | 'commission' | 'payout' | 'adjustment';
  amount: number;
  currency: string;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
};

export async function getMyWallets(): Promise<WalletInfo[]> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];

  const { data } = await db
    .from('seller_wallets')
    .select('id, currency, balance')
    .eq('seller_id', user.id)
    .order('currency');

  return (data ?? []).map((w: any) => ({
    id: w.id,
    currency: w.currency,
    balance: Number(w.balance),
  }));
}

export async function listMyPayouts(): Promise<PayoutRow[]> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];

  const { data } = await db
    .from('seller_payouts')
    .select('id, amount, currency, status, method, requested_at, decided_at, paid_at, reference')
    .eq('seller_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(50);

  return (data ?? []).map((p: any) => ({
    ...p,
    amount: Number(p.amount),
  }));
}

export async function listMyTransactions(limit = 50): Promise<WalletTransactionRow[]> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];

  const { data } = await db
    .from('financial_transactions')
    .select('id, wallet_id, type, amount, currency, reference_type, reference_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((t: any) => ({
    ...t,
    amount: Number(t.amount),
  }));
}

export async function requestPayout(input: {
  amount: number;
  currency: string;
  method: string;
}): Promise<{ id: string }> {
  const db = await createClient();
  const { data, error } = await db.rpc('request_payout', {
    p_amount: input.amount,
    p_currency: input.currency,
    p_method: input.method,
  });
  if (error) {
    if (error.message.includes('below_minimum_payout')) throw new Error('below_minimum_payout');
    if (error.message.includes('insufficient_balance')) throw new Error('insufficient_balance');
    if (error.message.includes('seller_not_approved')) throw new Error('seller_not_approved');
    throw new Error(error.message);
  }
  return { id: data };
}
