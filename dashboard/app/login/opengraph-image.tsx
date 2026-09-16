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
          backgroundColor: "#fafaf7",
          color: "#0f1419",
          padding: "58px 68px",
          position: "relative"
        }}
      >
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 8% 12%, rgba(184,225,255,0.95), transparent 54%)" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 90% 92%, rgba(255,209,220,0.65), transparent 52%)" }} />

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
          <div style={{ marginLeft: 15, fontSize: 28, fontWeight: 700 }}>NurAi</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 48 }}>
            <div style={{ fontSize: 74, fontWeight: 800, letterSpacing: -1.8 }}>Welcome back.</div>
            <div style={{ display: "flex", marginTop: 20, fontSize: 26, lineHeight: 1.45, color: "rgba(15,20,25,0.68)", maxWidth: 640 }}>
              Open your reply workspace, billing, and extension controls.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 380,
              padding: 26,
              borderRadius: 24,
              backgroundColor: "#ffffff",
              border: "1px solid rgba(15,20,25,0.12)",
              boxShadow: "0 30px 60px -40px rgba(15,20,25,0.5)"
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "15px 18px",
                borderRadius: 999,
                backgroundColor: "#0052ff",
                color: "#ffffff",
                fontSize: 20,
                fontWeight: 600
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  backgroundColor: "#ffffff",
                  color: "#0052ff",
                  fontSize: 17,
                  fontWeight: 700,
                  marginRight: 12
                }}
              >
                G
              </div>
              Continue with Google
            </div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 18 }}>
              <div style={{ flex: 1, height: 1, backgroundColor: "rgba(15,20,25,0.12)" }} />
              <div style={{ margin: "0 12px", fontSize: 16, color: "rgba(15,20,25,0.5)" }}>or email</div>
              <div style={{ flex: 1, height: 1, backgroundColor: "rgba(15,20,25,0.12)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
              <div style={{ height: 44, borderRadius: 12, backgroundColor: "#fafaf7", border: "1px solid rgba(15,20,25,0.1)" }} />
              <div style={{ height: 44, borderRadius: 12, backgroundColor: "#fafaf7", border: "1px solid rgba(15,20,25,0.1)", marginTop: 12 }} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "11px 20px",
              borderRadius: 999,
              backgroundColor: "#ffffff",
              border: "1px solid rgba(15,20,25,0.12)",
              fontSize: 20,
              color: "rgba(15,20,25,0.76)"
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: "#22c55e", marginRight: 10 }} />
            Secure access · your workspace and billing
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
