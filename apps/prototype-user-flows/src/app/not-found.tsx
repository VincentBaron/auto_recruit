import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { PageContainer } from "@/components/shell/page";

export const metadata: Metadata = { title: "Page not found" };

// Any unknown URL (and every notFound() call): shown inside the product chrome.
export default function NotFound() {
  return (
    <PageContainer>
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-xl bg-white px-6 py-14 text-center shadow-xs ring-1 ring-zinc-200">
        <span className="flex size-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <SearchX className="size-5" aria-hidden />
        </span>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-zinc-900">Page not found</h1>
        <p className="mt-1 text-sm leading-6 text-zinc-600">This address does not match any page of Auto Recruit: the link may be incomplete or out of date.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            href="/feed"
            className="inline-flex h-8 items-center rounded-md bg-indigo-600 px-3 text-sm font-medium text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Open the Feed
          </Link>
          <Link href="/" className="inline-flex h-8 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 shadow-xs hover:bg-zinc-50">
            Home
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
