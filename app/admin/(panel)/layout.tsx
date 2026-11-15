import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false, follow: false } };

const TABS = [
  ["/admin", "Pipeline"],
  ["/admin/review", "Review queue"],
  ["/admin/entries", "Published"],
  ["/admin/candidates", "Candidates"],
  ["/admin/sources", "Sources"],
  ["/admin/settings", "Settings"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="bg-surface-alt pb-20">
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1200px] items-center gap-6 overflow-x-auto px-5 text-[14px] font-semibold">
          {TABS.map(([href, label]) => (
            <Link key={href} href={href} className="py-3.5 whitespace-nowrap text-muted-5 hover:text-ink">
              {label}
            </Link>
          ))}
          <span className="ml-auto hidden text-[12px] font-medium text-muted-3 sm:block">{admin.email}</span>
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] px-5 pt-8">{children}</div>
    </div>
  );
}
