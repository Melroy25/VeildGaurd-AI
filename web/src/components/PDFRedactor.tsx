/**
 * VeilGuard Web Demo - In-Browser PDF Document Scanner & Redaction
 *
 * Ingests PDF or text documents, identifies sensitive regulatory IDs, PII,
 * credentials, and financial metrics, and generates utility-preserving
 * sanitized output safe for submission to AI endpoints.
 */

import React, { useState, useMemo, useRef } from "react";
import * as fflate from "fflate";
import { sanitizeAndEvaluate, type ScanResult } from "../engine/sanitizer";

interface DocumentPreset {
  name: string;
  category: string;
  badge: string;
  badgeColor: string;
  content: string;
}

const SAMPLE_DOCUMENTS: DocumentPreset[] = [
  {
    name: "VeilGuard_Test_Business_Report.pdf",
    category: "Corporate & Finance",
    badge: "FINANCIAL PII",
    badgeColor: "text-amber-400 border-amber-500/30 bg-amber-950/40",
    content: `CONFIDENTIAL BUSINESS REPORT - Q3 FY2026
Executive Lead: Rajesh Varma (PAN: ABCDV1234K, Phone: +91 9820012345)
Client Account: Apex Logistics Pvt Ltd (GSTIN: 27AABCU9603R1ZM)
Direct Deposit Account: 987654321098 at HDFC Bank (Branch: Nariman Point, Mumbai)
Contract Value: INR 45,00,000 via corporate wire transfer.
Authorized Signatory: Priya Nair, email: priya.nair@apexlogistics.com

Operational Summary:
Revenue targets achieved for North Zone with 18% YoY growth. 
All proprietary supplier agreements remain bound by non-disclosure clauses.`,
  },
  {
    name: "Patient_Discharge_Summary.pdf",
    category: "Clinical & Healthcare",
    badge: "HEALTHCARE KYC",
    badgeColor: "text-rose-400 border-rose-500/30 bg-rose-950/40",
    content: `APOLLO HOSPITALS CLINICAL SUMMARY
Patient Name: Rahul Sharma
Age: 48 | Gender: Male
National ID (Aadhaar): 2345 6789 0123
Contact Phone: +91 9876543210 | Emergency Contact: +91 9123456789
Attending Physician: Dr. Sunita Kulkarni, MD

Clinical Diagnosis:
Patient presents with Type 2 Diabetes Mellitus with peripheral neuropathy.
Fasting Blood Glucose: 168 mg/dL, HbA1c: 8.4%.
Prescription Plan: Metformin 500mg BID with dietary carbohydrate restrictions.`,
  },
  {
    name: "Cloud_DevOps_Runbook.pdf",
    category: "Infrastructure & Security",
    badge: "CRITICAL SECRET",
    badgeColor: "text-rose-400 border-rose-500/30 bg-rose-950/40",
    content: `AWS INFRASTRUCTURE RECOVERY RUNBOOK
Environment: Production Cluster (ap-south-1)
Primary Admin: DevOps Lead (admin@vexora-cloud.internal)
Deployment Token: ghp_EXAMPLETOKEN1234567890abcdefghijklm
Database Connection: postgresql://dbadmin:SuperSecretPass2026@prod-db.vexora.internal:5432/main
OpenAI API Backup Key: sk-EXAMPLEOpenAIKey1234567890abcdefghijkl`,
  },
];

/**
 * Adobe ASCII85 decoding for PDF stream content.
 */
function decodeASCII85(clean: string): Uint8Array {
  clean = clean.replace(/<~|~>|\s/g, "");
  const out: number[] = [];
  let tuple = 0;
  let count = 0;
  for (let i = 0; i < clean.length; i++) {
    const c = clean.charCodeAt(i);
    if (clean[i] === "z" && count === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    if (c >= 33 && c <= 117) {
      tuple = tuple * 85 + (c - 33);
      count++;
      if (count === 5) {
        out.push((tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255);
        tuple = 0;
        count = 0;
      }
    }
  }
  if (count > 0) {
    for (let i = 0; i < 5 - count; i++) tuple = tuple * 85 + 84;
    for (let i = 0; i < count - 1; i++) out.push((tuple >>> (24 - i * 8)) & 255);
  }
  return new Uint8Array(out);
}

/**
 * Robust pure-JS text stream parser for PDF files (supporting raw, Deflate, and ASCII85 streams).
 */
function extractTextFromPDFBytes(bytes: Uint8Array): string {
  const binary = new TextDecoder("latin1").decode(bytes);
  let extractedAll = "";
  let streamIdx = 0;

  while ((streamIdx = binary.indexOf("stream", streamIdx)) !== -1) {
    const afterStream = streamIdx + 6;
    let streamStart = afterStream;
    if (binary[streamStart] === "\r") streamStart++;
    if (binary[streamStart] === "\n") streamStart++;

    const streamEnd = binary.indexOf("endstream", streamStart);
    if (streamEnd === -1) break;

    const rawStreamStr = binary.slice(streamStart, streamEnd).trim();
    streamIdx = streamEnd + 9;

    let decompressedBytes: Uint8Array | null = null;
    try {
      const a85 = decodeASCII85(rawStreamStr);
      decompressedBytes = fflate.unzlibSync(a85);
    } catch {
      try {
        const rawBytes = new Uint8Array([...rawStreamStr].map((c) => c.charCodeAt(0)));
        decompressedBytes = fflate.unzlibSync(rawBytes);
      } catch {
        try {
          const rawBytes = new Uint8Array([...rawStreamStr].map((c) => c.charCodeAt(0)));
          decompressedBytes = fflate.inflateSync(rawBytes);
        } catch {
          // Uncompressed stream
        }
      }
    }

    const streamContent = decompressedBytes
      ? new TextDecoder("latin1").decode(decompressedBytes)
      : rawStreamStr;

    // Extract text from standard PDF operators: (text) Tj or [(text)] TJ
    const textPattern = /\((.*?)\)\s*Tj|\[(.*?)\]\s*TJ/g;
    let match;
    while ((match = textPattern.exec(streamContent)) !== null) {
      if (match[1]) {
        extractedAll += match[1].replace(/\\([()\\])/g, "$1") + " ";
      } else if (match[2]) {
        const parts = match[2].match(/\((.*?)\)/g);
        if (parts) {
          extractedAll += parts.map((p) => p.slice(1, -1).replace(/\\([()\\])/g, "$1")).join("") + " ";
        }
      }
    }
    extractedAll += "\n";
  }

  const cleaned = extractedAll.trim();
  if (cleaned.length > 30) {
    return cleaned;
  }

  // Fallback: extract printable ASCII strings
  const stringRegex = /[\x20-\x7E\t\r\n]{5,}/g;
  const strings = binary.match(stringRegex) || [];
  const meaningful = strings
    .filter((s) => !s.startsWith("<<") && !s.includes("endobj") && !s.includes("/Font") && !s.includes("/Type"))
    .join("\n");

  return meaningful.length > 50 ? meaningful : "Document parsed. (Non-text vector streams detected)";
}

function escapePDF(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Generates a valid, standards-compliant PDF 1.4 document containing the sanitized text.
 */
function createSanitizedPDF(title: string, text: string): Uint8Array {
  const lines = text.split("\n");
  const maxLinesPerPage = 44;
  const pages: string[][] = [];
  let currentPage: string[] = [];

  for (const rawLine of lines) {
    if (!rawLine.trim()) {
      currentPage.push("");
      if (currentPage.length >= maxLinesPerPage) {
        pages.push(currentPage);
        currentPage = [];
      }
      continue;
    }
    const words = rawLine.split(" ");
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).length > 80) {
        currentPage.push(cur);
        if (currentPage.length >= maxLinesPerPage) {
          pages.push(currentPage);
          currentPage = [];
        }
        cur = w;
      } else {
        cur = cur ? cur + " " + w : w;
      }
    }
    if (cur) {
      currentPage.push(cur);
      if (currentPage.length >= maxLinesPerPage) {
        pages.push(currentPage);
        currentPage = [];
      }
    }
  }
  if (currentPage.length > 0) pages.push(currentPage);
  if (pages.length === 0) pages.push(["(Empty Document)"]);

  const objects: string[] = [];
  const addObj = (str: string) => {
    objects.push(str);
    return objects.length;
  };

  // Obj 1: Catalog
  addObj("<< /Type /Catalog /Pages 2 0 R >>");
  // Obj 2: Pages placeholder
  addObj("");
  // Obj 3: Font Helvetica
  addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  // Obj 4: Font Helvetica-Bold
  addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const pageObjIds: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    const pageLines = pages[i];
    let stream = "BT\n";
    // Title header
    stream += "/F2 11 Tf\n50 790 Td\n(" + escapePDF(title) + ") Tj\n";
    stream += "/F1 8 Tf\n0 -14 Td\n([VeilGuard AI Sanitized - Zero PII or Sensitive Credentials Exposed]) Tj\n";
    // Page body
    stream += "/F1 9 Tf\n0 -22 Td\n";
    for (const line of pageLines) {
      stream += "(" + escapePDF(line) + ") Tj\n0 -13 Td\n";
    }
    // Footer page number
    stream += `0 -20 Td\n(Page ${i + 1} of ${pages.length} - VeilGuard AI Firewall) Tj\n`;
    stream += "ET";

    const contentObjId = addObj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageObjId = addObj(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>`
    );
    pageObjIds.push(pageObjId);
  }

  // Update Obj 2 (Pages)
  objects[1] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) {
    pdf += `${o.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const outputBytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) {
    outputBytes[i] = pdf.charCodeAt(i) & 0xff;
  }
  return outputBytes;
}

export const PDFRedactor: React.FC = () => {
  const [docName, setDocName] = useState<string>("VeilGuard_Test_Business_Report.pdf");
  const [docText, setDocText] = useState<string>(SAMPLE_DOCUMENTS[0].content);
  const [profile, setProfile] = useState<string>("corporate");
  const [copied, setCopied] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scanResult: ScanResult = useMemo(() => {
    return sanitizeAndEvaluate(docText, profile);
  }, [docText, profile]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setDocName(file.name);

    if (file.name.toLowerCase().endsWith(".pdf")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        if (buffer) {
          const parsed = extractTextFromPDFBytes(new Uint8Array(buffer));
          setDocText(parsed);
        }
        setIsProcessing(false);
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        setDocText(String(event.target?.result || ""));
        setIsProcessing(false);
      };
      reader.readAsText(file);
    }
  };

  const handleDownloadSanitized = () => {
    const cleanContent = scanResult.sanitizedText;
    const baseName = docName.replace(/\.[^/.]+$/, "");
    const pdfBytes = createSanitizedPDF(`Sanitized Document - ${baseName}`, cleanContent);
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sanitized_${baseName}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  const handleCopy = () => {
    if (!scanResult.sanitizedText) return;
    navigator.clipboard.writeText(scanResult.sanitizedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const decisionBadges = {
    allow: { text: "ALLOWED", color: "bg-emerald-950/80 text-emerald-400 border-emerald-500/40" },
    redact: { text: "REDACTED", color: "bg-amber-950/80 text-amber-400 border-amber-500/40" },
    require_approval: { text: "APPROVAL REQUIRED", color: "bg-sky-950/80 text-sky-400 border-sky-500/40" },
    block: { text: "BLOCKED", color: "bg-rose-950/80 text-rose-400 border-rose-500/40" },
  };

  const currentDecision = decisionBadges[scanResult.decision];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-sky-950/40 via-cyan-950/20 to-slate-900/60 border border-sky-500/20 backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">📄</span>
              <h2 className="text-xl font-bold text-white tracking-tight">
                PDF Document Scanner &amp; Redaction
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/30">
                True In-Memory Redaction
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Upload PDF documents or choose a sample file to strip Indian regulatory IDs, medical PII, and corporate credentials before sending to AI assistants.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.txt"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950 text-xs font-bold transition-all shadow-[0_0_20px_rgba(56,189,248,0.4)] cursor-pointer flex items-center gap-2"
            >
              <span>📤</span> Upload PDF / File
            </button>
          </div>
        </div>
      </div>

      {/* Preset Documents Grid */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
          <span>⚡</span> Quick Sample Documents
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SAMPLE_DOCUMENTS.map((doc, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setDocName(doc.name);
                setDocText(doc.content);
              }}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                docName === doc.name
                  ? "bg-sky-950/40 border-sky-500/50 shadow-[0_0_20px_rgba(56,189,248,0.15)] ring-1 ring-sky-500/30"
                  : "bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white truncate max-w-[180px]">{doc.name}</span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${doc.badgeColor}`}>
                  {doc.badge}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                {doc.content.slice(0, 110)}...
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Side-by-Side Dual View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Original Document View */}
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl flex flex-col h-[420px]">
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Original Document ({docName})
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              {docText.length} characters
            </span>
          </div>
          <textarea
            value={docText}
            onChange={(e) => setDocText(e.target.value)}
            placeholder="Paste or upload document text here..."
            className="w-full flex-1 bg-black/40 border border-white/10 rounded-xl p-3.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500/50 resize-none leading-relaxed"
          />
        </div>

        {/* Sanitized Document View */}
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl flex flex-col h-[420px]">
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Sanitized Document (Safe for AI)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!scanResult.sanitizedText}
                className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-[11px] font-semibold text-slate-300 transition-all cursor-pointer"
              >
                {copied ? "✅ Copied" : "📋 Copy"}
              </button>
              <button
                type="button"
                onClick={handleDownloadSanitized}
                disabled={!scanResult.sanitizedText}
                className="px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-[11px] font-bold text-emerald-300 transition-all cursor-pointer flex items-center gap-1 shadow-[0_0_12px_rgba(52,211,153,0.2)]"
                title="Download sanitized output as a PDF file"
              >
                <span>📄</span> {downloadSuccess ? "PDF Downloaded!" : "Download Sanitized PDF"}
              </button>
            </div>
          </div>
          <div className="w-full flex-1 bg-black/40 border border-white/10 rounded-xl p-3.5 text-xs font-mono text-emerald-300 overflow-y-auto leading-relaxed select-all">
            {isProcessing ? (
              <span className="text-slate-500">Processing document streams...</span>
            ) : scanResult.sanitizedText ? (
              scanResult.sanitizedText
            ) : (
              <span className="text-slate-600">Sanitized output will appear here...</span>
            )}
          </div>
        </div>
      </div>

      {/* Findings Breakdown Card */}
      <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10 mb-4">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${currentDecision.color}`}>
              {currentDecision.text}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {scanResult.findings.length} sensitive entity spans intercepted
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">Policy Profile:</span>
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              className="bg-black/40 border border-white/10 text-xs text-slate-300 rounded-lg px-2.5 py-1 focus:outline-none"
            >
              <option value="corporate">Corporate (Strict)</option>
              <option value="healthcare">Healthcare (HIPAA)</option>
              <option value="personal">Personal / Dev</option>
            </select>
          </div>
        </div>

        {scanResult.findings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="py-2 px-3 font-semibold">Category</th>
                  <th className="py-2 px-3 font-semibold">Detected Entity</th>
                  <th className="py-2 px-3 font-semibold">Matched Token Span</th>
                  <th className="py-2 px-3 font-semibold">Utility Placeholder</th>
                  <th className="py-2 px-3 font-semibold text-right">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {scanResult.findings.map((finding, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950/60 border border-sky-500/30 text-sky-400">
                        {finding.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-300">
                      {finding.entity_type}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-rose-300 bg-rose-950/20 rounded px-1.5 py-0.5">
                      {finding.matched_text}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400 font-bold">
                      {finding.placeholder}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400 text-right">
                      {(finding.confidence * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-slate-500">
            ✅ No sensitive entities detected in this document. Clean to submit to public AI endpoints.
          </div>
        )}
      </div>
    </div>
  );
};
