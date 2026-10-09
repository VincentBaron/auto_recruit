// Shown under a page's normal header when there is no Workspace yet (New user scenario, signed out).

import Link from "next/link";
import { Sparkles } from "lucide-react";

export function SignedOutState({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-white px-6 py-12 text-center shadow-xs ring-1 ring-zinc-200">
      <span className="flex size-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <h2 className="mt-3 text-sm font-semibold text-zinc-900">No Workspace yet</h2>
      <p className="mt-1 max-w-md text-sm leading-6 text-zinc-600">Sign up with a work account to {what}.</p>
      <Link
        href="/signup"
        className="mt-4 inline-flex h-8 items-center rounded-md bg-indigo-600 px-3 text-sm font-medium text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Start free
      </Link>
    </div>
  );
}
