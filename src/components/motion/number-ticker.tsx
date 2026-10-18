"use client";

import { useEffect, useRef } from "react";
import { motion, useInView, useMotionValue, useSpring, useTransform } from "motion/react";

/**
 * Contador animado: número conta de 0 (ou startValue) até `value` quando entra
 * na viewport, com spring suave. Suporta decimais e formata em pt-BR.
 * Baseado no Magic UI NumberTicker, adaptado para motion/react + pt-BR.
 */
export default function NumberTicker({
  value,
  startValue = 0,
  delay = 0,
  decimalPlaces = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  startValue?: number;
  delay?: number;
  decimalPlaces?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(startValue);
  const springValue = useSpring(motionValue, { damping: 30, stiffness: 90 });
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (isInView) {
      const timeout = setTimeout(() => {
        motionValue.set(value);
      }, delay * 1000);
      return () => clearTimeout(timeout);
    }
  }, [isInView, value, delay, motionValue]);

  const display = useTransform(() => {
    const latest = springValue.get();
    const rounded = decimalPlaces > 0
      ? Math.round(latest * 10 ** decimalPlaces) / 10 ** decimalPlaces
      : Math.round(latest);
    const formatted = Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(rounded);
    return `${prefix}${formatted}${suffix}`;
  });

  return (
    <motion.span ref={ref} className={className}>
      <motion.span className="tabular-nums">{display}</motion.span>
    </motion.span>
  );
}
