"use client";

import { useSpring } from "motion/react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useChartConfig } from "./chart-config-context";
import { useChartHover, useChartStable } from "./chart-context";
import {
  computeSegmentBounds,
  INACTIVE_SEGMENT,
} from "./highlight-segment-bounds";

// Hover-highlight band for `line.tsx` and `area.tsx`. Computes the segment
// bounds and springs its x/width; `<HighlightSegment>` renders the clipped
// re-stroke. Spring tuning comes from `ChartConfigProvider.highlightSpring`.
// Stable + hover slices are read separately so callers can see the exact
// subscription surface (anything calling this hook will re-render on hover).

export interface HighlightSegmentResult {
  xSpring: ReturnType<typeof useSpring>;
  widthSpring: ReturnType<typeof useSpring>;
  isActive: boolean;
}

/**
 * @param enabled set false when there is no stroke to highlight (e.g. an area
 *   with `showLine={false}`); defaults true.
 */
export function useHighlightSegment({
  enabled = true,
}: {
  enabled?: boolean;
} = {}): HighlightSegmentResult {
  const { data, xScale, xAccessor } = useChartStable();
  const { tooltipData, selection } = useChartHover();
  const { highlightSpring } = useChartConfig();

  const bounds = useMemo(
    () =>
      enabled
        ? computeSegmentBounds(data, xScale, xAccessor, tooltipData, selection)
        : INACTIVE_SEGMENT,
    [enabled, data, xScale, xAccessor, tooltipData, selection]
  );

  const xSpring = useSpring(0, highlightSpring);
  const widthSpring = useSpring(0, highlightSpring);

  // Jump on inactive→active so the band appears at the hovered point instead
  // of sliding in from x=0; ease on subsequent moves. Roda após o commit
  // (não durante o render) via useLayoutEffect, imitando o timing anterior.
  const wasActiveRef = useRef(false);
  const boundsRef = useRef(bounds);

  // Espelhos atualizados dentro do próprio efeito (nada de refs no render).
  useLayoutEffect(() => {
    boundsRef.current = bounds;
    const current = boundsRef.current;
    if (current.isActive && !wasActiveRef.current) {
      xSpring.jump(current.x);
      widthSpring.jump(current.width);
    } else {
      xSpring.set(current.x);
      widthSpring.set(current.width);
    }
    wasActiveRef.current = current.isActive;
  });

  return { xSpring, widthSpring, isActive: bounds.isActive };
}
