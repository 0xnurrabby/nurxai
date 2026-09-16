import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Create your NurAi account — 3-day free trial";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
          backgroundColor: "#0b0d12",
          color: "#f7f7f4",
          padding: "64px 72px",
          position: "relative"
        }}
      >
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 12% 80%, rgba(20,184,166,0.4), transparent 55%)" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 86% 14%, rgba(139,92,246,0.36), transparent 55%)" }} />

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
          <div style={{ marginLeft: 16, fontSize: 28, fontWeight: 700 }}>NurAi</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
          <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>Build your edge.</div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 28, color: "rgba(247,247,244,0.74)", maxWidth: 880 }}>
            Start with a 3-day free trial. No credit card. You approve every reply.
          </div>
        </div>

        <div style={{ display: "flex", position: "relative" }}>
          <div
            style={{
              display: "flex",
              marginRight: 14,
              padding: "11px 20px",
              borderRadius: 999,
              backgroundColor: "rgba(196,240,194,0.16)",
              border: "1px solid rgba(196,240,194,0.42)",
              fontSize: 21
            }}
          >
            Human-in-the-loop
          </div>
          <div
            style={{
              display: "flex",
              padding: "11px 20px",
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.14)",
              fontSize: 21
            }}
          >
            Terms accepted at signup
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
