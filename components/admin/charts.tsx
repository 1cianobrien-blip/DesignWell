"use client";

// Small SVG bar charts for the owner dashboard. Thin bars, 2px gaps between stacked segments,
// recessive axis, legend + per-bar hover tooltip, and a table view for exact numbers.
import { useState } from "react";

export type Series = { key: string; label: string; color: string };

type Props = {
  data: Record<string, number | string>[];
  xKey: string;
  series: Series[];
  height?: number;
  unit?: "count" | "usd";
  title: string;
};

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

export function StackedBars({ data, xKey, series, height = 180, unit = "count", title }: Props) {
  const format = (n: number) => (unit === "usd" ? (n >= 1 ? `$${n.toFixed(1)}` : `$${n.toFixed(2)}`) : String(Math.round(n)));
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const totals = data.map((d) => series.reduce((s, se) => s + Number(d[se.key] ?? 0), 0));
  const max = niceMax(Math.max(...totals, 0));
  const W = 720;
  const padL = 36;
  const padB = 22;
  const innerH = height - padB - 8;
  const slot = (W - padL) / Math.max(1, data.length);
  const barW = Math.max(4, Math.min(18, slot - 4));
  const y = (v: number) => (v / max) * innerH;
  const ticks = unit === "count" && max < 2 ? [0, max] : [0, max / 2, max];
  const labelEvery = Math.ceil(data.length / 8);
  const last = data.length - 1;
  // Every Nth day plus the last one, skipping a regular label that would crowd the last.
  const showLabel = (i: number) => i === last || (i % labelEvery === 0 && last - i >= labelEvery);

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[14px] font-bold text-ink-body">{title}</h3>
        <div className="flex flex-wrap items-center gap-3 text-[12px] font-medium text-muted-5">
          {series.length > 1
            ? series.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))
            : null}
          <button type="button" onClick={() => setTable((t) => !t)} className="text-brand">
            {table ? "Chart" : "Table"}
          </button>
        </div>
      </div>
      {table ? (
        <div className="max-h-[260px] overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-surface text-left text-muted-5">
              <tr>
                <th className="py-1 pr-3 font-semibold">Day</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1 pr-3 text-right font-semibold">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={String(d[xKey])} className="border-t border-line">
                  <td className="py-1 pr-3">{String(d[xKey])}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1 pr-3 text-right tabular-nums">
                      {format(Number(d[s.key] ?? 0))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${height}`} className="block w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W} y1={8 + innerH - y(t)} y2={8 + innerH - y(t)} stroke="#ededed" strokeWidth={1} />
                <text x={padL - 6} y={8 + innerH - y(t) + 4} textAnchor="end" fontSize="10" fill="#8c8c8c">
                  {format(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = padL + slot * i + slot / 2;
              let acc = 0;
              const segs = series
                .map((s) => ({ s, v: Number(d[s.key] ?? 0) }))
                .filter((x) => x.v > 0)
                .map((x, idx, arr) => {
                  const h = y(x.v);
                  const top = 8 + innerH - y(acc) - h;
                  acc += x.v;
                  const isTop = idx === arr.length - 1;
                  const gap = idx > 0 ? 2 : 0; // 2px surface gap between stacked segments
                  return (
                    <rect
                      key={x.s.key}
                      x={cx - barW / 2}
                      y={top}
                      width={barW}
                      height={Math.max(0, h - gap)}
                      rx={isTop ? Math.min(4, barW / 2) : 0}
                      fill={x.s.color}
                    />
                  );
                });
              return (
                <g key={String(d[xKey])} onMouseEnter={() => setHover(i)}>
                  <rect x={cx - slot / 2} y={0} width={slot} height={height} fill={hover === i ? "#f5f5f5" : "transparent"} />
                  {segs}
                  {showLabel(i) ? (
                    <text x={cx} y={height - 6} textAnchor="middle" fontSize="10" fill="#8c8c8c">
                      {String(d[xKey]).slice(5)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          {hover !== null ? (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-btn border border-line bg-surface px-3 py-2 text-[12px] shadow-sm"
              style={{ left: `${Math.min(80, ((padL + slot * hover + slot / 2) / W) * 100)}%` }}
            >
              <p className="mb-1 font-bold text-ink-body">{String(data[hover][xKey])}</p>
              {series.map((s) => (
                <p key={s.key} className="flex items-center gap-1.5 whitespace-nowrap text-muted-5">
                  <span className="size-2 rounded-[2px]" style={{ background: s.color }} />
                  {s.label}: <span className="font-semibold text-ink-body tabular-nums">{format(Number(data[hover][s.key] ?? 0))}</span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
