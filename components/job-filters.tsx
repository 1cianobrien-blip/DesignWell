"use client";

import { usePathname, useRouter } from "next/navigation";

type Opt = { value: string; label: string };

function Select({ name, value, all, options, onChange }: { name: string; value?: string; all: string; options: Opt[]; onChange: (name: string, v: string) => void }) {
  return (
    <label className="relative block">
      <span className="sr-only">{all}</span>
      <select
        name={name}
        value={value ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        className="h-11 w-full appearance-none rounded-field border border-field-border bg-surface pr-10 pl-3.5 text-[14px] font-medium text-ink-body"
      >
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

export function JobFilters({ companies, locations, roles, current }: { companies: Opt[]; locations: string[]; roles: Opt[]; current: { company?: string; location?: string; role?: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const onChange = (name: string, v: string) => {
    const q = new URLSearchParams(Object.entries(current).filter(([, val]) => val) as [string, string][]);
    if (v) q.set(name, v);
    else q.delete(name);
    router.push(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: false });
  };
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Select name="company" value={current.company} all="All companies" options={companies} onChange={onChange} />
      <Select name="location" value={current.location} all="All locations" options={[{ value: "remote", label: "Remote" }, ...locations.map((l) => ({ value: l, label: l }))]} onChange={onChange} />
      <Select name="role" value={current.role} all="All role types" options={roles} onChange={onChange} />
    </div>
  );
}
