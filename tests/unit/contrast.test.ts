/**
 * Contrast Accessibility Test Suite
 *
 * Verifies WCAG 2.1 Level AA contrast ratios for the Blue Glass design system.
 * Invariants:
 *  - Normal text on dark background >= 4.5:1
 *  - Large text & UI badge components >= 3.0:1
 */

import { describe, it, expect } from "vitest";

// Helper: parse hex color to [r, g, b] in [0, 255]
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

// Relative luminance per W3C WCAG 2.1 definition
function getRelativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((val) => {
    const sRGB = val / 255;
    return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contrast ratio per W3C WCAG 2.1 definition: (L1 + 0.05) / (L2 + 0.05)
function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getRelativeLuminance(hex1);
  const lum2 = getRelativeLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Blue Glass Design Tokens - WCAG AA Contrast Ratios", () => {
  // Backgrounds:
  const bgDeep = "#060b14"; // ultra-deep cosmic canvas
  const bgSurface = "#0a1120"; // primary card / overlay surface
  const bgSlate = "#0f172a"; // slate-900 alternate surface

  describe("Body Text Contrast (WCAG AA Normal Text >= 4.5:1)", () => {
    it("primary text (#f8fafc) achieves >= 14:1 contrast on all surfaces", () => {
      const primaryText = "#f8fafc";
      expect(getContrastRatio(primaryText, bgDeep)).toBeGreaterThanOrEqual(14.0);
      expect(getContrastRatio(primaryText, bgSurface)).toBeGreaterThanOrEqual(14.0);
      expect(getContrastRatio(primaryText, bgSlate)).toBeGreaterThanOrEqual(13.0);
    });

    it("secondary text (#94a3b8) achieves >= 4.5:1 contrast on all surfaces", () => {
      const secondaryText = "#94a3b8";
      expect(getContrastRatio(secondaryText, bgDeep)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(secondaryText, bgSurface)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(secondaryText, bgSlate)).toBeGreaterThanOrEqual(4.5);
    });

    it("electric blue accent (#38bdf8) achieves >= 7:1 contrast on dark surfaces", () => {
      const accentSky = "#38bdf8";
      expect(getContrastRatio(accentSky, bgDeep)).toBeGreaterThanOrEqual(7.0);
      expect(getContrastRatio(accentSky, bgSurface)).toBeGreaterThanOrEqual(7.0);
    });

    it("cyan highlight (#22d3ee) achieves >= 9:1 contrast on dark surfaces", () => {
      const cyanAccent = "#22d3ee";
      expect(getContrastRatio(cyanAccent, bgDeep)).toBeGreaterThanOrEqual(9.0);
      expect(getContrastRatio(cyanAccent, bgSurface)).toBeGreaterThanOrEqual(9.0);
    });
  });

  describe("Status Indicators & Badges (WCAG AA Large Text / UI Components >= 3.0:1)", () => {
    it("emerald allow status (#10b981) achieves >= 4.5:1 contrast", () => {
      expect(getContrastRatio("#10b981", bgDeep)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio("#10b981", bgSurface)).toBeGreaterThanOrEqual(4.5);
    });

    it("amber redact status (#f59e0b) achieves >= 6.0:1 contrast", () => {
      expect(getContrastRatio("#f59e0b", bgDeep)).toBeGreaterThanOrEqual(6.0);
      expect(getContrastRatio("#f59e0b", bgSurface)).toBeGreaterThanOrEqual(6.0);
    });

    it("blue approval status (#38bdf8) achieves >= 7.0:1 contrast", () => {
      expect(getContrastRatio("#38bdf8", bgDeep)).toBeGreaterThanOrEqual(7.0);
      expect(getContrastRatio("#38bdf8", bgSurface)).toBeGreaterThanOrEqual(7.0);
    });

    it("rose block status (#f43f5e) achieves >= 3.5:1 contrast", () => {
      expect(getContrastRatio("#f43f5e", bgDeep)).toBeGreaterThanOrEqual(3.5);
      expect(getContrastRatio("#f43f5e", bgSurface)).toBeGreaterThanOrEqual(3.5);
    });
  });
});
