import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "NurAi pricing · free trial, monthly plans, and x402 pay per use";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const plans = [
  { label: "Free trial", value: "3 days", color: "#b8e1ff" },
  { label: "Monthly plans", value: "from $5", color: "#c4f0c2" },
  { label: "Pay as you go", value: "$0.009 / reply", color: "#fff89c" }
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
          backgroundColor: "#fafaf7",
          color: "#0f1419",
          padding: "58px 68px",
          position: "relative"
        }}
      >
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 8% 8%, rgba(196,240,194,0.9), transparent 52%)" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 94% 96%, rgba(184,225,255,0.9), transparent 52%)" }} />

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
              fontWeight: 700,
              color: "#ffffff"
            }}
          >
            N
          </div>
          <div style={{ marginLeft: 15, fontSize: 28, fontWeight: 700 }}>NurAi · Pricing</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
          <div style={{ fontSize: 66, fontWeight: 800, letterSpacing: -1.6 }}>Simple, honest pricing.</div>
          <div style={{ display: "flex", marginTop: 18, fontSize: 25, color: "rgba(15,20,25,0.68)", maxWidth: 900 }}>
            Start free, stay flexible, and pay only when you need Premium context.
          </div>
          <div style={{ display: "flex", marginTop: 36 }}>
            {plans.map((plan) => (
              <div
                key={plan.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginRight: 18,
                  width: 300,
                  borderRadius: 22,
                  backgroundColor: "#ffffff",
                  border: "1px solid rgba(15,20,25,0.12)",
                  boxShadow: "0 30px 60px -46px rgba(15,20,25,0.5)",
                  overflow: "hidden"
                }}
              >
                <div style={{ height: 10, backgroundColor: plan.color }} />
                <div style={{ display: "flex", flexDirection: "column", padding: "20px 24px 24px" }}>
                  <div style={{ fontSize: 19, color: "rgba(15,20,25,0.62)" }}>{plan.label}</div>
                  <div style={{ marginTop: 8, fontSize: 31, fontWeight: 700 }}>{plan.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", position: "relative", fontSize: 21, color: "rgba(15,20,25,0.55)" }}>
          USDC settlement on Base mainnet · no auto-renew
        </div>
      </div>
    ),
    { ...size }
  );
}
