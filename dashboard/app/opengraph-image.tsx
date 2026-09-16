import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "NurAi — AI reply drafts for X that sound like you";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const chips = ["No auto-posting", "No X password", "Free 3-day trial"];
const draftRows = [148, 210, 176];

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
          backgroundColor: "#fafaf7",
          color: "#0f1419",
          padding: "58px 68px",
          position: "relative"
        }}
      >
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 6% 6%, rgba(184,225,255,0.9), transparent 52%)" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 96% 10%, rgba(255,248,156,0.75), transparent 48%)" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 82% 104%, rgba(196,240,194,0.85), transparent 52%)" }} />

        {/* Brand row */}
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
                fontSize: 25,
                fontWeight: 700,
                color: "#ffffff"
              }}
            >
              N
            </div>
            <div style={{ marginLeft: 15, fontSize: 29, fontWeight: 700 }}>NurAi</div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 20px",
              borderRadius: 999,
              backgroundColor: "#ffffff",
              border: "1px solid rgba(15,20,25,0.12)",
              fontSize: 20,
              color: "rgba(15,20,25,0.72)"
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: "#0052ff", marginRight: 10 }} />
            Built on Base · x402 USDC
          </div>
        </div>

        {/* Headline + product mock */}
        <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 40 }}>
            <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.6 }}>Understand any X post.</div>
            <div style={{ display: "flex", marginTop: 4, fontSize: 62, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.6, color: "#0052ff" }}>
              Reply like yourself.
            </div>
            <div style={{ display: "flex", marginTop: 22, fontSize: 25, lineHeight: 1.45, color: "rgba(15,20,25,0.68)", maxWidth: 620 }}>
              Four thoughtful drafts from the real post context. You review, edit, and publish.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 356,
              padding: 22,
              borderRadius: 24,
              backgroundColor: "#ffffff",
              border: "1px solid rgba(15,20,25,0.12)",
              boxShadow: "0 30px 60px -40px rgba(15,20,25,0.5)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ width: 11, height: 11, borderRadius: 999, backgroundColor: "#0052ff" }} />
              <div style={{ marginLeft: 10, fontSize: 17, fontWeight: 600, color: "rgba(15,20,25,0.62)" }}>NurAi Drafts</div>
            </div>
            {draftRows.map((width, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 16,
                  padding: "12px 14px",
                  borderRadius: 16,
                  backgroundColor: "#fafaf7",
                  border: "1px solid rgba(15,20,25,0.09)"
                }}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ width, height: 10, borderRadius: 6, backgroundColor: "rgba(15,20,25,0.16)" }} />
                  <div style={{ width: Math.round(width * 0.62), height: 10, borderRadius: 6, backgroundColor: "rgba(15,20,25,0.1)", marginTop: 8 }} />
                </div>
                <div
                  style={{
                    display: "flex",
                    padding: "6px 13px",
                    borderRadius: 999,
                    backgroundColor: "#0052ff",
                    color: "#ffffff",
                    fontSize: 15,
                    fontWeight: 600
                  }}
                >
                  Use
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chips */}
        <div style={{ display: "flex", position: "relative" }}>
          {chips.map((chip) => (
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
              <div style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: "#22c55e", marginRight: 10 }} />
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
