"use client";

import { Pool } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/seed-data";
import { POOL_TYPE_LABELS, type PoolTypeId } from "@/lib/pool-types";

interface PoolCardProps {
  pool: Pool;
  hideFinancialTotals?: boolean;
}

export function PoolCard({ pool, hideFinancialTotals = false }: PoolCardProps) {
  const daysLeft = Math.max(
    0,
    Math.ceil(
      (new Date(pool.round_end).getTime() - Date.now()) / 86400000
    )
  );

  const roundStart = new Date(pool.round_start).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const roundEnd = new Date(pool.round_end).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const distributable =
    pool.distributable_amount_cents ?? Math.max(0, pool.total_amount_cents - pool.platform_fee_cents);

  const typeId = pool.pool_type as PoolTypeId | undefined;
  const typeLabel =
    typeId && POOL_TYPE_LABELS[typeId] ? POOL_TYPE_LABELS[typeId] : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">{pool.name}</CardTitle>
          {typeLabel && (
            <Badge variant="secondary" className="text-xs font-normal">
              {typeLabel}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Monthly Round: {roundStart} &ndash; {roundEnd} &middot; Payouts distributed weekly
        </p>
      </CardHeader>
      <CardContent>
        {hideFinancialTotals ? (
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-xl font-bold sm:text-2xl">{pool.donor_count}</div>
              <div className="text-xs text-muted-foreground mt-1">Sponsors</div>
            </div>
            <div>
              <div className="text-xl font-bold sm:text-2xl">{daysLeft}</div>
              <div className="text-xs text-muted-foreground mt-1">Days Left</div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
              <div>
                <div className="text-xl font-bold text-primary sm:text-2xl">
                  {formatCents(pool.total_amount_cents)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Total Pool</div>
              </div>
              <div>
                <div className="text-xl font-bold sm:text-2xl">{pool.donor_count}</div>
                <div className="text-xs text-muted-foreground mt-1">Sponsors</div>
              </div>
              <div>
                <div className="text-xl font-bold sm:text-2xl">{daysLeft}</div>
                <div className="text-xs text-muted-foreground mt-1">Days Left</div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
              <span className="min-w-0">Estimated distributable</span>
              <span className="shrink-0 font-medium text-foreground">{formatCents(distributable)}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
