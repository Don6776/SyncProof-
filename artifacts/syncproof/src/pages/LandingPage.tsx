import {
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import './public-pages.css';

const checks = [
  'Missing invoices',
  'Duplicate invoice numbers',
  'Amount differences',
  'Customer-name differences',
];

export default function LandingPage() {
  return (
    <main className="sp-public">
      <nav className="sp-nav">
        <a href="/" className="sp-brand">
          <span className="sp-brand-mark">S</span>
          <span>SyncProof<span className="sp-brand-period">.</span></span>
        </a>
        <div className="sp-nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#what-it-checks">What it checks</a>
        </div>
        <a href="/apply" className="sp-nav-cta">
          Apply for early access <ArrowRight size={14} />
        </a>
      </nav>

      <section className="sp-hero">
        <div className="sp-hero-copy">
          <div className="sp-eyebrow">
            <span className="sp-eyebrow-line" />
            FINANCIAL RECONCILIATION
          </div>
          <h1>
            Stop chasing invoice discrepancies.
            <span>Start finding them.</span>
          </h1>
          <p className="sp-hero-description">
            Compare invoice exports from two business systems and identify
            missing invoices, duplicates and differences without manually
            checking every row.
          </p>
          <div className="sp-hero-actions">
            <a href="/apply" className="sp-button-primary">
              Apply for early access <ArrowRight size={15} />
            </a>
            <a href="#how-it-works" className="sp-button-secondary">
              See how it works
            </a>
          </div>
          <div className="sp-hero-note">
            <ShieldCheck size={15} />
            Your uploaded CSV files are processed for comparison. Flagged
            items are signals for a person to review, not a verdict.
          </div>
        </div>

        <div className="sp-preview">
          <div className="sp-preview-top">
            <div>
              <span className="sp-preview-label">RECONCILIATION PREVIEW</span>
              <h3>Comparison report</h3>
            </div>
            <span className="sp-preview-status">Example</span>
          </div>

          <div className="sp-preview-files">
            <div className="sp-file">
              <span className="sp-file-icon"><FileSpreadsheet size={18} /></span>
              <span><strong>Business Management</strong><small>Source file A · CSV</small></span>
              <CheckCircle2 size={16} />
            </div>
            <div className="sp-file">
              <span className="sp-file-icon sp-file-icon-alt"><FileText size={18} /></span>
              <span><strong>Accounting</strong><small>Source file B · CSV</small></span>
              <CheckCircle2 size={16} />
            </div>
          </div>

          <div className="sp-preview-divider" />
          <div className="sp-preview-summary">
            <span>EXAMPLE REPORT</span>
            <strong>5 unique invoice issues identified</strong>
          </div>
          <div className="sp-preview-row">
            <span><i className="sp-dot sp-dot-red" />Missing invoices</span>
            <strong>3</strong>
          </div>
          <div className="sp-preview-row">
            <span><i className="sp-dot sp-dot-amber" />Amount differences</span>
            <strong>1</strong>
          </div>
          <div className="sp-preview-row">
            <span><i className="sp-dot sp-dot-blue" />Duplicate invoices</span>
            <strong>1</strong>
          </div>
          <div className="sp-preview-foot">
            <LockKeyhole size={13} />
            Example data · Review flagged items before taking action
          </div>
        </div>
      </section>

      <div className="sp-trust-strip">
        <span>CSV-BASED COMPARISON</span>
        <span>HUMAN-REVIEWED EXCEPTIONS</span>
        <span>REPORT EXPORT</span>
      </div>

      <section className="sp-section" id="how-it-works">
        <div className="sp-section-heading">
          <div className="sp-eyebrow"><span className="sp-eyebrow-line" />A CLEARER WORKFLOW</div>
          <h2>Two exports. One clearer picture.</h2>
          <p>
            SyncProof helps you compare two invoice datasets and see where
            records need closer attention.
          </p>
        </div>

        <div className="sp-steps">
          <article className="sp-step">
            <span className="sp-step-number">01</span>
            <span className="sp-step-icon"><Upload size={20} /></span>
            <h3>Upload your exports</h3>
            <p>Choose the two CSV invoice files you want to compare.</p>
          </article>
          <article className="sp-step">
            <span className="sp-step-number">02</span>
            <span className="sp-step-icon"><Search size={20} /></span>
            <h3>Compare records</h3>
            <p>SyncProof checks invoice numbers, customers and amounts.</p>
          </article>
          <article className="sp-step">
            <span className="sp-step-number">03</span>
            <span className="sp-step-icon"><FileText size={20} /></span>
            <h3>Review the results</h3>
            <p>Inspect flagged differences and export a report for review.</p>
          </article>
        </div>
      </section>

      <section className="sp-section sp-checks-section" id="what-it-checks">
        <div className="sp-checks-copy">
          <div className="sp-eyebrow"><span className="sp-eyebrow-line" />WHAT IT CHECKS</div>
          <h2>Know where to look. Without checking every row.</h2>
          <p>
            Instead of manually comparing two exports, get a structured
            overview of records that may need attention.
          </p>
          <a href="/apply" className="sp-text-link">
            Apply for early access <ArrowRight size={14} />
          </a>
        </div>
        <div className="sp-check-list">
          {checks.map((item) => (
            <div className="sp-check-item" key={item}>
              <span><Check size={15} /></span>
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="sp-final-cta">
        <div className="sp-eyebrow"><span className="sp-eyebrow-line" />EARLY ACCESS</div>
        <h2>Make invoice reconciliation easier to review.</h2>
        <p>
          Tell us how your team currently reconciles invoices and apply to
          explore SyncProof.
        </p>
        <a href="/apply" className="sp-button-primary">
          Apply for early access <ArrowRight size={15} />
        </a>
      </section>

      <footer className="sp-footer">
        <a href="/" className="sp-brand">
          <span className="sp-brand-mark">S</span>
          <span>SyncProof<span className="sp-brand-period">.</span></span>
        </a>
        <span>© {new Date().getFullYear()} SyncProof. All rights reserved.</span>
        <a href="/apply">Early access <ArrowRight size={12} /></a>
      </footer>
    </main>
  );
}
