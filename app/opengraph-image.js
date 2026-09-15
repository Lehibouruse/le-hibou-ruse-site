import { ImageResponse } from "next/og";

export const alt = "Le Hibou Rusé — Comprendre les règles. Exploiter les failles.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 82px",
        background: "#102d25",
        color: "#f8f0df",
        fontFamily: "Georgia, serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 30, letterSpacing: "0.18em", color: "#d6b36b", fontFamily: "Arial, sans-serif", fontWeight: 700 }}>
          LE HIBOU RUSÉ
        </div>
        <div style={{ display: "flex", gap: 12, fontFamily: "Arial, sans-serif", fontSize: 22 }}>
          <span style={{ padding: "8px 14px", border: "1px solid #5d7a70", borderRadius: 999 }}>D4</span>
          <span style={{ padding: "8px 14px", border: "1px solid #5d7a70", borderRadius: 999 }}>D5</span>
          <span style={{ padding: "8px 14px", border: "1px solid #d6b36b", borderRadius: 999, color: "#e7c678" }}>D6</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", maxWidth: 990 }}>
        <div style={{ display: "flex", fontSize: 74, lineHeight: 1.02, fontWeight: 700, letterSpacing: "-0.035em" }}>
          Comprendre les règles.
        </div>
        <div style={{ display: "flex", fontSize: 74, lineHeight: 1.02, fontWeight: 700, letterSpacing: "-0.035em", color: "#e2b75c" }}>
          Exploiter les failles.
        </div>
        <div style={{ display: "flex", marginTop: 30, fontFamily: "Arial, sans-serif", fontSize: 27, color: "#d9d0bd" }}>
          Fiscalité · Argent · Patrimoine · Cas concrets · Montages D4 → D6
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "Arial, sans-serif", fontSize: 21, color: "#9db0aa" }}>
        <span>Voir ce que les autres ne regardent pas.</span>
        <span style={{ color: "#f0d28f", fontWeight: 700 }}>d4d5d6.com</span>
      </div>
    </div>,
    size,
  );
}
