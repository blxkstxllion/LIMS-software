export function Watermark({ side = "center", width = "70%", opacity = 0.04, fixed = false }) {
  const justifyContent = fixed && side === "right" ? "center" : side === "right" ? "flex-end" : side === "left" ? "flex-start" : "center";
  const transform = side === "center" ? "rotate(-12deg)" : "rotate(-6deg)";
  const containerStyle = fixed
    ? side === "center"
      ? { position: "fixed", top: "10%", bottom: 0, right: 0, left: "8%" }
      : { position: "fixed", top: "10%", bottom: 0, right: 0, left: side === "right" ? "48%" : 0 }
    : { position: "absolute", inset: 0 };

  return (
    <div style={{ ...containerStyle, pointerEvents: "none", zIndex: 0, display: "flex", alignItems: "center", justifyContent, overflow: "hidden" }}>
      <img src={"/logo.png"} alt="GBC watermark" style={{ width, maxWidth: 900, opacity, filter: "grayscale(1)", transform, pointerEvents: "none" }} />
    </div>
  );
}
