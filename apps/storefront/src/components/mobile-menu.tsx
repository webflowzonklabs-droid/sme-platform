"use client";
import Link from "next/link";

import { useState } from "react";
import type { Subcategory } from "@/lib/queries";

export function MobileMenu({ subcategories }: { subcategories: Subcategory[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden p-2 text-[#F5A623] hover:text-white"
        aria-label="Menu"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          {open ? (
            <path d="M4 4L16 16M16 4L4 16" />
          ) : (
            <path d="M3 5h14M3 10h14M3 15h14" />
          )}
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 bg-[#0e0e0e] border-b border-[#F5A623]/20 md:hidden z-50">
          <nav className="p-4 space-y-1">
            <Link href="/" className="block px-3 py-2.5 text-sm font-bold text-white rounded hover:bg-[#1a1a1a] uppercase">
              Home
            </Link>
            {subcategories.filter(s => s.productCount > 0).map((sc) => (
              <Link
                key={sc.id}
                href={`/category/${sc.slug}`}
                className="flex items-center justify-between px-3 py-2.5 text-sm text-[#888] rounded hover:bg-[#1a1a1a] hover:text-[#F5A623] font-medium uppercase"
              >
                <span>{sc.name}</span>
                <span className="text-xs text-[#444]">{sc.productCount}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
