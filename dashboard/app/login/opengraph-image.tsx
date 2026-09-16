import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Sign in to NurAi";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function LoginOpengraphImage() {
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
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 14% 20%, rgba(0,82,255,0.45), transparent 55%)" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 88% 80%, rgba(255,248,156,0.22), transparent 52%)" }} />

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
          <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>Welcome back.</div>
          <div style={{ display: "flex", marginTop: 24, fontSize: 28, color: "rgba(247,247,244,0.74)", maxWidth: 880 }}>
            Open your reply workspace, billing, and extension controls.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
          <div
            style={{
              display: "flex",
              padding: "12px 22px",
              borderRadius: 999,
              backgroundColor: "rgba(0,82,255,0.22)",
              border: "1px solid rgba(127,176,255,0.5)",
              fontSize: 21
            }}
          >
            Secure access · Google or email
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
