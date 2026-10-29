import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from "remotion";

// Brand palette: deep navy + electric cyan + white
const COLORS = {
  bg: "#0a0e1a",
  accent: "#00e5ff",
  accentGlow: "#00e5ff80",
  white: "#ffffff",
  muted: "#94a3b8",
};

const AnimatedBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      {/* Radial gradient pulse */}
      <div
        style={{
          position: "absolute",
          width: "120%",
          height: "120%",
          left: "-10%",
          top: "-10%",
          background: `radial-gradient(circle at 50% 50%, ${COLORS.accentGlow} 0%, transparent 60%)`,
          opacity: opacity * 0.4,
          transform: `scale(${interpolate(frame, [0, 150, 300], [0.8, 1.2, 1], { extrapolateRight: "clamp" })})`,
        }}
      />
      {/* Grid lines */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(${COLORS.accent}10 1px, transparent 1px), linear-gradient(90deg, ${COLORS.accent}10 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          opacity: opacity * 0.3,
          transform: `perspective(800px) rotateX(${interpolate(frame, [0, 60], [30, 0], { extrapolateRight: "clamp" })}deg) translateY(${interpolate(frame, [0, 300], [-100, 0], { extrapolateRight: "clamp" })}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

const LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, from: 0, to: 1, config: { damping: 12, stiffness: 200 } });
  const glowOpacity = interpolate(frame, [10, 30, 50], [0, 1, 0.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const letterSpacing = interpolate(frame, [0, 40], [40, 8], { extrapolateRight: "clamp" });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
      }}
    >
      {/* Prism icon */}
      <div
        style={{
          width: 120,
          height: 120,
          marginBottom: 40,
          transform: `scale(${scale}) rotate(${interpolate(frame, [0, 60], [-180, 0], { extrapolateRight: "clamp" })}deg)`,
        }}
      >
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="prismGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={COLORS.accent} />
              <stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
          <path d="M50 10 L90 80 L10 80 Z" fill="url(#prismGrad)" stroke={COLORS.white} strokeWidth="2" />
          <path d="M50 10 L50 80" stroke={COLORS.white} strokeWidth="1" opacity="0.5" />
          <path d="M10 80 L90 80" stroke={COLORS.white} strokeWidth="1" opacity="0.5" />
        </svg>
        {/* Glow effect */}
        <div
          style={{
            position: "absolute",
            inset: -20,
            background: `radial-gradient(circle, ${COLORS.accent}60 0%, transparent 70%)`,
            opacity: glowOpacity,
            filter: "blur(20px)",
          }}
        />
      </div>

      {/* PRISMA text */}
      <div
        style={{
          fontSize: 100,
          fontWeight: 900,
          color: COLORS.white,
          letterSpacing: `${letterSpacing}px`,
          fontFamily: "Inter, system-ui, sans-serif",
          textTransform: "uppercase",
          textShadow: `0 0 40px ${COLORS.accent}80`,
          opacity: interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        PRISMA
      </div>

      {/* PLAYER subtitle */}
      <div
        style={{
          fontSize: 36,
          fontWeight: 300,
          color: COLORS.accent,
          letterSpacing: "20px",
          marginTop: 10,
          fontFamily: "Inter, system-ui, sans-serif",
          textTransform: "uppercase",
          opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(frame, [20, 40], [20, 0], { extrapolateRight: "clamp" })}px)`,
        }}
      >
        PLAYER
      </div>
    </div>
  );
};

const TaglineReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = ["O", "MELHOR", "PLAYER", "DE", "VSL"];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        gap: 20,
      }}
    >
      {/* Main tagline */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
        {words.map((word, i) => {
          const delay = i * 8;
          const wordSpring = spring({ frame: frame - delay, fps, from: 0, to: 1, config: { damping: 15, stiffness: 180 } });
          const y = interpolate(wordSpring, [0, 1], [60, 0]);
          const opacity = interpolate(wordSpring, [0, 1], [0, 1]);
          const scale = interpolate(wordSpring, [0, 0.8, 1], [0.8, 1.1, 1]);

          return (
            <div
              key={word}
              style={{
                fontSize: word === "VSL" ? 140 : 80,
                fontWeight: word === "VSL" ? 900 : 700,
                color: word === "VSL" ? COLORS.accent : COLORS.white,
                fontFamily: "Inter, system-ui, sans-serif",
                textTransform: "uppercase",
                transform: `translateY(${y}px) scale(${scale})`,
                opacity,
                textShadow: word === "VSL" ? `0 0 60px ${COLORS.accent}` : "none",
              }}
            >
              {word}
            </div>
          );
        })}
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: 28,
          color: COLORS.muted,
          fontFamily: "Inter, system-ui, sans-serif",
          letterSpacing: "4px",
          marginTop: 40,
          opacity: interpolate(frame, [60, 80], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(frame, [60, 80], [20, 0], { extrapolateRight: "clamp" })}px)`,
        }}
      >
        CHEGOU PARA REVOLUCIONAR
      </div>

      {/* Decorative line */}
      <div
        style={{
          width: interpolate(frame, [50, 90], [0, 400], { extrapolateRight: "clamp" }),
          height: 3,
          background: `linear-gradient(90deg, transparent, ${COLORS.accent}, transparent)`,
          marginTop: 30,
          borderRadius: 2,
        }}
      />
    </div>
  );
};

const CTAFinale: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pulseScale = interpolate(frame % 30, [0, 15, 30], [1, 1.05, 1]);
  const enterSpring = spring({ frame, fps, from: 0, to: 1, config: { damping: 12 } });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        gap: 40,
      }}
    >
      {/* CTA Button */}
      <div
        style={{
          padding: "24px 80px",
          background: `linear-gradient(135deg, ${COLORS.accent}, #7c3aed)`,
          borderRadius: 60,
          fontSize: 36,
          fontWeight: 800,
          color: COLORS.bg,
          fontFamily: "Inter, system-ui, sans-serif",
          textTransform: "uppercase",
          letterSpacing: "4px",
          transform: `scale(${enterSpring * pulseScale})`,
          boxShadow: `0 0 60px ${COLORS.accent}80, 0 20px 40px rgba(0,0,0,0.4)`,
        }}
      >
        EXPERIMENTE AGORA
      </div>

      {/* URL */}
      <div
        style={{
          fontSize: 24,
          color: COLORS.muted,
          fontFamily: "monospace",
          letterSpacing: "2px",
          opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        prismaplayer.online
      </div>

      {/* Floating particles */}
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const radius = 200 + Math.sin(frame * 0.05 + i) * 50;
        const x = Math.cos(angle + frame * 0.02) * radius;
        const y = Math.sin(angle + frame * 0.02) * radius;
        const particleOpacity = interpolate(frame, [0, 20], [0, 0.6], { extrapolateRight: "clamp" });

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: COLORS.accent,
              left: "50%",
              top: "50%",
              transform: `translate(${x}px, ${y}px)`,
              opacity: particleOpacity,
              boxShadow: `0 0 20px ${COLORS.accent}`,
            }}
          />
        );
      })}
    </div>
  );
};

export const LaunchVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <AnimatedBackground />

      {/* Scene 1: Logo reveal (frames 0-90) */}
      <Sequence from={0} durationInFrames={90}>
        <LogoReveal />
      </Sequence>

      {/* Scene 2: Tagline (frames 70-180, overlap for smooth transition) */}
      <Sequence from={70} durationInFrames={110}>
        <TaglineReveal />
      </Sequence>

      {/* Scene 3: CTA finale (frames 160-300) */}
      <Sequence from={160} durationInFrames={140}>
        <CTAFinale />
      </Sequence>
    </AbsoluteFill>
  );
};