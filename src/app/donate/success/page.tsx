"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function DonateSuccessPage() {
  return (
    <div className="container py-20 max-w-lg mx-auto text-center">
      <Card>
        <CardContent className="pt-8 pb-8">
          <div className="text-5xl mb-4">&#10003;</div>
          <h1 className="text-2xl font-bold mb-2">Thank you!</h1>
          <p className="text-muted-foreground mb-6">
            Your donation has been received. The pool will be updated shortly
            and funds will be distributed to contributors weekly.
          </p>
          <div className="flex gap-3 justify-center">
            <Button asChild variant="outline">
              <Link href="/donate">Donate Again</Link>
            </Button>
            <Button asChild>
              <Link href="/contributors">View Contributors</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
