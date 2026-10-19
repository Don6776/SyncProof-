export type Side = 'A' | 'B';
export type AmountStatus = 'valid' | 'blank' | 'invalid';

export type RecordRow = {
  number: string;
  key: string;
  customer: string;
  date: string;
  amountText: string;
  amountStatus: AmountStatus;
  cents: number | null;
  issues: string[];
  sourceIndex: number;
};

export type UploadData = { fileName: string; rows: RecordRow[]; count: number };
export type ResultType = 'Matched' | 'Amount differs' | 'Customer name differs' | 'Only in A' | 'Only in B' | 'Needs review';
export type IssueCategory = 'matched' | 'amount-difference' | 'customer-name-difference' | 'missing' | 'duplicate' | 'review';
export type ComparisonStatus = 'Match' | 'Difference detected' | 'Not compared' | 'Duplicate' | 'Not found';
export type ComparisonChecks = {
  invoiceNumber: ComparisonStatus;
  amount: ComparisonStatus;
  customerName: ComparisonStatus;
};
export type ResultRow = {
  id: string;
  issueId: string;
  category: IssueCategory;
  number: string;
  customer: string;
  dateA: string;
  dateB: string;
  a: RecordRow | null;
  b: RecordRow | null;
  type: ResultType;
  comparison: ComparisonChecks;
  customerNameDifferent: boolean;
  additionalCategories: IssueCategory[];
  explanation: string;
};

export const CUSTOMER_NAME_DIFFERENCE_EXPLANATION =
  'The invoice number and amount agree, but the customer names differ. Verify that both records belong to the same customer.';

function formatMoney(cents: number | null): string {
  if (cents === null) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

export function parseAmount(raw: string): number | null {
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

function normalizeCustomerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function recordIssueDetails(record: RecordRow, side: Side): string {
  const details: string[] = [];
  if (record.amountStatus === 'blank') {
    details.push(`File ${side}, row ${record.sourceIndex}: total_amount is blank. Correct or verify the source data before relying on this comparison.`);
  } else if (record.amountStatus === 'invalid' || record.cents === null) {
    details.push(`File ${side}, row ${record.sourceIndex}: total_amount contains the invalid original value "${record.amountText}". Correct or verify the source data before relying on this comparison.`);
  }
  const otherIssues = record.issues.filter((issue) => !issue.startsWith('The total_amount value'));
  otherIssues.forEach((issue) => details.push(`File ${side}, row ${record.sourceIndex}: ${issue}`));
  return details.join(' ');
}

function comparisonSummary(comparison: ComparisonChecks): string {
  return `Invoice number: ${comparison.invoiceNumber}. Amount: ${comparison.amount}. Customer name: ${comparison.customerName}.`;
}

export function compareRows(fileA: UploadData, fileB: UploadData): ResultRow[] {
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
  const push = (
    a: RecordRow | null,
    b: RecordRow | null,
    type: ResultType,
    category: IssueCategory,
    issueId: string,
    explanation: string,
    number = a?.number || b?.number || '',
    additionalCategories: IssueCategory[] = [],
  ) => {
    const hasPair = Boolean(a && b);
    const customerNameDifferent = Boolean(
      a?.customer.trim() && b?.customer.trim() &&
      normalizeCustomerName(a.customer) !== normalizeCustomerName(b.customer),
    );
    const comparison: ComparisonChecks = {
      invoiceNumber: hasPair ? 'Match' : category === 'duplicate' ? 'Duplicate' : category === 'missing' ? 'Not found' : 'Not compared',
      amount: a?.cents !== null && a?.cents !== undefined && b?.cents !== null && b?.cents !== undefined
        ? (a.cents === b.cents ? 'Match' : 'Difference detected')
        : 'Not compared',
      customerName: hasPair && a?.customer.trim() && b?.customer.trim()
        ? (customerNameDifferent ? 'Difference detected' : 'Match')
        : 'Not compared',
    };
    const customer = customerNameDifferent
      ? `File A: ${a?.customer} · File B: ${b?.customer}`
      : a?.customer || b?.customer || 'Customer not provided';
    results.push({
      id: `result-${serial++}`,
      issueId,
      category,
      number,
      customer,
      dateA: a?.date ?? '',
      dateB: b?.date ?? '',
      a,
      b,
      type,
      comparison,
      customerNameDifferent,
      additionalCategories,
      explanation: `${comparisonSummary(comparison)} ${explanation}`,
    });
  };
  const keys = new Set([...aGroups.keys(), ...bGroups.keys()]);
  for (const key of keys) {
    const as = aGroups.get(key) ?? [];
    const bs = bGroups.get(key) ?? [];
    const issueId = `invoice:${key}`;
    if (as.length > 1 || bs.length > 1) {
      const all = [...as.map((record) => ({ side: 'A' as const, record })), ...bs.map((record) => ({ side: 'B' as const, record }))];
      const explanation = `File A contains ${as.length} record${as.length === 1 ? '' : 's'} with invoice number ${as[0]?.number || bs[0]?.number}, while File B contains ${bs.length}. These records were not matched automatically. A person should review the source records to determine whether the duplication is legitimate. File A source rows: ${as.length ? as.map((record) => record.sourceIndex).join(', ') : 'none'}; File B source rows: ${bs.length ? bs.map((record) => record.sourceIndex).join(', ') : 'none'}.`;
      all.forEach(({ side, record }) => {
        const sourceDetails = recordIssueDetails(record, side);
        const additionalCategories = record.issues.length || record.amountStatus !== 'valid' ? ['review'] : [];
        push(
          side === 'A' ? record : null, side === 'B' ? record : null, 'Needs review', 'duplicate', issueId,
          `${explanation} This affected source row is File ${side}, row ${record.sourceIndex}.${sourceDetails ? ` ${sourceDetails}` : ''}`,
          undefined,
          additionalCategories,
        );
      });
      continue;
    }
    if (as.length === 1 && bs.length === 1) {
      const a = as[0];
      const b = bs[0];
      const customerNameDifferent = Boolean(
        a.customer.trim() && b.customer.trim() &&
        normalizeCustomerName(a.customer) !== normalizeCustomerName(b.customer),
      );
      const customerDifference = a.cents !== null && a.cents === b.cents
        ? CUSTOMER_NAME_DIFFERENCE_EXPLANATION
        : 'The customer names differ. Verify that both records belong to the same customer.';
      if (a.issues.length || b.issues.length) {
        const details = [recordIssueDetails(a, 'A'), recordIssueDetails(b, 'B')].filter(Boolean).join(' ');
        const nameDetails = customerNameDifferent ? ` ${customerDifference} File A customer: ${a.customer}. File B customer: ${b.customer}.` : '';
        push(a, b, 'Needs review', 'review', issueId, `This invoice number is present in both files, but at least one record cannot be compared reliably. File A row ${a.sourceIndex}; File B row ${b.sourceIndex}. ${details}${nameDetails}`);
      } else if (a.cents === b.cents && customerNameDifferent) {
        push(a, b, 'Customer name differs', 'customer-name-difference', issueId, `${customerDifference} File A customer: ${a.customer}. File B customer: ${b.customer}.`);
      } else if (a.cents === b.cents) {
        push(a, b, 'Matched', 'matched', issueId, 'All compared fields agree. Invoice dates are shown as context only and were not compared.');
      } else {
        const amountExplanation = `The amounts differ by ${formatMoney(Math.abs((a.cents ?? 0) - (b.cents ?? 0)))}. File A row ${a.sourceIndex}; File B row ${b.sourceIndex}. A person should review the source records; this difference alone does not establish an error or loss.`;
        const nameDetails = customerNameDifferent ? ` ${customerDifference} File A customer: ${a.customer}. File B customer: ${b.customer}.` : '';
        push(a, b, 'Amount differs', 'amount-difference', issueId, `${amountExplanation}${nameDetails}`);
      }
    } else {
      const record = as[0] ?? bs[0];
      if (!record) continue;
      const side: Side = as.length ? 'A' : 'B';
      const absentFrom: Side = side === 'A' ? 'B' : 'A';
      if (record.amountStatus !== 'valid' || record.cents === null) {
        const sourceDetails = recordIssueDetails(record, side);
        push(
          side === 'A' ? record : null,
          side === 'B' ? record : null,
          'Needs review',
          'review',
          issueId,
          `${sourceDetails} Invoice ${record.number} is not present in File ${absentFrom}. Because its amount is invalid or blank, SyncProof flags it for review rather than treating it as an ordinary missing invoice.`,
        );
        continue;
      }
      const otherIssues = record.issues.length ? ` Also review this record: ${record.issues.join(' ')}` : '';
      if (as.length) push(record, null, 'Only in A', 'missing', issueId, `No unique invoice with this number was found in File B. File A row ${record.sourceIndex}. Check the export scope and source record.${otherIssues}`);
      else push(null, record, 'Only in B', 'missing', issueId, `No unique invoice with this number was found in File A. File B row ${record.sourceIndex}. Check the export scope and source record.${otherIssues}`);
    }
  }
  fileA.rows.filter((record) => !record.key).forEach((record) => push(record, null, 'Needs review', 'review', `row:A:${record.sourceIndex}`, record.issues.join(' ') || 'Invoice number is missing, so this record cannot be matched reliably.'));
  fileB.rows.filter((record) => !record.key).forEach((record) => push(null, record, 'Needs review', 'review', `row:B:${record.sourceIndex}`, record.issues.join(' ') || 'Invoice number is missing, so this record cannot be matched reliably.'));
  return results;
}
