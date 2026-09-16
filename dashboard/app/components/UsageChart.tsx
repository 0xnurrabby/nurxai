"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import "./UsageChart.css";

type Day = { day: string; count: number };

const PALETTE = [
  "#0052ff",
  "#3b82f6",
  "#0ea5e9",
  "#06b6d4",
  "#14b8a6",
  "#22c55e",
  "#ca8a04",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6"
];

function shortLabel(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day.slice(-2);
  return String(date.getUTCDate());
}

export default function UsageChart({ data, total }: { data: Day[]; total?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const days = data.slice(0, 10).reverse();
  if (!days.length) return null;

  const max = Math.max(1, ...days.map((item) => item.count));
  const sum = total || days.reduce((running, item) => running + item.count, 0);

  return (
    <div className="usage-chart">
      <div className="usage-chart-plot" role="img" aria-label="Comments generated over the last 10 days">
        {days.map((item, index) => {
          const heightPct = Math.max(5, Math.round((item.count / max) * 100));
          const color = PALETTE[index % PALETTE.length];
          const isActive = active === index;
          return (
            <button
              type="button"
              key={item.day}
              className={`usage-bar ${isActive ? "is-active" : ""}`}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              style={
                {
                  "--bar-color": color,
                  "--bar-height": `${heightPct}%`,
                  "--bar-delay": `${index * 70}ms`
                } as CSSProperties
              }
              aria-label={`${item.day}: ${item.count} comments`}
            >
              <span className="usage-bar-fill" />
              <span className="usage-bar-value">{item.count}</span>
              <span className="usage-bar-day">{shortLabel(item.day)}</span>
            </button>
          );
        })}
      </div>
      <div className="usage-chart-foot">
        <span>Last 10 days</span>
        <span>
          Total comments generated: <strong>{sum}</strong>
        </span>
      </div>
    </div>
  );
}
