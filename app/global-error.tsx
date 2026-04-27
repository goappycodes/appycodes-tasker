"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-6 text-sm">
            <h1 className="text-base font-semibold text-danger">Something went wrong.</h1>
            <p className="mt-1 text-muted">
              The error has been logged. Try refreshing the page or signing in again.
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-xs text-muted">ref: {error.digest}</p>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
