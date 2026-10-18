import { type ChangeEvent, type DragEvent, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  ArrowDownToLine, ArrowRight, Check, CheckCircle2, ChevronDown, CircleAlert,
  ClipboardList, FileCheck2, FileDown, Fingerprint, HelpCircle,
  LockKeyhole, Search, ShieldCheck, Sparkles, Upload, X,
} from 'lucide-react';

const queryClient = new QueryClient();
const REQUIRED_HEADERS = ['invoice_number', 'customer_name', 'invoice_date', 'total_amount'] as const;
type Side = 'A' | 'B';
type RecordRow = {
  number: string;
  key: string;
  customer: string;
  date: string;
  cents: number | null;
  issues: string[];
  sourceIndex: number;
};
type UploadData = { fileName: string; rows: RecordRow[]; count: number };
type ResultType = 'Matched' | 'Amount differs' | 'Only in A' | 'Only in B' | 'Needs review';
type ResultRow = {
  id: string;
  number: string;
  customer: string;
  dateA: string;
  dateB: string;
  a: RecordRow | null;
  b: RecordRow | null;
  type: ResultType;
  explanation: string;
};

const DEMO_A = `invoice_number,customer_name,invoice_date,total_amount
INV-24031,Juniper & Slate Studio,2025-03-03,1840.00
INV-24032,Northline Workshop,2025-03-04,625.50
INV-24033,"Morrow, Hale & Co.",2025-03-05,2975.00
INV-24034,Fieldwork Design Office,2025-03-06,412.80
INV-24035,Harborlight Press,2025-03-07,960.00
INV-24035,Harborlight Press,2025-03-08,960.00`;
const DEMO_B = `invoice_number,customer_name,invoice_date,total_amount
inv-24031,Juniper & Slate Studio,2025-03-03,1840.00
INV-24032,Northline Workshop,2025-03-04,625.50
INV-24033,"Morrow, Hale & Co.",2025-03-06,2795.00
INV-24035,Harborlight Press,2025-03-09,960.00
INV-24036,Redwood Letterpress,2025-03-10,1180.25`;

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

function parseAmount(raw: string): number | null {
  let value = raw.trim();
  if (!value) return null;
  const parenthesized = /^\(.*\)$/.test(value);
  if (parenthesized) value = value.slice(1, -1).trim();
  const negative = parenthesized || value.startsWith('-');
  if (value.startsWith('-')) value = value.slice(1);
  value = value.replace(/^\$\s*/, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return null;
  value = value.replace(/,/g, '');
  const [whole, decimal = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? (negative ? -cents : cents) : null;
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
    const amountText = (cells[positions.total_amount] ?? '').trim();
    const cents = parseAmount(amountText);
    const issues: string[] = [];
    if (cells.length !== parsed[0].length) issues.push(`This row has ${cells.length} fields, but the header defines ${parsed[0].length} columns. Check the CSV row.`);
    if (!number) issues.push('Invoice number is missing, so this record cannot be matched reliably.');
    if (!customer) issues.push('Customer name is missing. Confirm the source record.');
    if (cents === null) issues.push('Amount is missing or not a valid amount with up to two decimal places.');
    return { number, key: number.toLowerCase(), customer, date, cents, issues, sourceIndex: index + 2 };
  });
}

function formatMoney(cents: number | null): string {
  if (cents === null) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}
function csvCell(value: string): string { return `"${value.replace(/"/g, '""')}"`; }
function downloadFile(name: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}
function demoDownload(side: Side) {
  downloadFile(side === 'A' ? 'syncproof-fictional-business-invoices.csv' : 'syncproof-fictional-accounting-invoices.csv', side === 'A' ? DEMO_A : DEMO_B);
}

function compareRows(fileA: UploadData, fileB: UploadData): ResultRow[] {
  const results: ResultRow[] = [];
  const groups = (rows: RecordRow[]) => {
    const map = new Map<string, RecordRow[]>();
    rows.forEach((record) => {
      if (!record.key) return;
      map.set(record.key, [...(map.get(record.key) ?? []), record]);
    });
    return map;
  };
  const aGroups = groups(fileA.rows);
  const bGroups = groups(fileB.rows);
  let serial = 0;
  const push = (a: RecordRow | null, b: RecordRow | null, type: ResultType, explanation: string, number = a?.number || b?.number || '') => {
    results.push({ id: `result-${serial++}`, number, customer: a?.customer || b?.customer || 'Customer not provided', dateA: a?.date ?? '', dateB: b?.date ?? '', a, b, type, explanation });
  };
  const keys = new Set([...aGroups.keys(), ...bGroups.keys()]);
  for (const key of keys) {
    const as = aGroups.get(key) ?? [];
    const bs = bGroups.get(key) ?? [];
    if (as.length > 1 || bs.length > 1) {
      const all = [...as.map((record) => ({ side: 'A' as const, record })), ...bs.map((record) => ({ side: 'B' as const, record }))];
      all.forEach(({ side, record }) => push(
        side === 'A' ? record : null, side === 'B' ? record : null, 'Needs review',
        `This invoice number appears more than once in ${as.length > 1 && bs.length > 1 ? 'both files' : as.length > 1 ? 'File A' : 'File B'}. Review each source row; duplicate keys are not matched. Source row: File ${side}, row ${record.sourceIndex}.`,
      ));
      continue;
    }
    if (as.length === 1 && bs.length === 1) {
      const a = as[0]; const b = bs[0];
      if (a.issues.length || b.issues.length) {
        const details = [a.issues.length ? `File A: ${a.issues.join(' ')}` : '', b.issues.length ? `File B: ${b.issues.join(' ')}` : ''].filter(Boolean).join(' ');
        push(a, b, 'Needs review', `This invoice number is present in both files, but at least one record cannot be compared reliably. File A row ${a.sourceIndex}; File B row ${b.sourceIndex}. ${details}`);
      } else if (a.cents === b.cents) push(a, b, 'Matched', 'Invoice number and amount agree. Dates are shown as context only and were not compared.');
      else push(a, b, 'Amount differs', `The amounts differ by ${formatMoney(Math.abs((a.cents ?? 0) - (b.cents ?? 0)))}. File A row ${a.sourceIndex}; File B row ${b.sourceIndex}. A person should review the source records; this difference alone does not establish an error or loss.`);
    } else {
      const record = as[0] ?? bs[0];
      if (!record) continue;
      const otherIssues = record.issues.length ? ` Also review this record: ${record.issues.join(' ')}` : '';
      if (as.length) push(record, null, 'Only in A', `No unique invoice with this number was found in File B. File A row ${record.sourceIndex}. Check the export scope and source record.${otherIssues}`);
      else push(null, record, 'Only in B', `No unique invoice with this number was found in File A. File B row ${record.sourceIndex}. Check the export scope and source record.${otherIssues}`);
    }
  }
  fileA.rows.filter((record) => !record.key).forEach((record) => push(record, null, 'Needs review', record.issues.join(' ') || 'Invoice number is missing, so this record cannot be matched reliably.'));
  fileB.rows.filter((record) => !record.key).forEach((record) => push(null, record, 'Needs review', record.issues.join(' ') || 'Invoice number is missing, so this record cannot be matched reliably.'));
  return results;
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
      const matchesFilter = filter === 'All results' || (filter === 'Flagged for review' ? row.type !== 'Matched' : row.type === filter);
      const term = search.trim().toLowerCase();
      return matchesFilter && (!term || `${row.number} ${row.customer} ${row.explanation} ${row.type}`.toLowerCase().includes(term));
    });
  }, [results, filter, search]);
  const counts = useMemo(() => {
    const all = results ?? [];
    return {
      compared: all.length,
      matched: all.filter((row) => row.type === 'Matched').length,
      flagged: all.filter((row) => row.type !== 'Matched').length,
      needsReview: all.filter((row) => row.type === 'Needs review').length,
    };
  }, [results]);
  const exportReport = () => {
    if (!results) return;
    const cols = ['invoice_number', 'customer_name', 'file_a_amount', 'file_b_amount', 'discrepancy_type', 'human_review_note', 'file_a_source_row', 'file_b_source_row', 'file_a_invoice_date_context', 'file_b_invoice_date_context'];
    const flagged = results.filter((row) => row.type !== 'Matched');
    const amountForCsv = (cents: number | null) => cents === null ? '' : (cents / 100).toFixed(2);
    const lines = flagged.map((row) => [
      row.number, row.customer, row.a ? amountForCsv(row.a.cents) : '', row.b ? amountForCsv(row.b.cents) : '',
      row.type, row.explanation, row.a ? String(row.a.sourceIndex) : '', row.b ? String(row.b.sourceIndex) : '', row.dateA, row.dateB,
    ].map((value) => csvCell(value)).join(','));
    downloadFile('syncproof-discrepancy-review.csv', [cols.join(','), ...lines].join('\r\n'));
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
            <div className="results-topline"><div className="section-heading results-title"><div className="section-index">02</div><div><h2 id="results-heading" className="display">Review the differences</h2><p>Signals for human review—not a verdict on either set of books.</p></div></div><button className="outline-button export-button" onClick={exportReport} disabled={counts.flagged === 0} data-testid="button-export-report"><FileDown size={16} /><span>Export review CSV</span></button></div>
            <div className="summary-strip">
              <div className="summary-item summary-total"><span className="summary-label">COMPARISON ROWS</span><strong data-testid="value-records-reviewed">{counts.compared}</strong><span className="summary-foot">paired and investigation rows</span></div>
              <div className="summary-item"><span className="summary-label"><CheckCircle2 size={14} /> MATCHED</span><strong data-testid="value-matched-count">{counts.matched}</strong><span className="summary-foot">same number &amp; amount</span></div>
              <div className="summary-item summary-attention"><span className="summary-label"><CircleAlert size={14} /> FLAGGED TO REVIEW</span><strong data-testid="value-flagged-count">{counts.flagged}</strong><span className="summary-foot">{counts.needsReview} need more information</span></div>
              <div className="summary-aside"><span className="summary-aside-mark"><FileCheck2 size={19} /></span><span>Matching invoices are counted separately from items needing review.</span></div>
            </div>
            <div className="results-controls">
              <div className="results-count"><strong>{visibleResults.length}</strong> {visibleResults.length === 1 ? 'row' : 'rows'} <span>shown</span></div>
              <div className="control-group">
                <label className="search-box"><Search size={15} /><input aria-label="Search results" placeholder="Search invoices" value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-search-results" />{search && <button aria-label="Clear search" onClick={() => setSearch('')} data-testid="button-clear-search"><X size={14} /></button>}</label>
                <label className="filter-wrap"><span className="sr-only">Filter results</span><select value={filter} onChange={(event) => setFilter(event.target.value)} data-testid="select-results-filter"><option>All results</option><option>Flagged for review</option><option>Amount differs</option><option>Only in A</option><option>Only in B</option><option>Needs review</option><option>Matched</option></select><ChevronDown size={14} /></label>
              </div>
            </div>
            <div className="table-shell">
              <div className="table-scroll">
                <table className="results-table">
                  <thead><tr><th>INVOICE NUMBER</th><th>CUSTOMER</th><th className="amount-heading">FILE A <small>BUSINESS MGMT.</small></th><th className="amount-heading">FILE B <small>ACCOUNTING</small></th><th>REVIEW SIGNAL</th><th>WHY IT’S FLAGGED</th></tr></thead>
                  <tbody>
                    {visibleResults.map((row) => <tr key={row.id} data-testid={`row-result-${row.id}`}>
                       <td><span className="invoice-id mono">{row.number || 'No invoice number'}</span><span className="source-row-context">{row.a ? `A row ${row.a.sourceIndex}` : ''}{row.a && row.b ? ' · ' : ''}{row.b ? `B row ${row.b.sourceIndex}` : ''}</span></td>
                      <td><span className="customer-name">{row.customer}</span>{(row.dateA || row.dateB) && <span className="date-context">Dates shown as context · {row.dateA || '—'} / {row.dateB || '—'}</span>}</td>
                      <td className="money-cell mono">{row.a ? formatMoney(row.a.cents) : <span className="empty-value">Not found</span>}</td>
                      <td className="money-cell mono">{row.b ? formatMoney(row.b.cents) : <span className="empty-value">Not found</span>}</td>
                      <td><StatusPill type={row.type} id={row.id} /></td>
                      <td className="explanation-cell">{row.explanation}</td>
                    </tr>)}
                    {visibleResults.length === 0 && <tr><td colSpan={6}><div className="empty-results"><div className="empty-icon"><Search size={18} /></div><strong>{results.length ? 'No rows match this view' : 'No review items'}</strong><span>{results.length ? 'Try another search or filter.' : 'Every invoice number and amount matched.'}</span></div></td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="results-footnote"><div className="footnote-mark"><HelpCircle size={15} /></div><p><strong>A flagged row is a prompt to investigate, not proof of an error or loss.</strong> Invoice number is the only matching key (trimmed and case-folded); dates are not compared. Duplicate numbers and incomplete records stay visible for review.</p></div>
          </section>}

          {!results && <section className="method-section">
            <div className="method-heading"><div className="method-heading-icon"><Fingerprint size={18} /></div><div><h2 className="display">A careful comparison, by design</h2><p>Simple rules you can inspect before you begin.</p></div></div>
            <div className="method-grid">
              <div className="method-item"><span className="method-number">01</span><div><strong>Match on invoice number only</strong><p>Trimmed and case-folded. No fuzzy matching or guessed identities.</p></div></div>
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
