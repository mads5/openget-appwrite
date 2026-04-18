"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function DonateSuccessPage() {
  return (
    <div className="container py-20 max-w-lg mx-auto text-center">
      <Card>
        <CardContent className="pt-8 pb-8">
          <div className="text-4xl mb-4 sm:text-5xl">&#10003;</div>
          <h1 className="text-2xl font-bold mb-2">Thank you!</h1>
          <p className="text-muted-foreground mb-6">
            Your sponsor payment has been received. The pool will be updated shortly
            and funds will be distributed to contributors weekly.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="/donate">Sponsor again</Link>
            </Button>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/contributors">View Contributors</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
