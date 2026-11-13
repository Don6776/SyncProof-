import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import './public-pages.css';

type FormFields = {
  name: string;
  email: string;
  role: string;
  reconciliationMethod: string;
  monthlyInvoiceVolume: string;
};

const initialForm: FormFields = {
  name: '',
  email: '',
  role: '',
  reconciliationMethod: '',
  monthlyInvoiceVolume: '',
};

export default function WaitlistPage() {
  const [form, setForm] = useState<FormFields>(initialForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof FormFields, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const response = await fetch('https://syncproof-api.vercel.app/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 201) {
        setSuccess(true);
        return;
      }

      if (response.status === 409) {
        setError('An application with this email already exists.');
      } else if (response.status === 400) {
        setError(data.error || 'Please check your information and try again.');
      } else {
        setError(data.error || 'We could not process your application. Please try again.');
      }
    } catch {
      setError('We could not connect to the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="sp-public sp-apply">
      <nav className="sp-nav">
        <a href="/" className="sp-brand">
          <span className="sp-brand-mark">S</span>
          <span>SyncProof<span className="sp-brand-period">.</span></span>
        </a>
        <a href="/" className="sp-apply-back">
          <ArrowLeft size={15} /> Back to home
        </a>
      </nav>

      <section className="sp-apply-layout">
        <div className="sp-apply-intro">
          <div className="sp-eyebrow">
            <span className="sp-eyebrow-line" />
            EARLY ACCESS APPLICATION
          </div>
          <h1>Let's understand how you handle <span>reconciliation.</span></h1>
          <p>
            Tell us a little about your role and current process.
            This helps us understand whether SyncProof is a good fit
            for your workflow.
          </p>
          <div className="sp-apply-note">
            <CheckCircle2 size={18} />
            <span>Submitting an application does not automatically create an account or guarantee access.</span>
          </div>
        </div>

        <div className="sp-apply-card">
          {success ? (
            <div className="sp-apply-success">
              <CheckCircle2 size={42} />
              <h2>Application received.</h2>
              <p>
                Thank you for your interest in SyncProof.
                Your application has been recorded for review.
              </p>
              <a href="/" className="sp-button-primary">Return to homepage</a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="sp-apply-form">
              <div className="sp-apply-form-heading">
                <h2>Your application</h2>
                <p>All fields are required.</p>
              </div>

              <label>
                Full name
                <input
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  maxLength={120}
                  autoComplete="name"
                  required
                  placeholder="Your name"
                />
              </label>

              <label>
                Work email
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  maxLength={320}
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                />
              </label>

              <label>
                What best describes your role?
                <select value={form.role} onChange={(e) => update('role', e.target.value)} required>
                  <option value="">Select your role</option>
                  <option>Accountant / Bookkeeper</option>
                  <option>Finance Manager / Controller</option>
                  <option>Business Owner / Founder</option>
                  <option>Finance Team Member</option>
                  <option>Other</option>
                </select>
              </label>

              <label>
                How do you currently reconcile records?
                <select value={form.reconciliationMethod} onChange={(e) => update('reconciliationMethod', e.target.value)} required>
                  <option value="">Select your current method</option>
                  <option>Spreadsheets / Excel</option>
                  <option>Manual checks between software</option>
                  <option>Existing reconciliation software</option>
                  <option>A combination of methods</option>
                  <option>We do not reconcile regularly</option>
                </select>
              </label>

              <label>
                Approximately how many invoices do you handle monthly?
                <select value={form.monthlyInvoiceVolume} onChange={(e) => update('monthlyInvoiceVolume', e.target.value)} required>
                  <option value="">Select monthly volume</option>
                  <option>Under 100</option>
                  <option>100–500</option>
                  <option>501–1,500</option>
                  <option>1,501–10,000</option>
                  <option>Over 10,000</option>
                  <option>Not sure</option>
                </select>
              </label>

              {error && <p className="sp-apply-error" role="alert">{error}</p>}

              <button type="submit" className="sp-button-primary sp-apply-submit" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit application'}
                {!submitting && <ArrowRight size={17} />}
              </button>

              <p className="sp-apply-disclaimer">
                Your information will be used to review your early access application.
              </p>
            </form>
          )}
        </div>
      </section>

      <footer className="sp-footer">
        <a href="/" className="sp-brand">
          <span className="sp-brand-mark">S</span>
          <span>SyncProof<span className="sp-brand-period">.</span></span>
        </a>
        <span>Financial reconciliation, made clearer.</span>
      </footer>
    </main>
  );
}
