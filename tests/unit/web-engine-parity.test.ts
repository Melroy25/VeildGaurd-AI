/**
 * Unit Test: Browser Privacy Engine Parity & Determinism
 *
 * Verifies that client-side detectors in web/src/engine produce exact,
 * utility-preserving pseudonymized text matching the core requirements.
 */

import { describe, it, expect } from "vitest";
import { validateVerhoeff, validatePAN, scanTextInBrowser } from "../../web/src/engine/detectors";
import { sanitizeAndEvaluate } from "../../web/src/engine/sanitizer";

describe("Browser Privacy Engine - Detectors & Validators", () => {
  it("validates synthetic Indian Aadhaar numbers via Verhoeff checksum", () => {
    // Valid Verhoeff checksums
    expect(validateVerhoeff("2363")).toBe(true);
    expect(validateVerhoeff("2345 6789 0124")).toBe(true);

    // Invalid checksums (single digit error or wrong length)
    expect(validateVerhoeff("2364")).toBe(false);
    expect(validateVerhoeff("1234 5678 9999")).toBe(false);
  });

  it("validates Indian PAN structure and entity status character", () => {
    expect(validatePAN("ABCPE1234F")).toBe(true); // P = Person
    expect(validatePAN("ABCDE1234F")).toBe(false); // D is invalid status
    expect(validatePAN("INVALID_PAN")).toBe(false);
    expect(validatePAN("12345ABCDE")).toBe(false);
  });

  it("detects and extracts AWS access keys and generic passwords", () => {
    const text = "api_key: AKIAIOSFODNN7EXAMPLE and password = MySuperSecretPass!123";
    const findings = scanTextInBrowser(text);
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.some((f) => f.entity_type === "AWS_ACCESS_KEY")).toBe(true);
    expect(findings.some((f) => f.entity_type === "CREDENTIAL_SECRET")).toBe(true);
  });
});

describe("Browser Privacy Engine - Sanitizer & User Prompt Invariant", () => {
  it("sanitizes healthcare patient prompt with bracketed placeholders", () => {
    const prompt =
      "Patient Rahul Sharma, phone 9876543210, and Aadhaar 2345 6789 0123, has diabetes. Please check.";
    const result = sanitizeAndEvaluate(prompt, "corporate");

    expect(result.decision).toBe("require_approval");
    expect(result.findings.length).toBeGreaterThanOrEqual(3);

    // Assert exact bracketed placeholder replacement format requested by user:
    expect(result.sanitizedText).toContain("[PATIENT_1]");
    expect(result.sanitizedText).toContain("[PHONE_1]");
    expect(result.sanitizedText).toContain("[AADHAAR_1]");
    expect(result.sanitizedText).toContain("has diabetes");

    // Assert raw PII numbers are not present in sanitized text:
    expect(result.sanitizedText).not.toContain("Rahul Sharma");
    expect(result.sanitizedText).not.toContain("9876543210");
    expect(result.sanitizedText).not.toContain("2345 6789 0123");
  });

  it("blocks critical secret submissions", () => {
    const prompt = "My token is ghp_111122223333444455556666777788889999.";
    const result = sanitizeAndEvaluate(prompt, "corporate");

    expect(result.decision).toBe("block");
    expect(result.riskScore).toBe(1.0);
  });

  it("allows benign code snippets with zero false positives", () => {
    const prompt = "def add(a: int, b: int) -> int:\n    return a + b";
    const result = sanitizeAndEvaluate(prompt, "corporate");

    expect(result.decision).toBe("allow");
    expect(result.riskScore).toBe(0.0);
    expect(result.sanitizedText).toBe(prompt);
    expect(result.findings.length).toBe(0);
  });
});
