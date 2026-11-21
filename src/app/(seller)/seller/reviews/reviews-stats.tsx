import type { OverallStats } from '@/lib/server/services/seller-review-service';

export function ReviewsStats({ stats }: { stats: OverallStats }) {
  if (stats.total_reviews === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        <p className="text-3xl mb-2">★</p>
        <p>لا توجد تقييمات بعد.</p>
        <p className="text-xs mt-2">
          كلما بعت أكثر وحصلت على تقييمات، ستظهر إحصائياتك هنا.
        </p>
      </div>
    );
  }

  const maxBar = Math.max(
    stats.distribution[5],
    stats.distribution[4],
    stats.distribution[3],
    stats.distribution[2],
    stats.distribution[1],
    1
  );

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {/* Average */}
      <div className="border rounded-lg p-5 text-center">
        <p className="text-4xl font-bold text-primary">{stats.avg_rating}</p>
        <div className="text-yellow-500 text-xl mt-1">
          {'★'.repeat(Math.round(stats.avg_rating))}
          {'☆'.repeat(5 - Math.round(stats.avg_rating))}
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          من {stats.total_reviews} تقييم
        </p>
        {stats.unreplied_count > 0 && (
          <p className="text-xs text-orange-600 mt-2">
            {stats.unreplied_count} بدون رد
          </p>
        )}
      </div>

      {/* Distribution */}
      <div className="border rounded-lg p-5 md:col-span-2 space-y-2">
        {[5, 4, 3, 2, 1].map(star => {
          const count = stats.distribution[star as 1 | 2 | 3 | 4 | 5];
          const pct = maxBar > 0 ? (count / maxBar) * 100 : 0;
          return (
            <div key={star} className="flex items-center gap-2 text-sm">
              <span className="w-12 text-xs text-muted-foreground">
                {star} نجمة
              </span>
              <div className="flex-1 bg-muted rounded h-2 overflow-hidden">
                <div
                  className="h-2 bg-yellow-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-10 text-xs text-muted-foreground text-left">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
