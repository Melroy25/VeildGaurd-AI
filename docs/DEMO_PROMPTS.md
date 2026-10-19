# VeilGuard demo prompt pack (all data is fictional)

**How to use this pack**
- Every name, number and ID below is **synthetic**. The Aadhaar, GSTIN and card numbers pass their checksums on purpose so VeilGuard's validators fire. The AWS key is AWS's own documented example.
- **I could not run these against your engine.** "Expected" means what the design should do. **Rehearse every prompt once before you record**, write down what actually happened, and keep only the ones that behave well. The small spaCy model can miss names (especially lowercase ones), so do not build your demo around a prompt you have not seen work.
- Use the **company** profile and the **ChatGPT** adapter (the verified one). Before recording: engine running, extension loaded, **Test connection** passes, and add `Project Falcon` and `Kaveri Textiles` to `policies/watchlist.yaml` (for the business report).
- The **web demo** (Vercel) is a rules-only playground. It can show A1 (phone), A3, A4, A5, A9 and A10. It cannot show combinations, medical, or task-aware behavior. Use the extension for those.

---

## Part A: Single prompts that would leak without VeilGuard

**A1. The signature prompt (customer analysis)**
```
Analyze customer Rahul Sharma's account, phone number 9876543210, and transaction history. Identify spending patterns.
```
Expected: decision **redact**; `[CUSTOMER_1]'s` (apostrophe-s kept) and `[PHONE_1]`; task = analyze data; name and phone marked "not needed".
Say: "The AI can still do the analysis. It never learns who the customer is."

**A2. Support chat with a look-alike number (false-alarm test)**
```
Summarize this support chat in 3 bullets.
Customer Priya Nair (priya.nair@examplemail.com, +91 98450 12345) says order #4821937264 arrived damaged. She was refunded Rs. 1,234.50 on 12 Aug 2026.
```
Expected: name, email and phone replaced; **order number, amount and date kept**.
Say: "It protects the person but leaves the order number alone. A keyword filter would flag the order number too."

**A3. KYC check (the exact ID is needed)**
```
Check whether this Aadhaar 3588 1399 8697 and PAN ABCDE1234F look correctly formatted for customer onboarding.
```
Expected: task = verify identifier, so the ID is **needed**. Decision should be **require approval** with a trade-off notice, not a silent removal.
Say: "When the task really needs the number, VeilGuard tells you the trade-off and lets you decide."

**A4. Developer leak (secrets)**
```
My app crashes on startup. Fix the config.
DATABASE_URL=postgres://admin:Sup3rS3cret@db.internal.example.com:5432/prod
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
```
Expected: decision **block**; only Edit and Cancel; no send option.
Say: "Some things should never leave your machine, so there is no 'send anyway'."

**A5. Payment reconciliation (mask, keep the numbers)**
```
Reconcile this payment: card 4111 1111 1111 1111, UPI rohan.d@okaxis, account number 004512369874, IFSC SBIN0001234, amount Rs. 48,000 on 11-Aug-2026. Is the amount unusual for a monthly budget of Rs. 40,000?
```
Expected: card masked to last 4, UPI and account replaced, **amount, date and budget kept**.

**A6. Medical referral**
```
My patient Rohan Deshpande has type 2 diabetes and takes metformin. Draft a short referral letter to an endocrinologist.
```
Expected: `[PATIENT_1]`; the condition and medicine are **kept** because the letter needs them.

**A7. Indirect risk with no direct identifier (the keyword filter misses it)**
```
Draft a performance review for the 34-year-old HR manager at Acme's Pune office who recently went on maternity leave.
```
Expected: re-identification risk high to low; age generalized to "30s", company to `[COMPANY_1]`, event softened; role kept. Keyword filter: **no hits**.
Say: "No name, no phone, no ID, yet one person. This is what 'context-aware' means."

**A8. Indirect risk, second example (try it; keep it only if it fires)**
```
Write a farewell note for the only woman on our Mangaluru data science team, who joined in 2021 and is leaving after her surgery.
```

**A9. Harmless look-alikes (should stay quiet)**
```
Summarize: tracking ID 1234567890123, invoice total Rs. 1,234,567.89, shipped 12 Aug. Albert Einstein once said imagination is more important than knowledge.
```
Expected: **allow**, no review screen.

**A10. Normal prompt (no friction)**
```
Explain compound interest with a simple example.
```
Expected: sent normally. Say: "When nothing is sensitive, VeilGuard stays out of the way."

---

## Part B: Multi-prompt conversations

**B1. Consistent placeholders across turns (works now)**
- Turn 1: `Analyze Rahul Sharma's spending this month: groceries Rs. 4,820, fuel Rs. 3,100, dining Rs. 1,840.`
- Turn 2: `Now compare Rahul Sharma with customer Anita Rao, whose groceries were Rs. 5,200 and fuel Rs. 2,400. Who spends more on fuel?`

Expected: Rahul stays `[CUSTOMER_1]` in turn 2 and Anita becomes `[CUSTOMER_2]`. The AI's two answers stay coherent. Say: "The vault remembers the mapping for this tab, in memory only."

**B2. Safe first message, risky second (works now)**
- Turn 1: `Help me write a polite email to a vendor about a delayed payment.` (allowed, nothing sensitive)
- Turn 2: `The vendor contact is Suresh Kulkarni, 9886001122, suresh@vendorco.example. Pay to account number 000112233445566, IFSC HDFC0000321. Add these details to the email.`

Expected: turn 1 passes untouched; turn 2 triggers the review screen.
Say: "Each message is checked at the moment you send it, not just the first one."

**B3. Pasting in pieces (works now)**
- Turn 1: `Part 1 of the customer file: Name Rohan Deshpande, loan Rs. 25,00,000.`
- Turn 2: `Part 2: Aadhaar 3588 1399 8697, PAN ABCDE1234F.`
- Turn 3: `Part 3: email rohan.deshpande@examplemail.com, phone 9845012345.`

Expected: each piece that holds an ID or contact is reviewed separately; splitting does not slip IDs through.

**B4. Cumulative risk: each message is fine, together they identify someone (NOT built yet)**
- Turn 1: `I'm writing feedback for our HR manager at Acme's Pune office.`
- Turn 2: `She's 34 and recently went on maternity leave. How should I word the review?`

With the current weights, turn 1 scores about 0.61 and turn 2 about 0.50, both below the 0.70 "high" line, while the **combination scores about 0.80**. **The engine scores one message at a time, so today it will not catch this.** Do **not** demo B4 until you implement the feature below. If you have no time, mention it honestly as future work: "VeilGuard scores per message; conversation-level scoring is next."

**Antigravity prompt to add conversation-aware scoring (optional, small)**
```
Add session-aware re-identification scoring. Do not change the frozen benchmark: keep it behind a flag that is OFF in the benchmark harness, so existing results stay valid.

1. Engine: POST /analyze accepts optional session_context: { quasi_types_seen: [enum list, max 20, values from the QUASI_* types only] }. No text, ever. The re-identification score is the noisy-OR over the union of distinct types in the current message and quasi_types_seen. The reducer may only change findings in the current message. If the score stays at or above the target after changing everything allowed, raise the decision to at least require_approval. The response's context.reidentification explains: "Combined with details already shared in this chat: role, employer" (types only). Add policy and API docs.
2. Extension: after each message the user actually sends, the background stores in chrome.storage.session, per tab, the set of quasi types that remained in the SENT text (types generalized or removed do not count). Send it as session_context with the next /analyze. Clear it on tab close and with Clear session vault. Never store text.
3. Tests: pytest for scoring with prior types (the B4 turns: 0.61 and 0.50 individually allow, the second turn together reaches high); privacy tests (session_context and the response contain no text; logs unchanged); Playwright two-turn scenario on the mock site with the real engine (turn 2 shows the review screen with the combined explanation, and the server never receives the original age or leave details); regression: every existing suite stays green; vitest for the store.
4. Docs: STATUS (Implemented only with evidence), LIMITATIONS (it only counts messages sent through VeilGuard in this tab and cannot see earlier chat history), DECISIONS, README. Do not run the test split of the benchmark.
```

---

## Part C: Business report (summarize, calculate, sanitize)

Paste the prompt line first, then the report. This one uses the company profile; with `Project Falcon` on the watchlist expect **require approval** (or block on an untrusted destination).

```
Summarize this quarterly business report in 5 bullets, list the top 3 risks, and recompute the gross margin and EBITDA percentage.

Kaveri Textiles Pvt Ltd: Q2 FY2026-27 Business Report (CONFIDENTIAL)
Prepared by Anita Rao, CFO (anita.rao@kaveritextiles.example, 9886001122). Company GSTIN 29ABCDE1234F1ZW.
Revenue grew from Rs. 1,18,00,000 in Q1 to Rs. 1,33,00,000 in Q2. Regional Q2 revenue: Karnataka Rs. 48,30,000 (62% gross margin), Kerala Rs. 24,70,000 (58%), Tamil Nadu Rs. 37,20,000 (60%), Maharashtra Rs. 22,80,000 (55%). Operating expenses were Rs. 41,50,000.
Project Falcon, our new export line, is on track for a Q4 launch.
Key clients: Sundaram Garments (Rahul Verma, rahul.verma@sundaramgarments.example, 9740011223, billing Rs. 18,50,000), Lotus Retail Chain (Priya Nair, priya.nair@lotusretail.example, 9447022334, Rs. 14,20,000), Metro Uniforms (Imran Sheikh, imran.s@metrouniforms.example, 9890033445, Rs. 11,75,000).
Monthly salaries: Suresh Kulkarni (plant manager) Rs. 1,85,000; Divya Menon (head of sales) Rs. 2,10,000; Arjun Pillai (quality lead) Rs. 1,20,000; Farah Khan (accounts executive) Rs. 85,000.
Collections go to account number 000112233445566, IFSC HDFC0000321.
Risks: Kerala revenue fell 5% while other regions grew; the top three clients bring one third of revenue.
```
Expected: people, emails, phones, GSTIN, account, IFSC and the watchlist names are replaced; **every revenue figure, percentage, salary amount and date is kept**, so the AI can still summarize and recompute.
Check the AI's math against the truth: growth **12.7%**, gross profit **Rs. 79,13,200 (59.5%)**, EBITDA **Rs. 37,63,200 (28.3%)**, top-3 clients **33.4%**.

**Add this line to trigger a block** (use the AWS documented example): `Integration note: AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE`. Expected: **block** until the line is removed.

---

## Part D: PDF tests (two files provided)

Files: `VeilGuard_Test_Loan_Expense_Statement.pdf` (3 pages: customer details, EMI calculation, transactions, totals) and `VeilGuard_Test_Business_Report.pdf` (2 pages: regional revenue, margins, client contacts, salaries, bank details). Both have the personal data **repeated in the page footer**, a **name in the PDF metadata (Author)**, and a **sticky-note annotation containing a phone number**. Those are the places lazy redaction misses.

**Steps (options page, PDF Scanner tab)**
1. Choose a task hint (`analyze data`), scan, read the findings per page and the decision.
2. Redact and download the sanitized PDF. Confirm the verification report says verified.
3. **Leak checks on the sanitized file:** Ctrl+F for each of these (all should find nothing): `Rohan`, `Deshpande`, `98450`, `9845012345`, `rohan.deshpande`, `3588`, `ABCDE1234F`, `004512369874`, `SBIN0001234`, `okaxis`, `Kadri` (loan statement); `Anita`, `9886001122`, `anita.rao`, `29ABCDE1234F1ZW`, `000112233445566`, `HDFC0000321`, `Rahul Verma`, `Priya Nair`, `Imran`, `Suresh`, `Divya`, `Arjun`, `Farah`, `Kaveri`, `Falcon` (business report). Then select all, copy, paste into Notepad and search again. Then check File > Properties for the Author field and look for the sticky note.
4. **Utility check:** all amounts, dates, tables and totals must still be there.
5. **Contrast demo:** give the AI the sanitized PDF and ask the questions below. Then ask `What is the customer's phone number and Aadhaar?`: it cannot answer, because it never received them.

**Questions that prove the calculations still work**
- Loan statement: `Recalculate the EMI and total interest, which category is the biggest spend, and why is August so high?` Truth: EMI **Rs. 21,696**; total interest **Rs. 27,06,939**; Shopping **Rs. 54,500 (47.9%)**; August **Rs. 64,164** because of the Rs. 48,000 jewellery purchase (42.2% of all spending); monthly totals Jul 27,543, Aug 64,164, Sep 22,019 (total Rs. 1,13,726).
- Business report: `Verify the growth, margin and EBITDA, and which region needs attention?` Truth: growth **12.7%**, gross margin **59.5%**, EBITDA **28.3%**, Kerala **-5.0%**.

**Known limits (say them, do not hide them):** text-based PDFs only; no OCR; a value split across two lines may be missed (check with Ctrl+F); verification checks extractable text, not pixels.

---

## Part E: Suggested order for the 3:50 video

| Time | Show | Prompt |
|---|---|---|
| 0:00 | The problem and the keyword miss | A7 on the slide, then explain |
| 0:30 | Core flow on ChatGPT | A1: review screen, original vs safer, send sanitized |
| 1:15 | Proof | Mock site `/__test/received` shows only sanitized text |
| 1:40 | Task needs the ID, secrets | A3 (approval trade-off) and A4 (block) |
| 2:10 | Business report | Part C, then the AI's math vs the truth |
| 2:50 | PDF | Loan statement: scan, redact, Ctrl+F, ask the questions |
| 3:25 | Desktop sidebar, dashboard, limits | 20 seconds each, then one sentence of honest limits |

Record backup clips of every scene so one failure never ruins the video.
