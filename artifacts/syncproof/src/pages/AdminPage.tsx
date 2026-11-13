import { useEffect, useState, type FormEvent } from "react";

const API = "https://syncproof-api.vercel.app/api/admin";

type Application = {
  id: string;
  name: string;
  email: string;
  role: string;
  reconciliationMethod: string;
  monthlyInvoiceVolume: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  async function loadApplications() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/applications`, {
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load applications.");
      }

      setApplications(data.applications || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch(`${API}/session`, {
          credentials: "include",
        });

        if (response.ok) {
          setAuthenticated(true);
          await loadApplications();
        }
      } catch {
        setError("Could not connect to the admin server.");
      } finally {
        setChecking(false);
      }
    }

    checkSession();
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);
    setError("");

    try {
      const response = await fetch(`${API}/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Login failed.");
      }

      setPassword("");
      setAuthenticated(true);
      await loadApplications();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function updateStatus(id: string, status: Application["status"]) {
    setError("");

    try {
      const response = await fetch(`${API}/applications/${id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not update application.");
      }

      setApplications((current) =>
        current.map((application) =>
          application.id === id
            ? { ...application, status: data.application.status }
            : application,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${API}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setAuthenticated(false);
      setApplications([]);
    }
  }

  const pending = applications.filter((a) => a.status === "pending").length;
  const approved = applications.filter((a) => a.status === "approved").length;
  const rejected = applications.filter((a) => a.status === "rejected").length;

  if (checking) {
    return (
      <main className="min-h-screen bg-[#080d18] text-white flex items-center justify-center">
        Checking admin session...
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-[#080d18] text-white flex items-center justify-center px-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111827] p-8"
        >
          <p className="text-sm font-semibold tracking-widest text-blue-400">
            SYNCPROOF
          </p>
          <h1 className="mt-3 text-2xl font-bold">Admin sign in</h1>
          <p className="mt-2 text-sm text-gray-400">
            Sign in to manage waitlist applications.
          </p>

          <label className="mt-7 block text-sm text-gray-300">
            Admin password
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            className="mt-2 w-full rounded-lg border border-white/10 bg-[#080d18] px-4 py-3 text-white outline-none focus:border-blue-500"
            placeholder="Enter admin password"
          />

          {error && (
            <p className="mt-4 text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loggingIn}
            className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {loggingIn ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080d18] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-widest text-blue-400">
              SYNCPROOF
            </p>
            <h1 className="mt-2 text-3xl font-bold">Admin dashboard</h1>
            <p className="mt-1 text-sm text-gray-400">
              Manage waitlist applications.
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
          >
            Sign out
          </button>
        </header>

        {error && (
          <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total applications", value: applications.length },
            { label: "Pending", value: pending },
            { label: "Approved", value: approved },
            { label: "Rejected", value: rejected },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-white/10 bg-[#111827] p-5"
            >
              <p className="text-sm text-gray-400">{item.label}</p>
              <p className="mt-3 text-3xl font-bold">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 overflow-hidden rounded-xl border border-white/10 bg-[#111827]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
            <div>
              <h2 className="text-lg font-semibold">Waitlist applications</h2>
              <p className="mt-1 text-sm text-gray-400">
                Review applications and manage their status.
              </p>
            </div>

            <button
              onClick={loadApplications}
              disabled={loading}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {loading && applications.length === 0 ? (
            <p className="p-8 text-center text-gray-400">
              Loading applications...
            </p>
          ) : applications.length === 0 ? (
            <p className="p-8 text-center text-gray-400">
              No applications found yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-white/5 text-gray-400">
                  <tr>
                    <th className="px-5 py-4">Applicant</th>
                    <th className="px-5 py-4">Role</th>
                    <th className="px-5 py-4">Method</th>
                    <th className="px-5 py-4">Monthly volume</th>
                    <th className="px-5 py-4">Date</th>
                    <th className="px-5 py-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((application) => (
                    <tr
                      key={application.id}
                      className="border-t border-white/10"
                    >
                      <td className="px-5 py-4">
                        <p className="font-medium">{application.name}</p>
                        <p className="mt-1 text-gray-400">
                          {application.email}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-gray-300">
                        {application.role}
                      </td>
                      <td className="px-5 py-4 text-gray-300">
                        {application.reconciliationMethod}
                      </td>
                      <td className="px-5 py-4 text-gray-300">
                        {application.monthlyInvoiceVolume}
                      </td>
                      <td className="px-5 py-4 text-gray-400">
                        {new Date(application.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={application.status}
                          onChange={(event) =>
                            updateStatus(
                              application.id,
                              event.target.value as Application["status"],
                            )
                          }
                          className="rounded-lg border border-white/15 bg-[#080d18] px-3 py-2 text-white outline-none"
                        >
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
