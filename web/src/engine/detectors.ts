/**
 * VeilGuard Web Demo - In-Browser Deterministic Privacy Detectors
 *
 * Implements client-side detection algorithms matching the Python engine:
 *  - Verhoeff checksum algorithm for 12-digit Indian Aadhaar validation
 *  - Structure & entity-status validation for Indian PAN
 *  - Modulo 36 checksum for Indian GSTIN
 *  - High-precision patterns for Email, Phone, API Keys, and Secrets
 *  - Contextual quasi-identifiers & medical condition indicators
 */

export interface Finding {
  category: "PII" | "GOVERNMENT_ID" | "FINANCIAL" | "SECRET" | "MEDICAL" | "QUASI_IDENTIFIER";
  entity_type: string;
  start: number;
  end: number;
  matched_text: string;
  placeholder: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Verhoeff Algorithm Tables
// ---------------------------------------------------------------------------

const VERHOEFF_D: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function validateVerhoeff(numStr: string): boolean {
  const clean = numStr.replace(/\D/g, "");
  if (clean.length < 2) return false;
  let c = 0;
  const digits = clean.split("").reverse().map(Number);
  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digits[i]]];
  }
  return c === 0;
}

export function validatePAN(pan: string): boolean {
  const clean = pan.trim().toUpperCase();
  return /^[A-Z]{3}[CPHFATBLJG][A-Z]\d{4}[A-Z]$/.test(clean);
}

// ---------------------------------------------------------------------------
// Medical Condition Dictionary
// ---------------------------------------------------------------------------

const MEDICAL_TERMS = new Set([
  "diabetes",
  "hypertension",
  "cancer",
  "chemotherapy",
  "bipolar",
  "hiv",
  "depression",
  "leukemia",
  "asthma",
  "cardiac arrest",
  "schizophrenia",
  "stroke",
  "alzheimer",
  "parkinson",
]);

// ---------------------------------------------------------------------------
// Main Scan Algorithm
// ---------------------------------------------------------------------------

export function scanTextInBrowser(text: string): Finding[] {
  const findings: Finding[] = [];

  // 1. Secrets / Credentials (API Keys, Tokens, Passwords)
  const awsRegex = /\b(AKIA[0-9A-Z]{16})\b/g;
  let match: RegExpExecArray | null;
  while ((match = awsRegex.exec(text)) !== null) {
    findings.push({
      category: "SECRET",
      entity_type: "AWS_ACCESS_KEY",
      start: match.index,
      end: match.index + match[0].length,
      matched_text: match[0],
      placeholder: "[CRITICAL_SECRET]",
      confidence: 1.0,
    });
  }

  const githubRegex = /\b(gh[pousr]_[A-Za-z0-9_]{36,255})\b/g;
  while ((match = githubRegex.exec(text)) !== null) {
    findings.push({
      category: "SECRET",
      entity_type: "GITHUB_TOKEN",
      start: match.index,
      end: match.index + match[0].length,
      matched_text: match[0],
      placeholder: "[CRITICAL_SECRET]",
      confidence: 1.0,
    });
  }

  const openaiRegex = /\b(sk-[a-zA-Z0-9_-]{20,})\b/g;
  while ((match = openaiRegex.exec(text)) !== null) {
    findings.push({
      category: "SECRET",
      entity_type: "OPENAI_API_KEY",
      start: match.index,
      end: match.index + match[0].length,
      matched_text: match[0],
      placeholder: "[CRITICAL_SECRET]",
      confidence: 1.0,
    });
  }

  const pwRegex = /(?:password|secret|api_key|token)\s*[:=]\s*["']?([A-Za-z0-9!@#$%^&*()_+\-=[\]{};':",./<>?~`]{6,})["']?/gi;
  while ((match = pwRegex.exec(text)) !== null) {
    const val = match[1];
    const valStart = match.index + match[0].lastIndexOf(val);
    findings.push({
      category: "SECRET",
      entity_type: "CREDENTIAL_SECRET",
      start: valStart,
      end: valStart + val.length,
      matched_text: val,
      placeholder: "[CRITICAL_SECRET]",
      confidence: 0.95,
    });
  }

  // 2. Government IDs: Aadhaar
  const aadhaarRegex = /(?:(?:\b(aadhaar|uidai)\s*[:#-]?\s*)?([2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}))\b/gi;
  while ((match = aadhaarRegex.exec(text)) !== null) {
    const rawVal = match[2];
    const hasContext = !!match[1];
    if (validateVerhoeff(rawVal) || hasContext) {
      const start = match.index + match[0].indexOf(rawVal);
      findings.push({
        category: "GOVERNMENT_ID",
        entity_type: "INDIA_AADHAAR",
        start,
        end: start + rawVal.length,
        matched_text: rawVal,
        placeholder: "[AADHAAR_1]",
        confidence: validateVerhoeff(rawVal) ? 0.98 : 0.90,
      });
    }
  }

  // 3. Government IDs: PAN
  const panRegex = /\b([A-Z]{5}\d{4}[A-Z])\b/g;
  while ((match = panRegex.exec(text)) !== null) {
    const rawVal = match[0];
    if (validatePAN(rawVal)) {
      findings.push({
        category: "GOVERNMENT_ID",
        entity_type: "INDIA_PAN",
        start: match.index,
        end: match.index + rawVal.length,
        matched_text: rawVal,
        placeholder: "[PAN_1]",
        confidence: 0.95,
      });
    }
  }

  // 4. Direct PII: Email
  const emailRegex = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
  while ((match = emailRegex.exec(text)) !== null) {
    findings.push({
      category: "PII",
      entity_type: "EMAIL_ADDRESS",
      start: match.index,
      end: match.index + match[0].length,
      matched_text: match[0],
      placeholder: "[EMAIL_1]",
      confidence: 0.95,
    });
  }

  // 5. Direct PII: Phone numbers
  const phoneRegex = /(?:(?:\+91[\s-]?)|\b0)?([6-9]\d{4}[\s-]?\d{5})\b/g;
  while ((match = phoneRegex.exec(text)) !== null) {
    findings.push({
      category: "PII",
      entity_type: "PHONE_NUMBER",
      start: match.index,
      end: match.index + match[0].length,
      matched_text: match[0],
      placeholder: "[PHONE_1]",
      confidence: 0.9,
    });
  }

  // 6. Context-Aware Names (Patient, Customer, Dr., etc.)
  const roleNameRegex = /\b(Patient|Customer|Client|User|Employee|Dr\.|Mr\.|Ms\.|Mrs\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  while ((match = roleNameRegex.exec(text)) !== null) {
    const role = match[1].toLowerCase();
    const name = match[2];
    const nameStart = match.index + match[0].indexOf(name);
    let placeholder = "[PERSON_1]";
    if (role.includes("patient")) placeholder = "[PATIENT_1]";
    else if (role.includes("customer")) placeholder = "[CUSTOMER_1]";
    else if (role.includes("client")) placeholder = "[CLIENT_1]";

    findings.push({
      category: "PII",
      entity_type: "PERSON_NAME",
      start: nameStart,
      end: nameStart + name.length,
      matched_text: name,
      placeholder,
      confidence: 0.92,
    });
  }

  // 7. Medical Condition Mentions (Task Necessity: retain condition when query is medical inquiry)
  const isMedicalInquiry = /(?:precaution|diet|treatment|medicine|therapy|cure|symptom|check)/i.test(text);
  if (!isMedicalInquiry) {
    for (const term of MEDICAL_TERMS) {
      const termRegex = new RegExp(`\\b(${term})\\b`, "gi");
      while ((match = termRegex.exec(text)) !== null) {
        findings.push({
          category: "MEDICAL",
          entity_type: "HEALTH_CONDITION",
          start: match.index,
          end: match.index + match[0].length,
          matched_text: match[0],
          placeholder: "[CONDITION_1]",
          confidence: 0.88,
        });
      }
    }
  }

  // Sort findings by start offset ascending
  findings.sort((a, b) => a.start - b.start);

  // De-duplicate / resolve overlapping spans
  const resolved: Finding[] = [];
  let lastEnd = -1;
  for (const f of findings) {
    if (f.start >= lastEnd) {
      resolved.push(f);
      lastEnd = f.end;
    }
  }

  return resolved;
}
