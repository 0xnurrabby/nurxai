import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "NurAi pricing — free trial, monthly plans, and x402 pay per use";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const plans = [
  { label: "Free trial", value: "3 days" },
  { label: "Monthly plans", value: "from $5" },
  { label: "Pay as you go", value: "$0.009 / reply" }
];

export default function PricingOpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0b0d12",
          color: "#f7f7f4",
          padding: "64px 72px",
          position: "relative"
        }}
      >
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 16% 12%, rgba(16,185,129,0.42), transparent 55%)" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 86% 88%, rgba(0,82,255,0.4), transparent 58%)" }} />

        <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: "#0052ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              fontWeight: 700
            }}
          >
            N
          </div>
          <div style={{ marginLeft: 16, fontSize: 28, fontWeight: 700 }}>NurAi — Pricing</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
          <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2 }}>Simple, honest pricing.</div>
          <div style={{ display: "flex", marginTop: 24, fontSize: 27, color: "rgba(247,247,244,0.74)", maxWidth: 900 }}>
            Start free, stay flexible, and pay only when you need Premium context.
          </div>
          <div style={{ display: "flex", marginTop: 44 }}>
            {plans.map((plan) => (
              <div
                key={plan.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginRight: 18,
                  padding: "22px 28px",
                  borderRadius: 22,
                  backgroundColor: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.15)"
                }}
              >
                <div style={{ fontSize: 20, color: "rgba(247,247,244,0.66)" }}>{plan.label}</div>
                <div style={{ marginTop: 8, fontSize: 34, fontWeight: 700 }}>{plan.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", position: "relative", fontSize: 22, color: "rgba(247,247,244,0.6)" }}>
          USDC settlement on Base mainnet · no auto-renew
        </div>
      </div>
    ),
    { ...size }
  );
}
