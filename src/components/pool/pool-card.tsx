"use client";

import { Pool } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/seed-data";

interface PoolCardProps {
  pool: Pool;
}

export function PoolCard({ pool }: PoolCardProps) {
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

  const distributable = pool.distributable_amount_cents ?? Math.round(pool.total_amount_cents * 0.99);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{pool.name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Monthly Round: {roundStart} &ndash; {roundEnd} &middot; Payouts distributed weekly
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-primary">
              {formatCents(pool.total_amount_cents)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Total Pool</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{pool.donor_count}</div>
            <div className="text-xs text-muted-foreground mt-1">Donors</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{daysLeft}</div>
            <div className="text-xs text-muted-foreground mt-1">Days Left</div>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
          <span>Distributed to contributors (99%)</span>
          <span className="font-medium text-foreground">{formatCents(distributable)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
