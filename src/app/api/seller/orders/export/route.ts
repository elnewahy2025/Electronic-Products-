import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import {
  getDisplayStatus,
  listSellerOrders,
  type SellerOrderStatus,
} from '@/lib/server/services/seller-order-service';

function csvCell(val: unknown): string {
  let s = String(val ?? '');
  // Neutralize CSV formula injection (Excel / Sheets)
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.accountType !== 'seller') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const result = await listSellerOrders({
    productId: sp.get('product') || undefined,
    status: (sp.get('status') as SellerOrderStatus | null) || undefined,
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
    limit: 200,
    offset: 0,
  });

  const headers = [
    'order_item_id',
    'ordered_at',
    'product_title',
    'buyer_masked',
    'code_prefix',
    'gross_price',
    'commission_rate',
    'net_amount',
    'currency',
    'status',
    'attempts_used',
    'attempts_max',
  ];

  const lines = [
    headers.join(','),
    ...result.items.map(row =>
      [
        row.order_item_id,
        row.ordered_at,
        row.product_title,
        row.buyer_masked,
        row.code_prefix ?? '',
        row.price.toFixed(2),
        (row.commission_rate * 100).toFixed(2) + '%',
        row.net_amount.toFixed(2),
        row.currency,
        getDisplayStatus(row).label,
        row.attempts_used,
        row.attempts_max,
      ]
        .map(csvCell)
        .join(','),
    ),
  ];

  // UTF-8 BOM for proper Arabic rendering in Excel
  const csv = '\uFEFF' + lines.join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="seller-orders-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
