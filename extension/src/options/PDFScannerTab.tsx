/**
 * VeilGuard AI - PDF Scanner & True Redaction Tab (Options Page)
 *
 * Capabilities:
 *  - Drag-and-drop text-based PDF ingestion.
 *  - In-memory inspection via local loopback engine POST /pdf/scan.
 *  - True redaction & dual-extractor verification via POST /pdf/redact.
 *  - Automatic download of sanitized PDF (<filename>-sanitized.pdf).
 *  - Emits metadata-only audit events with source="document" (Rule 7).
 */

import React, { useState, useRef, useCallback } from "react";
import type { StoredEvent } from "../background/events-store";

interface PDFFindingItem {
  page: number;
  rect: [number, number, number, number];
  category: string;
  entity_type: string;
  placeholder: string;
  reason: string;
}

interface PDFScanData {
  total_pages: number;
  file_size_bytes: number;
  findings_count: number;
  findings: PDFFindingItem[];
  notices: string[];
}

interface PDFScannerTabProps {
  onEventLogged?: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  PII: "#38bdf8",
  GOVERNMENT_ID: "#f59e0b",
  FINANCIAL: "#ec4899",
  SECRET: "#ef4444",
  MEDICAL: "#10b981",
  QUASI_IDENTIFIER: "#a855f7",
};

export const PDFScannerTab: React.FC<PDFScannerTabProps> = ({ onEventLogged }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [profile, setProfile] = useState<string>("company");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isRedacting, setIsRedacting] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<PDFScanData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setSuccessNotice(null);
    setScanResult(null);

    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMessage("Only PDF documents (.pdf) are supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("Document size exceeds maximum allowed limit of 10 MB.");
      return;
    }
    setSelectedFile(file);
  };

  const getEngineToken = async (): Promise<string> => {
    return new Promise((resolve) => {
      chrome.storage.local.get(["vg_token"], (res) => {
        resolve(res["vg_token"] || "");
      });
    });
  };

  const handleScan = useCallback(async () => {
    if (!selectedFile) return;
    setIsScanning(true);
    setErrorMessage(null);
    setSuccessNotice(null);

    try {
      const token = await getEngineToken();
      const arrayBuffer = await selectedFile.arrayBuffer();

      const response = await fetch("http://127.0.0.1:8765/pdf/scan", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/pdf",
          "X-Profile": profile,
        },
        body: arrayBuffer,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || `Scan failed with HTTP ${response.status}`);
      }

      const data = (await response.json()) as PDFScanData;
      setScanResult(data);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "PDF scan failed. Ensure engine is running.");
    } finally {
      setIsScanning(false);
    }
  }, [selectedFile, profile]);

  const handleRedactAndDownload = useCallback(async () => {
    if (!selectedFile) return;
    setIsRedacting(true);
    setErrorMessage(null);
    setSuccessNotice(null);

    const tStart = performance.now();

    try {
      const token = await getEngineToken();
      const arrayBuffer = await selectedFile.arrayBuffer();

      const response = await fetch("http://127.0.0.1:8765/pdf/redact", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/pdf",
          "X-Profile": profile,
        },
        body: arrayBuffer,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || `Redaction failed with HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const countRedacted = response.headers.get("X-VeilGuard-Entities-Redacted") || "0";
      const latencyMs = Math.round(performance.now() - tStart);

      // Trigger browser download
      const downloadUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      const baseName = selectedFile.name.replace(/\.pdf$/i, "");
      downloadLink.href = downloadUrl;
      downloadLink.download = `${baseName}-sanitized.pdf`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);

      // Category counts from scan
      const categoryCounts: Record<string, number> = {};
      if (scanResult?.findings) {
        for (const f of scanResult.findings) {
          categoryCounts[f.category] = (categoryCounts[f.category] || 0) + 1;
        }
      }

      // Record metadata audit event with source="document" (Rule 7)
      const auditEvent: StoredEvent = {
        timestamp: new Date().toISOString(),
        destination: "local-pdf",
        profile: profile,
        decision: parseInt(countRedacted, 10) > 0 ? "redact" : "allow",
        user_choice: "sent_sanitized",
        rule_ids: parseInt(countRedacted, 10) > 0 ? ["PDF_TRUE_REDACTION"] : [],
        category_counts: categoryCounts,
        entity_count: parseInt(countRedacted, 10),
        latency_ms: latencyMs,
        source: "document",
        outcome: "user_approved",
      };

      chrome.runtime.sendMessage({ type: "RECORD_EVENT", event: auditEvent }, () => {
        if (onEventLogged) onEventLogged();
      });

      setSuccessNotice(
        `Document sanitized successfully! ${countRedacted} entity occurrences removed. Dual-extractor verified.`
      );
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "PDF redaction failed. Ensure engine is running."
      );
    } finally {
      setIsRedacting(false);
    }
  }, [selectedFile, profile, scanResult, onEventLogged]);

  return (
    <div className="space-y-6" id="pdf-scanner-tab">
      {/* Introduction Card */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h2 className="text-base font-semibold text-sky-400 mb-2">
          PDF Document Scanner & True Redaction
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          Upload text-based PDF documents to inspect sensitive entities and generate sanitized documents before uploading to AI tools.
          Unlike visual blackout tools, VeilGuard performs <strong>true redaction</strong>: underlying character glyphs and stream objects are completely purged, metadata/XML streams are scrubbed, and sanitization is cross-verified via independent dual extractors (PyMuPDF + pypdf).
        </p>
        <p className="text-[11px] text-slate-400 mt-2">
          <em>Notice:</em> Scans vector and embedded text streams. Image-only scanned PDFs without embedded text require OCR preprocessing. Zero document content is ever written to disk or persistent storage.
        </p>
      </section>

      {/* File Ingestion & Settings */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          {/* File Picker */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Select Document (Max 10 MB / 50 Pages)
            </label>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                id="pdf-file-picker"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                id="pdf-select-button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-xs text-slate-200 hover:bg-slate-700 transition"
              >
                Choose PDF File
              </button>
              <span className="text-xs text-slate-400 self-center truncate max-w-xs" id="pdf-selected-name">
                {selectedFile ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)` : "No file selected"}
              </span>
            </div>
          </div>

          {/* Policy Profile */}
          <div>
            <label htmlFor="pdf-profile-select" className="block text-xs font-medium text-slate-400 mb-1">
              Policy Profile
            </label>
            <select
              id="pdf-profile-select"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="company">company (Strict PII & Secrets)</option>
              <option value="personal">personal (Relaxed Direct PII)</option>
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex flex-wrap gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            id="pdf-scan-button"
            onClick={handleScan}
            disabled={!selectedFile || isScanning || isRedacting}
            className={`px-4 py-2 rounded text-xs font-semibold transition ${
              !selectedFile || isScanning || isRedacting
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-sky-600 hover:bg-sky-500 text-white"
            }`}
          >
            {isScanning ? "Scanning PDF..." : "Scan Document"}
          </button>

          <button
            type="button"
            id="pdf-redact-button"
            onClick={handleRedactAndDownload}
            disabled={!selectedFile || isScanning || isRedacting}
            className={`px-4 py-2 rounded text-xs font-semibold transition ${
              !selectedFile || isScanning || isRedacting
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            {isRedacting ? "Sanitizing..." : "Redact & Download Sanitized PDF"}
          </button>
        </div>

        {/* Error / Success Messages */}
        {errorMessage && (
          <div className="mt-4 p-3 bg-red-950/60 border border-red-800/80 rounded text-xs text-red-200" id="pdf-error-banner">
            {errorMessage}
          </div>
        )}
        {successNotice && (
          <div className="mt-4 p-3 bg-emerald-950/60 border border-emerald-800/80 rounded text-xs text-emerald-200" id="pdf-success-banner">
            {successNotice}
          </div>
        )}
      </section>

      {/* Scan Results Card */}
      {scanResult && (
        <section className="bg-slate-900 border border-slate-800 rounded-lg p-5" id="pdf-results-card">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Document Scan Summary</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-800/60 rounded p-2.5 border border-slate-700/50">
              <span className="text-[10px] text-slate-400 block uppercase">Pages</span>
              <span className="text-base font-bold text-slate-100" id="pdf-summary-pages">{scanResult.total_pages}</span>
            </div>
            <div className="bg-slate-800/60 rounded p-2.5 border border-slate-700/50">
              <span className="text-[10px] text-slate-400 block uppercase">File Size</span>
              <span className="text-base font-bold text-slate-100">{(scanResult.file_size_bytes / 1024).toFixed(1)} KB</span>
            </div>
            <div className="bg-slate-800/60 rounded p-2.5 border border-slate-700/50">
              <span className="text-[10px] text-slate-400 block uppercase">Sensitive Findings</span>
              <span className="text-base font-bold text-amber-400" id="pdf-summary-findings">{scanResult.findings_count}</span>
            </div>
          </div>

          {scanResult.findings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left" aria-label="Detected document entities">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="pb-2 font-medium">Page</th>
                    <th className="pb-2 font-medium">Category</th>
                    <th className="pb-2 font-medium">Entity Type</th>
                    <th className="pb-2 font-medium">Assigned Placeholder</th>
                    <th className="pb-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody id="pdf-findings-table-body">
                  {scanResult.findings.map((f, i) => (
                    <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="py-1.5 font-mono text-slate-300">Page {f.page + 1}</td>
                      <td className="py-1.5">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{
                            backgroundColor: `${CATEGORY_COLORS[f.category] ?? "#64748b"}22`,
                            color: CATEGORY_COLORS[f.category] ?? "#94a3b8",
                          }}
                        >
                          {f.category}
                        </span>
                      </td>
                      <td className="py-1.5 font-mono text-slate-300">{f.entity_type}</td>
                      <td className="py-1.5 font-mono text-emerald-400">{f.placeholder}</td>
                      <td className="py-1.5 text-slate-400 text-[11px]">{f.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-2">
              No sensitive PII, identifiers, or secrets detected in the document text stream.
            </p>
          )}
        </section>
      )}
    </div>
  );
};
