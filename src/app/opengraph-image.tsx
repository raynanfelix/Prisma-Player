import { ImageResponse } from "next/og";

export const alt = "Prisma Player - player de VSL para aumentar conversoes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 82px",
        color: "#ffffff",
        background: "linear-gradient(135deg, #05070d 0%, #0a1b3d 58%, #0066cc 100%)",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 32, fontWeight: 700 }}>
        <div
          style={{
            width: 58,
            height: 58,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 18,
            background: "#168cff",
            fontSize: 30,
          }}
        >
          P
        </div>
        <span>Prisma Player</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 940 }}>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 72, lineHeight: 1.02, fontWeight: 700 }}>
          <span>Sua VSL ja fala.</span>
          <span>A Prisma faz ela vender.</span>
        </div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 27, color: "#c7d8f5" }}>
          Analytics, testes A/B, protecao e inteligencia em um so player.
        </div>
      </div>
    </div>,
    size,
  );
}
