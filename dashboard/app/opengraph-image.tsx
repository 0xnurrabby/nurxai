import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "NurAi — AI reply drafts for X that sound like you";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const chips = ["No auto-posting", "No X password", "Free 3-day trial"];

export default function OpengraphImage() {
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
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 10% 16%, rgba(0,82,255,0.5), transparent 55%)" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 92% 10%, rgba(236,72,153,0.28), transparent 52%)" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 72% 108%, rgba(20,184,166,0.32), transparent 58%)" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                backgroundColor: "#0052ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                fontWeight: 700
              }}
            >
              N
            </div>
            <div style={{ marginLeft: 16, fontSize: 30, fontWeight: 700 }}>NurAi</div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 22px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              backgroundColor: "rgba(255,255,255,0.06)",
              fontSize: 21
            }}
          >
            Built on Base · x402 USDC
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
          <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1.06, letterSpacing: -2 }}>Understand any X post.</div>
          <div style={{ display: "flex", marginTop: 6, fontSize: 78, fontWeight: 800, lineHeight: 1.06, letterSpacing: -2, color: "#7fb0ff" }}>
            Reply like yourself.
          </div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 28, color: "rgba(247,247,244,0.74)", maxWidth: 920 }}>
            AI reply drafts grounded in the post you are answering. You review, edit, and publish.
          </div>
        </div>

        <div style={{ display: "flex", position: "relative" }}>
          {chips.map((chip) => (
            <div
              key={chip}
              style={{
                display: "flex",
                marginRight: 14,
                padding: "11px 20px",
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.14)",
                fontSize: 21
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
