import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Create your NurAi account — 3-day free trial";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const chips = ["3-day free trial", "No credit card", "Human-in-the-loop"];

export default function SignupOpengraphImage() {
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
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 10% 90%, rgba(196,240,194,0.95), transparent 54%)" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 92% 8%, rgba(184,225,255,0.9), transparent 52%)" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
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
            <div style={{ marginLeft: 15, fontSize: 28, fontWeight: 700 }}>NurAi</div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 20px",
              borderRadius: 999,
              backgroundColor: "#ffffff",
              border: "1px solid rgba(15,20,25,0.12)",
              fontSize: 20,
              color: "rgba(15,20,25,0.72)"
            }}
          >
            Built on Base · x402 USDC
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", position: "relative", maxWidth: 860 }}>
          <div style={{ fontSize: 82, fontWeight: 800, letterSpacing: -2 }}>Build your edge.</div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 26, lineHeight: 1.45, color: "rgba(15,20,25,0.68)" }}>
            Start with a 3-day free trial. Four thoughtful drafts on every reply, and you approve what gets published.
          </div>
        </div>

        <div style={{ display: "flex", position: "relative" }}>
          {chips.map((chip, index) => (
            <div
              key={chip}
              style={{
                display: "flex",
                alignItems: "center",
                marginRight: 14,
                padding: "11px 20px",
                borderRadius: 999,
                backgroundColor: "#ffffff",
                border: "1px solid rgba(15,20,25,0.12)",
                fontSize: 20,
                color: "rgba(15,20,25,0.78)"
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  backgroundColor: index === 2 ? "#0052ff" : "#22c55e",
                  marginRight: 10
                }}
              />
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
