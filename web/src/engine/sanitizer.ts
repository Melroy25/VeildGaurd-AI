/**
 * VeilGuard Web Demo - In-Browser Sanitizer & Policy Engine
 *
 * Replaces sensitive detected spans with utility-preserving placeholders
 * and evaluates deterministic policy rules.
 */

import { type Finding, scanTextInBrowser } from "./detectors";

export interface ScanResult {
  originalText: string;
  sanitizedText: string;
  decision: "allow" | "redact" | "require_approval" | "block";
  riskScore: number;
  reason: string;
  findings: Finding[];
}

export function sanitizeAndEvaluate(text: string, profile: string = "corporate"): ScanResult {
  const findings = scanTextInBrowser(text);

  if (findings.length === 0) {
    return {
      originalText: text,
      sanitizedText: text,
      decision: "allow",
      riskScore: 0.0,
      reason: "No sensitive personal details, identifiers, or credentials detected.",
      findings: [],
    };
  }

  // 1. Build Sanitized Text using exact slice indexing
  let sanitizedText = "";
  let lastIndex = 0;

  for (const f of findings) {
    sanitizedText += text.slice(lastIndex, f.start);
    sanitizedText += f.placeholder;
    lastIndex = f.end;
  }
  sanitizedText += text.slice(lastIndex);

  // 2. Evaluate Deterministic Policy
  const hasSecrets = findings.some((f) => f.category === "SECRET");
  const hasGovtId = findings.some((f) => f.category === "GOVERNMENT_ID");
  const hasMedical = findings.some((f) => f.category === "MEDICAL");
  const piiCount = findings.filter((f) => f.category === "PII").length;

  let decision: "allow" | "redact" | "require_approval" | "block" = "require_approval";
  let riskScore = 0.5;
  let reason = "Sensitive attributes detected. Human confirmation required.";

  if (hasSecrets) {
    decision = "block";
    riskScore = 1.0;
    reason = "Critical authentication credential or private key detected. Prompt submission is blocked.";
  } else if (hasGovtId && (profile === "corporate" || profile === "healthcare")) {
    decision = "require_approval";
    riskScore = 0.85;
    reason = "Official national government identifier (Aadhaar/PAN) detected. Pseudonymized before delivery.";
  } else if (hasMedical && piiCount > 0) {
    decision = "require_approval";
    riskScore = 0.9;
    reason = "Identifiable health/medical information detected. Utility-preserving redaction enforced.";
  } else if (piiCount > 0) {
    decision = "redact";
    riskScore = 0.45;
    reason = "Personal contact information detected. Replaced with consistent role placeholder.";
  }

  return {
    originalText: text,
    sanitizedText,
    decision,
    riskScore,
    reason,
    findings,
  };
}
