"use client";

import { useEffect, useRef, useState } from "react";
import type { HeatmapTooltipData } from "./heatmap-context";

export function useDelayedTooltipData(
  tooltipData: HeatmapTooltipData | null,
  showDelay: number,
  hideDelay: number
): HeatmapTooltipData | null {
  const [displayData, setDisplayData] = useState<HeatmapTooltipData | null>(
    null
  );
  const isShowingRef = useRef(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  useEffect(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = undefined;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = undefined;
    }

    if (tooltipData) {
      if (isShowingRef.current || showDelay === 0) {
        if (!isShowingRef.current) {
          isShowingRef.current = true;
        }
        // Posterga a exibição imediata para um timer de 0ms: mesmo resultado
        // visual (o tooltip já fica pendente), sem setState síncrono.
        showTimerRef.current = setTimeout(() => {
          setDisplayData(tooltipData);
        }, 0);
        return;
      }

      showTimerRef.current = setTimeout(() => {
        isShowingRef.current = true;
        setDisplayData(tooltipData);
      }, showDelay);
      return;
    }

    if (hideDelay === 0) {
      // Ocultação imediata também postergada via timer de 0ms.
      hideTimerRef.current = setTimeout(() => {
        isShowingRef.current = false;
        setDisplayData(null);
      }, 0);
      return;
    }

    hideTimerRef.current = setTimeout(() => {
      isShowingRef.current = false;
      setDisplayData(null);
    }, hideDelay);
  }, [tooltipData, showDelay, hideDelay]);

  useEffect(
    () => () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    },
    []
  );

  return displayData;
}
