import { type ChangeEvent, type DragEvent, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  ArrowDownToLine, ArrowRight, Check, CheckCircle2, ChevronDown, CircleAlert,
  ClipboardList, FileCheck2, FileDown, FileText, Fingerprint, HelpCircle,
  LockKeyhole, Search, ShieldCheck, Sparkles, Upload, X,
} from 'lucide-react';
import {
  compareRows,
  parseAmount,
  type AmountStatus,
  type IssueCategory,
  type RecordRow,
  type ResultRow,
  type ResultType,
  type Side,
  type UploadData,
} from './comparison';

const queryClient = new QueryClient();
const REQUIRED_HEADERS = ['invoice_number', 'customer_name', 'invoice_date', 'total_amount'] as const;

const DEMO_A = `invoice_number,customer_name,invoice_date,total_amount
INV-1001,Juniper & Slate Studio,2025-04-01,2000.00
INV-1002,Northline Workshop,2025-04-02,1500.00
INV-1003,"Morrow, Hale & Co.",2025-04-03,725.00
INV-1004,Harborlight Press,2025-04-04,960.00
INV-1004,Harborlight Press,2025-04-05,960.00
INV-1005,Fieldwork Design Office,2025-04-06,412.80
`;
const DEMO_B = `invoice_number,customer_name,invoice_date,total_amount
INV-1001,Juniper & Slate Studio,2025-04-01,2000.00
INV-1002,Northline Workshop,2025-04-02,1450.00
INV-1004,Harborlight Press,2025-04-07,960.00
INV-1006,Redwood Letterpress,2025-04-08,1180.25`;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else cell += char;
    } else if (closedQuote && (char === ' ' || char === '\t')) {
      continue;
    } else if (closedQuote && char === ',') {
      row.push(cell); cell = ''; closedQuote = false;
    } else if (closedQuote && (char === '\n' || char === '\r')) {
      row.push(cell); cell = ''; closedQuote = false;
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      if (char === '\r' && source[i + 1] === '\n') i += 1;
    } else if (closedQuote) {
      throw new Error(`Unexpected character after a quoted field at character ${i + 1}. Use a comma or line break after the closing quote.`);
    } else if (char === '"') {
      if (cell.length) throw new Error(`Unexpected quote at character ${i + 1}. Check that fields containing quotes are enclosed in quotes.`);
      quoted = true;
    } else if (char === ',') {
      row.push(cell); cell = '';
    } else if (char === '\n' || char === '\r') {
      row.push(cell); cell = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      if (char === '\r' && source[i + 1] === '\n') i += 1;
    } else cell += char;
  }
  if (quoted) throw new Error('A quoted field was never closed. Check for an unmatched double quote.');
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  if (!rows.length) throw new Error('The file is empty. Choose a CSV with a header row and invoice data.');
  return rows;
}

function parseFile(text: string): RecordRow[] {
  const parsed = parseCsv(text);
  const headers = parsed[0].map((header) => header.trim().toLowerCase());
  const absent = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (absent.length) throw new Error(`Missing required column${absent.length > 1 ? 's' : ''}: ${absent.join(', ')}. Add these exact headers to the first row, then try again.`);
  const positions = Object.fromEntries(REQUIRED_HEADERS.map((header) => [header, headers.indexOf(header)])) as Record<typeof REQUIRED_HEADERS[number], number>;
  return parsed.slice(1).map((cells, index) => {
    const number = (cells[positions.invoice_number] ?? '').trim();
    const customer = (cells[positions.customer_name] ?? '').trim();
    const date = (cells[positions.invoice_date] ?? '').trim();
    const amountText = cells[positions.total_amount] ?? '';
    const cents = parseAmount(amountText);
    const amountStatus: AmountStatus = !amountText.trim() ? 'blank' : cents === null ? 'invalid' : 'valid';
    const issues: string[] = [];
    if (cells.length !== parsed[0].length) issues.push(`This row has ${cells.length} fields, but the header defines ${parsed[0].length} columns. Check the CSV row.`);
    if (!number) issues.push('Invoice number is missing, so this record cannot be matched reliably.');
    if (!customer) issues.push('Customer name is missing. Confirm the source record.');
    if (amountStatus === 'blank') issues.push('The total_amount value is blank. Enter or verify a numeric amount before relying on the comparison.');
    if (amountStatus === 'invalid') issues.push(`The total_amount value "${amountText}" is not a valid numeric or supported currency amount. Correct or verify it before relying on the comparison.`);
    return { number, key: number.toLowerCase(), customer, date, amountText, amountStatus, cents, issues, sourceIndex: index + 2 };
  });
}

function formatMoney(cents: number | null): string {
  if (cents === null) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}
function csvCell(value: string): string { return `"${value.replace(/"/g, '""')}"`; }
function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}
function explanationWithoutComparisonSummary(explanation: string): string {
  return explanation.replace(/^Invoice number: [^.]+\. Amount: [^.]+\. Customer name: [^.]+\.\s*/, '');
}
function downloadFile(name: string, contents: string, contentType = 'text/csv;charset=utf-8') {
  const blob = new Blob([contents], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}
function demoDownload(side: Side) {
  downloadFile(side === 'A' ? 'syncproof-fictional-business-invoices.csv' : 'syncproof-fictional-accounting-invoices.csv', side === 'A' ? DEMO_A : DEMO_B);
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Home() {
  const [files, setFiles] = useState<{ A: UploadData | null; B: UploadData | null }>({ A: null, B: null });
  const [errors, setErrors] = useState<{ A: string; B: string }>({ A: '', B: '' });
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All results');
  const [dragging, setDragging] = useState<Side | null>(null);

  const processFile = async (side: Side, file?: File) => {
    if (!file) return;
    setErrors((old) => ({ ...old, [side]: '' }));
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      setFiles((old) => ({ ...old, [side]: null }));
      setResults(null);
      setErrors((old) => ({ ...old, [side]: 'Choose a .csv file. Spreadsheet workbooks such as .xlsx are not supported.' }));
      return;
    }
    try {
      const rows = parseFile(await file.text());
      if (!rows.length) throw new Error('The header row is readable, but there are no invoice records below it.');
      setFiles((old) => ({ ...old, [side]: { fileName: file.name, rows, count: rows.length } }));
      setResults(null);
      setSearch('');
    } catch (error) {
      setFiles((old) => ({ ...old, [side]: null }));
      setResults(null);
      setErrors((old) => ({ ...old, [side]: error instanceof Error ? error.message : 'Could not read this file. Save it as a UTF-8 CSV and try again.' }));
    }
  };
  const handleChange = (side: Side) => (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    void processFile(side, input.files?.[0]).finally(() => { input.value = ''; });
  };
  const handleDrop = (side: Side) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(null); void processFile(side, event.dataTransfer.files?.[0]);
  };
  const runComparison = () => {
    if (!files.A || !files.B) return;
    setLoading(true);
    window.setTimeout(() => { setResults(compareRows(files.A!, files.B!)); setLoading(false); }, 220);
  };
  const visibleResults = useMemo(() => {
    if (!results) return [];
    return results.filter((row) => {
      const matchesFilter = filter === 'All results'
        || (filter === 'Flagged for review' ? row.type !== 'Matched' : filter === 'Customer name differs' ? row.customerNameDifferent : row.type === filter);
      const term = search.trim().toLowerCase();
      return matchesFilter && (!term || `${row.number} ${row.customer} ${row.a?.customer ?? ''} ${row.b?.customer ?? ''} ${row.explanation} ${row.type}`.toLowerCase().includes(term));
    });
  }, [results, filter, search]);
  const groupedResults = useMemo(() => {
    const groups = new Map<string, ResultRow[]>();
    (results ?? []).forEach((row) => groups.set(row.issueId, [...(groups.get(row.issueId) ?? []), row]));
    return Array.from(groups, ([issueId, rows]) => ({ issueId, rows }));
  }, [results]);
  const counts = useMemo(() => {
    const flaggedGroups = groupedResults.filter(({ rows }) => rows.some((row) => row.type !== 'Matched'));
    const affectedSourceRows = new Set<string>();
    flaggedGroups.forEach(({ rows }) => rows.forEach((row) => {
      if (row.a) affectedSourceRows.add(`A:${row.a.sourceIndex}`);
      if (row.b) affectedSourceRows.add(`B:${row.b.sourceIndex}`);
    }));
    return {
      uniqueIssues: flaggedGroups.length,
      affectedSourceRows: affectedSourceRows.size,
      matched: groupedResults.filter(({ rows }) => rows[0]?.category === 'matched').length,
      amountDifferences: groupedResults.filter(({ rows }) => rows[0]?.category === 'amount-difference').length,
      customerNameDifferences: groupedResults.filter(({ rows }) => rows.some((row) => row.customerNameDifferent)).length,
      missingRecords: groupedResults.filter(({ rows }) => rows[0]?.category === 'missing').length,
      duplicateInvoices: groupedResults.filter(({ rows }) => rows[0]?.category === 'duplicate').length,
      needsReview: groupedResults.filter(({ rows }) => rows.some((row) =>
        row.category === 'review' || row.additionalCategories.includes('review'),
      )).length,
      flaggedRows: (results ?? []).filter((row) => row.type !== 'Matched').length,
      fileARecords: files.A?.count ?? 0,
      fileBRecords: files.B?.count ?? 0,
    };
  }, [groupedResults, results, files]);
  const amountCell = (record: RecordRow | null): ReactNode => {
    if (!record) return <span className="empty-value">Not found</span>;
    if (record.amountStatus === 'blank') return <span className="invalid-amount-value">Blank amount</span>;
    if (record.amountStatus === 'invalid') {
      return <span className="invalid-amount-value" title="Original total_amount value">{`Invalid: ${record.amountText}`}</span>;
    }
    return formatMoney(record.cents);
  };
  const exportReport = () => {
    if (!results) return;
    const cols = ['invoice_number', 'customer_name', 'file_a_amount', 'file_b_amount', 'discrepancy_type', 'human_review_note', 'file_a_source_row', 'file_b_source_row', 'file_a_invoice_date_context', 'file_b_invoice_date_context'];
    const flagged = results.filter((row) => row.type !== 'Matched');
    const amountForCsv = (record: RecordRow | null) => {
      if (!record) return '';
      if (record.amountStatus !== 'valid') return record.amountText;
      return record.cents === null ? '' : (record.cents / 100).toFixed(2);
    };
    const lines = flagged.map((row) => [
      row.number, row.customerNameDifferent && row.a && row.b ? `File A: ${row.a.customer}; File B: ${row.b.customer}` : row.customer, amountForCsv(row.a), amountForCsv(row.b),
      row.type, row.explanation, row.a ? String(row.a.sourceIndex) : '', row.b ? String(row.b.sourceIndex) : '', row.dateA, row.dateB,
    ].map((value) => csvCell(value)).join(','));
    downloadFile('syncproof-discrepancy-review.csv', [cols.join(','), ...lines].join('\r\n'));
  };
  const downloadSimpleReport = () => {
    if (!results) return;
    const uniqueRecords = (rows: ResultRow[], side: 'a' | 'b') => {
      const records = new Map<number, RecordRow>();
      rows.forEach((row) => { const record = row[side]; if (record) records.set(record.sourceIndex, record); });
      return Array.from(records.values());
    };
    const reportMoney = (cents: number | null | undefined) => cents === null || cents === undefined ? 'Not provided or unreadable' : `$${formatMoney(cents)}`;
    const reportAmount = (record: RecordRow) => {
      if (record.amountStatus === 'blank') return 'Blank total_amount';
      if (record.amountStatus === 'invalid') return `Invalid original value: "${record.amountText}"`;
      return reportMoney(record.cents);
    };
    const recordsMoney = (records: RecordRow[]) => records.length ? records.map(reportAmount).join('; ') : '—';
    const customerNames = (aRecords: RecordRow[], bRecords: RecordRow[], fallback: string) =>
      Array.from(new Set([...aRecords, ...bRecords].map((record) => record.customer).filter(Boolean))).join(' / ') || fallback || 'Customer not provided';
    const reportGroups = groupedResults.map(({ issueId, rows }) => ({ issueId, rows, result: rows[0] })).filter((group) => group.result);
    const hasCategory = (rows: ResultRow[], category: IssueCategory) => rows.some((row) =>
      row.category === category || row.additionalCategories.includes(category),
    );
    const amountDifferenceGroups = reportGroups.filter(({ rows }) => hasCategory(rows, 'amount-difference'));
    const customerNameDifferenceGroups = reportGroups.filter(({ rows }) => rows.some((row) => row.customerNameDifferent));
    const missingGroups = reportGroups.filter(({ rows }) => hasCategory(rows, 'missing'));
    const duplicateGroups = reportGroups.filter(({ rows }) => hasCategory(rows, 'duplicate'));
    const matchedGroups = reportGroups.filter(({ result }) => result?.category === 'matched');
    const reviewGroups = reportGroups.filter(({ rows }) => hasCategory(rows, 'review'));

    const renderTable = (headers: string[], rows: string[][], emptyMessage: string) => `
      <div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${htmlEscape(header)}</th>`).join('')}</tr></thead>
      <tbody>${rows.length
        ? rows.map((row) => {
          const primaryCells = row.slice(0, headers.length);
          const detailCells = row.slice(headers.length);
          const detailLabels = ['What this means', 'Recommended next step'];
          const details = detailCells.map((cell, index) => `<div class="detail-note"><strong>${htmlEscape(detailLabels[index] ?? 'Additional details')}</strong><span>${htmlEscape(cell)}</span></div>`).join('');
          return `<tr>${primaryCells.map((cell) => `<td>${htmlEscape(cell)}</td>`).join('')}</tr>${details ? `<tr class="detail-row"><td colspan="${headers.length}"><div class="detail-grid">${details}</div></td></tr>` : ''}`;
        }).join('')
        : `<tr><td class="empty-cell" colspan="${headers.length}">${htmlEscape(emptyMessage)}</td></tr>`}
      </tbody></table></div>`;
    const renderSection = (title: string, description: string, headers: string[], rows: string[][], emptyMessage: string) => `
      <section class="report-section">
        <div class="section-heading"><div><p class="eyebrow">INVOICE DETAILS</p><h2>${htmlEscape(title)}</h2><p class="section-description">${htmlEscape(description)}</p></div><span class="section-count">${rows.length}</span></div>
        ${renderTable(headers, rows, emptyMessage)}
      </section>`;

    const amountDifferenceRows = amountDifferenceGroups.map(({ rows }) => {
      const row = rows[0];
      const a = uniqueRecords(rows, 'a')[0] ?? row.a;
      const b = uniqueRecords(rows, 'b')[0] ?? row.b;
      const difference = a?.cents !== null && a?.cents !== undefined && b?.cents !== null && b?.cents !== undefined
        ? Math.abs(a.cents - b.cents) : null;
      const direction = a?.cents !== null && a?.cents !== undefined && b?.cents !== null && b?.cents !== undefined
        ? (a.cents > b.cents ? 'File A is higher' : 'File B is higher') : 'Compare the source amounts';
      return [
        row.number || 'Invoice number unavailable',
        customerNames(a ? [a] : [], b ? [b] : [], row.customer),
        reportMoney(a?.cents),
        reportMoney(b?.cents),
        reportMoney(difference),
        `The two files show different amounts. ${direction}. This difference alone does not confirm an error.`,
        'Compare the original invoice with both source records. Ask the responsible person to confirm the correct amount before making any changes.',
      ];
    });
    const customerNameDifferenceRows = customerNameDifferenceGroups.map(({ rows }) => {
      const row = rows[0];
      const a = uniqueRecords(rows, 'a')[0] ?? row.a;
      const b = uniqueRecords(rows, 'b')[0] ?? row.b;
      return [
        row.number || 'Invoice number unavailable',
        a?.customer || 'Customer name not provided',
        b?.customer || 'Customer name not provided',
        row.comparison.invoiceNumber,
        row.comparison.amount,
        row.comparison.customerName,
        explanationWithoutComparisonSummary(row.explanation),
        'Check the original invoice or customer records with the responsible person. Confirm whether both names refer to the same customer; do not assume either entry is wrong.',
      ];
    });
    const missingRows = missingGroups.map(({ rows }) => {
      const row = rows[0];
      const record = row.a ?? row.b;
      const foundIn = row.a ? 'File A' : 'File B';
      const missingFrom = row.a ? 'File B' : 'File A';
      return [
        row.number || 'Invoice number unavailable',
        record?.customer || row.customer || 'Customer not provided',
        foundIn,
        reportMoney(record?.cents),
        `This invoice appears in ${foundIn}, but no corresponding invoice number appears in ${missingFrom}.`,
        `Check that both files cover the same dates and filters. Then check the original records to confirm whether this invoice should appear in ${missingFrom}.`,
      ];
    });
    const duplicateRows = duplicateGroups.map(({ rows }) => {
      const row = rows[0];
      const aRecords = uniqueRecords(rows, 'a');
      const bRecords = uniqueRecords(rows, 'b');
      const aCount = aRecords.length;
      const bCount = bRecords.length;
      return [
        row.number || 'Invoice number unavailable',
        customerNames(aRecords, bRecords, row.customer),
        `File A: ${aCount} record${aCount === 1 ? '' : 's'} · File B: ${bCount} record${bCount === 1 ? '' : 's'}`,
        `File A contains ${aCount} record${aCount === 1 ? '' : 's'} with this invoice number, while File B contains ${bCount}. SyncProof did not automatically match these records because duplicates make the pairing uncertain. A person needs to decide whether the repeated entry is legitimate.`,
        'Review each source row against the original invoice and confirm whether the repeated entry is legitimate. Do not assume the records are correct just because their amounts agree.',
      ];
    });
    const matchedRows = matchedGroups.map(({ rows }) => {
      const row = rows[0];
      const a = uniqueRecords(rows, 'a')[0] ?? row.a;
      const b = uniqueRecords(rows, 'b')[0] ?? row.b;
      return [
        row.number || 'Invoice number unavailable',
        customerNames(a ? [a] : [], b ? [b] : [], row.customer),
        reportMoney(a?.cents),
        reportMoney(b?.cents),
        'Invoice number, amount, and customer name agree. Invoice dates were not compared.',
      ];
    });
    const reviewRows = reviewGroups.map(({ rows }) => {
      const row = rows[0];
      const aRecords = uniqueRecords(rows, 'a');
      const bRecords = uniqueRecords(rows, 'b');
      const sourceDescription = [
        aRecords.length ? `File A: ${recordsMoney(aRecords)}` : '',
        bRecords.length ? `File B: ${recordsMoney(bRecords)}` : '',
      ].filter(Boolean).join(' · ') || 'Amount not available';
      return [
        row.number || 'Not provided',
        customerNames(aRecords, bRecords, row.customer),
        sourceDescription,
        rows.map((item) => item.explanation).filter(Boolean).join(' '),
        'Check the original source row and confirm the missing or invalid details with the responsible person before correcting any records.',
      ];
    });
    const summaryCards = [
      ['Unique invoice issues', counts.uniqueIssues, 'Distinct invoice numbers flagged'],
      ['Successfully matched', counts.matched, 'Invoice number, amount, and customer name agree'],
      ['Amount differences', counts.amountDifferences, 'Amounts differ between files'],
      ['Customer name differences', counts.customerNameDifferences, 'Review names for the same invoice'],
      ['Missing invoices', counts.missingRecords, 'Found in only one file'],
      ['Duplicate invoices', counts.duplicateInvoices, 'Repeated invoice numbers'],
      ['Other records requiring review', counts.needsReview, 'Could not be compared reliably'],
    ];
    const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const reportHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SyncProof — Invoice Comparison Report</title>
  <style>
    :root{color-scheme:light;--ink:#233630;--muted:#687870;--line:#e2e8e3;--paper:#fff;--canvas:#f4f6f2;--green:#28765e;--pale:#e8f2eb;--amber:#a86625}
    *{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:15px/1.55 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .page{max-width:1120px;margin:0 auto;padding:42px 28px 64px}.masthead{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:1px solid var(--line);padding-bottom:22px}
    .brand{display:flex;align-items:center;gap:12px;font-weight:750;letter-spacing:-.03em;font-size:21px}.brand-mark{width:36px;height:36px;border-radius:11px;background:var(--green);color:#fff;display:grid;place-items:center;font-size:17px}
    .report-meta{text-align:right;color:var(--muted);font-size:12px}.report-meta strong{display:block;color:var(--ink);font-size:13px;font-weight:650}
    .hero{padding:34px 0 26px}.eyebrow{margin:0 0 7px;color:var(--green);font-size:10px;font-weight:750;letter-spacing:.14em}.hero h1{margin:0;font-size:clamp(28px,4vw,38px);line-height:1.14;letter-spacing:-.045em}.hero .lede{max-width:720px;margin:11px 0 0;color:var(--muted);font-size:15px}
    .file-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:4px 0 18px}.file-card,.summary-panel,.report-section,.disclaimer{background:var(--paper);border:1px solid var(--line);border-radius:14px}
    .file-card{padding:18px 20px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.file-label{display:block;color:var(--muted);font-size:10px;letter-spacing:.12em;font-weight:750}.file-name{margin:5px 0 0;font-weight:650;overflow-wrap:anywhere}.record-count{white-space:nowrap;color:var(--green);font-weight:750;font-size:18px}.record-count small{display:block;color:var(--muted);font-size:10px;font-weight:550;text-align:right}
    .summary-panel{padding:20px;margin-bottom:26px}.panel-title{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:16px}.panel-title h2{margin:0;font-size:17px;letter-spacing:-.02em}.panel-title span{color:var(--muted);font-size:12px}
    .summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.summary-item{padding:13px 14px;border-radius:10px;background:#f7f9f6;min-height:85px}.summary-item strong{display:block;color:var(--green);font-size:24px;line-height:1.1}.summary-item span{display:block;margin-top:6px;font-size:11px;font-weight:650}.summary-item small{display:block;color:var(--muted);font-size:10px;margin-top:2px}
    .count-note{margin:15px 0 0;color:var(--muted);font-size:11px}.report-section{padding:22px;margin:18px 0}.section-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:14px}.section-heading h2{margin:0;font-size:19px;letter-spacing:-.025em}.section-description{margin:5px 0 0;color:var(--muted);font-size:12px}.section-count{min-width:32px;height:32px;display:grid;place-items:center;border-radius:9px;background:var(--pale);color:var(--green);font-size:13px;font-weight:750}
    .table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:12px;min-width:600px}th{text-align:left;color:var(--muted);font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:750;padding:10px 11px;border-bottom:1px solid var(--line);white-space:nowrap}td{vertical-align:top;padding:12px 11px;border-bottom:1px solid #edf0ed;max-width:320px;overflow-wrap:anywhere}tbody tr:last-child td{border-bottom:0}.empty-cell{color:var(--muted);padding:16px 11px}.detail-row td{max-width:none;background:#f8faf7;padding:10px 13px 13px;border-bottom:1px solid var(--line)}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 24px}.detail-note strong{display:block;color:var(--green);font-size:9px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}.detail-note span{display:block;color:#46574f;font-size:11px;line-height:1.5}
    .disclaimer{padding:17px 19px;border-left:4px solid var(--amber);margin-top:23px}.disclaimer strong{display:block;font-size:12px;margin-bottom:4px}.disclaimer p{margin:0;color:var(--muted);font-size:11px}.footer{padding-top:20px;color:var(--muted);font-size:10px;text-align:center}
    @media(max-width:700px){.page{padding:24px 15px 38px}.masthead{align-items:flex-start}.report-meta{font-size:10px}.brand{font-size:19px}.file-summary{grid-template-columns:1fr}.file-card{padding:15px}.summary-panel{padding:16px}.summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.report-section{padding:16px;margin:14px 0}.panel-title{align-items:flex-start;flex-direction:column;gap:3px}.detail-grid{grid-template-columns:1fr;gap:8px}}
    @media print{body{background:#fff}.page{max-width:none;padding:0}.file-card,.summary-panel,.report-section,.disclaimer{break-inside:avoid;box-shadow:none}.report-section{break-inside:auto}.table-wrap{overflow:visible}table{min-width:0;font-size:9px}th,td{padding:7px}.section-heading{break-after:avoid}.footer{padding-bottom:10px}}
  </style>
</head>
<body>
  <main class="page">
    <header class="masthead">
      <div class="brand"><span class="brand-mark" aria-hidden="true">S</span><span>SyncProof</span></div>
      <div class="report-meta"><strong>Invoice Comparison Report</strong>Prepared ${htmlEscape(generatedAt)}</div>
    </header>
    <section class="hero"><p class="eyebrow">FINANCIAL RECORD REVIEW</p><h1>Invoice comparison</h1><p class="lede">A clear summary of how the two invoice exports compare. Flagged items are signals for a person to review, not a verdict on either set of records.</p></section>
    <section class="file-summary" aria-label="Compared files">
      <article class="file-card"><div><span class="file-label">FILE A · BUSINESS MANAGEMENT</span><p class="file-name">${htmlEscape(files.A?.fileName ?? 'File A')}</p></div><div class="record-count">${counts.fileARecords}<small>records compared</small></div></article>
      <article class="file-card"><div><span class="file-label">FILE B · ACCOUNTING</span><p class="file-name">${htmlEscape(files.B?.fileName ?? 'File B')}</p></div><div class="record-count">${counts.fileBRecords}<small>records compared</small></div></article>
    </section>
    <section class="summary-panel" aria-label="Comparison summary">
      <div class="panel-title"><h2>At a glance</h2><span>${counts.uniqueIssues} unique invoice issue${counts.uniqueIssues === 1 ? '' : 's'}</span></div>
      <div class="summary-grid">${summaryCards.map(([label, count, detail]) => `<div class="summary-item"><strong>${count}</strong><span>${htmlEscape(String(label))}</span><small>${htmlEscape(String(detail))}</small></div>`).join('')}</div>
      <p class="count-note">${counts.affectedSourceRows} affected source rows across both files. Category totals may overlap; each invoice issue is counted once in the unique-issue total.</p>
    </section>
    ${renderSection('Amount differences', 'The invoice number appears in both files, but the amounts do not agree.', ['Invoice number', 'Customer', 'File A amount', 'File B amount', 'Difference'], amountDifferenceRows, 'No amount differences were found.')}
    ${renderSection('Customer name differences', 'Invoice numbers identify a potential pair, then customer names are checked against one another.', ['Invoice number', 'File A customer', 'File B customer', 'Invoice number', 'Amount', 'Customer name'], customerNameDifferenceRows, 'No customer name differences were found.')}
    ${renderSection('Missing invoices', 'These invoice numbers were found in one file, but not the other.', ['Invoice number', 'Customer', 'Found in', 'Amount'], missingRows, 'No missing invoices were found.')}
    ${renderSection('Duplicate invoices', 'Repeated invoice numbers are not automatically paired.', ['Invoice number', 'Customer', 'Records in each file'], duplicateRows, 'No duplicate invoice numbers were found.')}
    ${renderSection('Successfully matched invoices', 'Invoice number, amount, and customer name agree in both files. Dates are shown as context only and are not compared.', ['Invoice number', 'Customer', 'File A amount', 'File B amount', 'Result'], matchedRows, 'No invoices matched in both files.')}
    ${renderSection('Other records requiring review', 'These records could not be compared reliably because identifying information or an amount needs attention.', ['Invoice number', 'Customer', 'Amounts provided'], reviewRows, 'No other records require investigation.')}
    <aside class="disclaimer"><strong>Important: human review is required</strong><p>SyncProof identifies differences for investigation. A flagged item does not by itself confirm an error, financial loss, or fraud. The source CSVs do not include currency metadata; dollar signs are used here for readability, so confirm the currency against the original exports.</p></aside>
    <footer class="footer">Generated locally by SyncProof · Uploaded files are compared in this application and are not sent to external services.</footer>
  </main>
</body>
</html>`;
    downloadFile('syncproof-simple-report.html', reportHtml, 'text/html;charset=utf-8');
  };
  const loadDemo = async () => {
    const a = new File([DEMO_A], 'fictional-business-invoices.csv', { type: 'text/csv' });
    const b = new File([DEMO_B], 'fictional-accounting-invoices.csv', { type: 'text/csv' });
    await processFile('A', a); await processFile('B', b);
  };
  const reset = () => {
    setFiles({ A: null, B: null }); setResults(null); setErrors({ A: '', B: '' }); setSearch(''); setFilter('All results');
  };

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-lockup"><span className="brand-mark"><Fingerprint size={21} strokeWidth={1.8} /></span><span className="display brand-name">syncproof<span className="brand-period">.</span></span></div>
        <div className="sidebar-rule" />
        <div className="nav-caption">WORKSPACE</div>
        <a className="nav-item nav-active" href="#workspace" data-testid="link-workspace"><ClipboardList size={17} /><span>Invoice review</span><span className="nav-count">01</span></a>
        <div className="sidebar-note">
          <div className="sidebar-note-icon"><LockKeyhole size={15} /></div>
          <div><strong>Private by design</strong><p>Your files stay in this browser. Nothing is uploaded.</p></div>
        </div>
        <div className="sidebar-bottom"><div className="sidebar-rule" /><div className="sidebar-version">SYNCProof <span>·</span> Browser tool</div><div className="sidebar-bottom-caption">No connections. No credentials. Just a careful comparison.</div></div>
      </aside>

      <main className="main-content" id="workspace">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>Invoice review</strong></div>
          <div className="local-badge"><span className="local-dot" />LOCAL SESSION</div>
        </header>
        <div className="content-wrap page-enter">
          <section className="intro">
            <div className="intro-copy">
              <div className="eyebrow"><span className="eyebrow-line" />RECONCILIATION WORKSPACE</div>
              <h1 className="display">A clearer view<br /><span>of what changed.</span></h1>
              <p className="intro-description">Compare invoice exports side by side. Find records that deserve a second look—without connecting a single system.</p>
            </div>
            <div className="intro-stamp"><div className="stamp-icon"><ShieldCheck size={23} strokeWidth={1.6} /></div><div className="stamp-title">Private comparison</div><div className="stamp-caption">Processed on this device</div><div className="stamp-divider" /><div className="stamp-meta"><span>IDENTITY</span><span>INVOICE NUMBER</span></div></div>
          </section>

          <section className="upload-section" aria-labelledby="upload-heading">
            <div className="section-heading">
              <div className="section-index">01</div><div><h2 id="upload-heading" className="display">Bring your two exports</h2><p>CSV files with the same four identifying columns.</p></div>
              <button className="text-button demo-button" onClick={loadDemo} data-testid="button-load-demo"><Sparkles size={14} />Try fictional sample</button>
            </div>
            <div className="upload-grid">
              {(['A', 'B'] as Side[]).map((side) => {
                const isReady = Boolean(files[side]);
                return <div key={side} className={`file-card ${isReady ? 'file-card-ready' : ''}`}>
                  <input id={`syncproof-file-${side.toLowerCase()}`} type="file" accept=".csv,text/csv" className="file-input-hidden" onChange={handleChange(side)} data-testid={`input-file-${side.toLowerCase()}`} />
                  <div className="file-card-top"><span className={`file-letter file-letter-${side.toLowerCase()}`}>{side}</span><div><div className="file-source">{side === 'A' ? 'BUSINESS MANAGEMENT' : 'ACCOUNTING'}</div><h3>{side === 'A' ? 'File A' : 'File B'} <span>{side === 'A' ? 'Invoice export' : 'Invoice export'}</span></h3></div><button className="demo-download" onClick={() => demoDownload(side)} aria-label={`Download fictional File ${side} example`} data-testid={`button-download-sample-${side.toLowerCase()}`}><ArrowDownToLine size={15} /><span>Sample CSV</span></button></div>
                  <div className={`drop-zone ${dragging === side ? 'drop-zone-active' : ''} ${isReady ? 'drop-zone-loaded' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(side); }} onDragLeave={() => setDragging(null)} onDrop={handleDrop(side)} data-testid={`dropzone-file-${side.toLowerCase()}`}>
                    <label htmlFor={`syncproof-file-${side.toLowerCase()}`} className="drop-zone-label">
                      {isReady ? <><div className="drop-icon loaded-icon"><Check size={18} /></div><div className="drop-copy"><strong data-testid={`status-file-${side.toLowerCase()}`}>{files[side]?.fileName}</strong><span>{files[side]?.count} invoice {files[side]?.count === 1 ? 'record' : 'records'} · Valid CSV structure</span></div><span className="drop-arrow"><ArrowRight size={15} /></span></> : <><div className="drop-icon"><Upload size={17} /></div><div className="drop-copy"><strong>Drop your CSV here <span>or <u>browse files</u></span></strong><span>Comma-separated values · .csv only</span></div><div className="drop-arrow"><ArrowRight size={15} /></div></>}
                    </label>
                    {isReady && <button type="button" className="remove-file" onClick={() => { setFiles((old) => ({ ...old, [side]: null })); setResults(null); }} aria-label={`Remove File ${side}`} data-testid={`button-remove-file-${side.toLowerCase()}`}><X size={16} /></button>}
                  </div>
                  {errors[side] && <div className="upload-error" role="alert" data-testid={`error-file-${side.toLowerCase()}`}><CircleAlert size={15} /><span>{errors[side]}</span></div>}
                  <div className="column-hint"><span className="hint-label">REQUIRED COLUMNS</span><span className="mono">invoice_number · customer_name · invoice_date · total_amount</span></div>
                </div>;
              })}
            </div>
            <div className="compare-row">
              <div className="compare-guidance">
                <div className="privacy-inline"><LockKeyhole size={14} /><span>Files are read and compared locally. No data leaves this browser.</span></div>
                {files.A && !files.B && <div className="upload-next-step" role="status"><Check size={13} />File A is loaded. Choose File B to continue.</div>}
                {files.A && files.B && <div className="upload-next-step" role="status"><Check size={13} />Both files are ready. You can compare them now.</div>}
              </div>
              <button className="primary-button" onClick={runComparison} disabled={!files.A || !files.B || loading} data-testid="button-run-comparison">{loading ? <span className="button-skeleton" /> : <><span>Compare invoices</span><ArrowRight size={16} /></>}</button>
            </div>
          </section>

          {results && <section className="results-section" aria-labelledby="results-heading" data-testid="section-results">
            <div className="results-topline">
              <div className="section-heading results-title"><div className="section-index">02</div><div><h2 id="results-heading" className="display">Review the differences</h2><p>Signals for human review—not a verdict on either set of books.</p></div></div>
              <div className="report-actions">
                <button className="outline-button export-button simple-report-button" onClick={downloadSimpleReport} data-testid="button-download-simple-report"><FileText size={16} /><span>Download Simple Report</span></button>
                <button className="outline-button export-button" onClick={exportReport} disabled={counts.flaggedRows === 0} data-testid="button-export-report"><FileDown size={16} /><span>Export Review CSV</span></button>
              </div>
            </div>
            <div className="summary-overview">
              <div className="overview-stat">
                <span className="summary-label">UNIQUE INVOICE ISSUES</span>
                <strong data-testid="value-unique-issues">{counts.uniqueIssues}</strong>
                <span className="summary-foot">distinct invoice numbers flagged</span>
              </div>
              <div className="overview-stat">
                <span className="summary-label">AFFECTED SOURCE ROWS</span>
                <strong data-testid="value-affected-source-rows">{counts.affectedSourceRows}</strong>
                <span className="summary-foot">individual rows across both files</span>
              </div>
              <div className="overview-note"><FileCheck2 size={18} /><span>Each invoice issue is counted once. Category counts may overlap when an invoice has more than one difference. Customer-name differences and duplicates need human review.</span></div>
            </div>
            <div className="summary-strip" data-testid="summary-category-counts">
              <div className="summary-item"><span className="summary-label"><CheckCircle2 size={14} /> SUCCESSFULLY MATCHED</span><strong data-testid="value-matched-count">{counts.matched}</strong><span className="summary-foot">invoice number, amount, and customer name agree</span></div>
              <div className="summary-item summary-attention"><span className="summary-label"><CircleAlert size={14} /> AMOUNT DIFFERENCES</span><strong data-testid="value-amount-differences-count">{counts.amountDifferences}</strong><span className="summary-foot">unique invoices with different amounts</span></div>
              <div className="summary-item summary-attention"><span className="summary-label"><CircleAlert size={14} /> CUSTOMER NAME DIFFERENCES</span><strong data-testid="value-customer-name-differences-count">{counts.customerNameDifferences}</strong><span className="summary-foot">same invoice number, different customer names</span></div>
              <div className="summary-item summary-attention"><span className="summary-label"><CircleAlert size={14} /> MISSING RECORDS</span><strong data-testid="value-missing-records-count">{counts.missingRecords}</strong><span className="summary-foot">present in only one file</span></div>
              <div className="summary-item summary-attention"><span className="summary-label"><CircleAlert size={14} /> DUPLICATE INVOICES</span><strong data-testid="value-duplicate-invoices-count">{counts.duplicateInvoices}</strong><span className="summary-foot">unique numbers repeated in a file</span></div>
              <div className="summary-item summary-attention"><span className="summary-label"><CircleAlert size={14} /> OTHER RECORDS TO REVIEW</span><strong data-testid="value-needs-investigation-count">{counts.needsReview}</strong><span className="summary-foot">could not be compared reliably</span></div>
            </div>
            <div className="results-controls">
              <div className="results-count"><strong>{visibleResults.length}</strong> {visibleResults.length === 1 ? 'row' : 'rows'} <span>shown</span></div>
              <div className="control-group">
                <label className="search-box"><Search size={15} /><input aria-label="Search results" placeholder="Search invoices" value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-search-results" />{search && <button aria-label="Clear search" onClick={() => setSearch('')} data-testid="button-clear-search"><X size={14} /></button>}</label>
                <label className="filter-wrap"><span className="sr-only">Filter results</span><select value={filter} onChange={(event) => setFilter(event.target.value)} data-testid="select-results-filter"><option>All results</option><option>Flagged for review</option><option>Amount differs</option><option>Customer name differs</option><option>Only in A</option><option>Only in B</option><option>Needs review</option><option>Matched</option></select><ChevronDown size={14} /></label>
              </div>
            </div>
            <div className="table-shell">
              <div className="table-scroll">
                <table className="results-table">
                  <thead><tr><th>INVOICE NUMBER</th><th>CUSTOMER</th><th className="amount-heading">FILE A <small>BUSINESS MGMT.</small></th><th className="amount-heading">FILE B <small>ACCOUNTING</small></th><th>REVIEW SIGNAL</th><th>WHY IT’S FLAGGED</th></tr></thead>
                  <tbody>
                    {visibleResults.map((row) => <tr key={row.id} data-testid={`row-result-${row.id}`}>
                       <td><span className="invoice-id mono">{row.number || 'No invoice number'}</span><span className="source-row-context">{row.a ? `A row ${row.a.sourceIndex}` : ''}{row.a && row.b ? ' · ' : ''}{row.b ? `B row ${row.b.sourceIndex}` : ''}</span></td>
                       <td>{row.customerNameDifferent && row.a && row.b
                         ? <span className="customer-name customer-name-compare"><span><b>File A</b> {row.a.customer}</span><span><b>File B</b> {row.b.customer}</span></span>
                         : <span className="customer-name">{row.customer}</span>}
                         {(row.dateA || row.dateB) && <span className="date-context">Dates shown as context · {row.dateA || '—'} / {row.dateB || '—'}</span>}</td>
                       <td className="money-cell mono">{amountCell(row.a)}</td>
                       <td className="money-cell mono">{amountCell(row.b)}</td>
                      <td><StatusPill type={row.type} id={row.id} /></td>
                       <td className="explanation-cell">
                         <div className="comparison-checks" data-testid={`comparison-checks-${row.id}`}>
                           <span><strong>Invoice number:</strong> {row.comparison.invoiceNumber}</span>
                           <span><strong>Amount:</strong> {row.comparison.amount}</span>
                           <span><strong>Customer name:</strong> {row.comparison.customerName}</span>
                         </div>
                         {explanationWithoutComparisonSummary(row.explanation)}
                       </td>
                    </tr>)}
                    {visibleResults.length === 0 && <tr><td colSpan={6}><div className="empty-results"><div className="empty-icon"><Search size={18} /></div><strong>{results.length ? 'No rows match this view' : 'No review items'}</strong><span>{results.length ? 'Try another search or filter.' : 'Every invoice number, amount, and customer name matched.'}</span></div></td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="results-footnote"><div className="footnote-mark"><HelpCircle size={15} /></div><p><strong>A flagged row is a prompt to investigate, not proof of an error, loss, or fraud.</strong> Invoice number identifies a potential pair; SyncProof then compares amounts and customer names. Dates are not compared. Duplicate numbers and incomplete records stay visible for review.</p></div>
          </section>}

          {!results && <section className="method-section">
            <div className="method-heading"><div className="method-heading-icon"><Fingerprint size={18} /></div><div><h2 className="display">A careful comparison, by design</h2><p>Simple rules you can inspect before you begin.</p></div></div>
            <div className="method-grid">
              <div className="method-item"><span className="method-number">01</span><div><strong>Find a potential pair by invoice number</strong><p>Trimmed and case-folded. Then compare amount and customer name—no fuzzy matching or guessed identities.</p></div></div>
              <div className="method-item"><span className="method-number">02</span><div><strong>Compare to the cent</strong><p>Amounts are compared as integer cents. Dates remain display context.</p></div></div>
              <div className="method-item"><span className="method-number">03</span><div><strong>Keep the awkward rows</strong><p>Duplicates and incomplete records are retained for human review.</p></div></div>
            </div>
          </section>}
          <footer className="page-footer"><span><LockKeyhole size={13} /> Browser-only processing</span><span>SyncProof helps you find what to inspect. It does not determine what is correct.</span></footer>
        </div>
      </main>
    </div>
  );
}

function StatusPill({ type, id }: { type: ResultType; id: string }) {
  const className = type === 'Matched' ? 'status-matched' : type === 'Needs review' ? 'status-needs-review' : 'status-difference';
  return <span className={`status-pill ${className}`} data-testid={`status-result-${type.toLowerCase().replaceAll(' ', '-')}-${id}`}><span className="status-dot" />{type}</span>;
}

export default App;
