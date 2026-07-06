import React, { useState, useEffect } from "react";
import { Plus, Users, Wallet, ClipboardList, X, Loader2, AlertTriangle } from "lucide-react";
import {
  sanitizeSiteCode,
  ensureSite,
  fetchWorkers,
  addWorker as apiAddWorker,
  removeWorker as apiRemoveWorker,
  fetchAttendance,
  saveAttendanceForDate,
  fetchPayments,
  addPayment as apiAddPayment,
  deletePayment as apiDeletePayment,
} from "./data";

const INK = "#1F3A3D";
const PAPER = "#FAF6EC";
const PAPER_LINE = "#E3DCC8";
const RUST = "#B23A2E";
const AMBER = "#C0922F";
const GREEN = "#4C6B4E";
const CHARCOAL = "#2B2A26";
const FADED = "#8B8574";

const fontStack = {
  display: "'Roboto Slab', 'Georgia', serif",
  mono: "'IBM Plex Mono', 'Courier New', monospace",
  body: "'Inter', system-ui, sans-serif",
};

function loadFonts() {
  const id = "lat-fonts";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
  document.head.appendChild(link);
}

function fmt(n, d = 0) {
  if (isNaN(n)) return "0";
  return n.toFixed(d);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function App() {
  const [siteCode, setSiteCode] = useState("");
  const [activeSite, setActiveSite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("today");

  const [workers, setWorkers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [payments, setPayments] = useState([]);

  const [showWorkerForm, setShowWorkerForm] = useState(false);
  const [workerForm, setWorkerForm] = useState({ name: "", dailyRate: "" });

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    date: todayStr(),
    workerId: "",
    amount: "",
    type: "advance",
    notes: "",
  });

  const [attendanceDate, setAttendanceDate] = useState(todayStr());
  const [draftStatus, setDraftStatus] = useState({});

  useEffect(() => {
    loadFonts();
  }, []);

  useEffect(() => {
    if (!activeSite) return;
    const existing = {};
    attendance
      .filter((a) => a.date === attendanceDate)
      .forEach((a) => {
        existing[a.workerId] = a.status;
      });
    setDraftStatus(existing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceDate, activeSite]);

  function mapWorker(w) {
    return { id: w.id, name: w.name, dailyRate: w.daily_rate };
  }
  function mapAttendance(a) {
    return { id: a.id, date: a.date, workerId: a.worker_id, status: a.status, wage: a.wage };
  }
  function mapPayment(p) {
    return { id: p.id, date: p.date, workerId: p.worker_id, amount: p.amount, type: p.type, notes: p.notes };
  }

  async function openSite(code) {
    const normalized = sanitizeSiteCode(code);
    if (!normalized) return;
    setLoading(true);
    setError(null);

    const ensured = await ensureSite(normalized);
    if (!ensured.ok) {
      setError(
        `Could not connect to the database (${ensured.error?.message || "unknown error"}). Check your Supabase setup and try again.`
      );
      setLoading(false);
      return;
    }

    const [w, a, p] = await Promise.all([
      fetchWorkers(normalized),
      fetchAttendance(normalized),
      fetchPayments(normalized),
    ]);

    if (!w.ok || !a.ok || !p.ok) {
      const failed = [!w.ok && "workers", !a.ok && "attendance", !p.ok && "payments"].filter(Boolean).join(", ");
      setError(`Could not load ${failed} for this site. Please try again.`);
      setLoading(false);
      return;
    }

    setWorkers(w.data.map(mapWorker));
    setAttendance(a.data.map(mapAttendance));
    setPayments(p.data.map(mapPayment));
    setActiveSite(normalized);
    setLoading(false);
  }

  async function refreshAll() {
    const [w, a, p] = await Promise.all([
      fetchWorkers(activeSite),
      fetchAttendance(activeSite),
      fetchPayments(activeSite),
    ]);
    if (w.ok) setWorkers(w.data.map(mapWorker));
    if (a.ok) setAttendance(a.data.map(mapAttendance));
    if (p.ok) setPayments(p.data.map(mapPayment));
  }

  async function handleAddWorker() {
    if (!workerForm.name || !workerForm.dailyRate) return;
    setSavingEntry(true);
    const res = await apiAddWorker(activeSite, workerForm.name, parseFloat(workerForm.dailyRate));
    setSavingEntry(false);
    if (!res.ok) {
      setError(`Could not save this worker (${res.error?.message || "unknown error"}). Please try again.`);
      return;
    }
    setWorkers([...workers, mapWorker(res.data)]);
    setWorkerForm({ name: "", dailyRate: "" });
    setShowWorkerForm(false);
  }

  async function handleRemoveWorker(id) {
    const previous = workers;
    setWorkers(workers.filter((w) => w.id !== id));
    const res = await apiRemoveWorker(id);
    if (!res.ok) {
      setWorkers(previous);
      setError(`Could not remove this worker (${res.error?.message || "unknown error"}).`);
    }
  }

  async function saveAttendanceForDay() {
    const entries = workers
      .filter((w) => draftStatus[w.id])
      .map((w) => {
        const status = draftStatus[w.id];
        const rate = parseFloat(w.dailyRate) || 0;
        const wage = status === "present" ? rate : status === "half" ? rate / 2 : 0;
        return { workerId: w.id, status, wage };
      });
    setSavingEntry(true);
    const res = await saveAttendanceForDate(activeSite, attendanceDate, entries);
    setSavingEntry(false);
    if (!res.ok) {
      setError(`Could not save attendance for ${attendanceDate} (${res.error?.message || "unknown error"}).`);
      return;
    }
    await refreshAll();
  }

  async function handleAddPayment() {
    if (!paymentForm.workerId || !paymentForm.amount) return;
    setSavingEntry(true);
    const res = await apiAddPayment(activeSite, {
      ...paymentForm,
      amount: parseFloat(paymentForm.amount),
    });
    setSavingEntry(false);
    if (!res.ok) {
      setError(`Could not save this payment (${res.error?.message || "unknown error"}). Please try again.`);
      return;
    }
    setPayments([mapPayment(res.data), ...payments]);
    setPaymentForm({ date: todayStr(), workerId: "", amount: "", type: "advance", notes: "" });
    setShowPaymentForm(false);
  }

  async function handleDeletePayment(id) {
    const previous = payments;
    setPayments(payments.filter((p) => p.id !== id));
    const res = await apiDeletePayment(id);
    if (!res.ok) {
      setPayments(previous);
      setError(`Could not remove this payment (${res.error?.message || "unknown error"}).`);
    }
  }

  const ledger = workers.map((w) => {
    const workerAttendance = attendance.filter((a) => a.workerId === w.id);
    const daysPresent = workerAttendance.filter((a) => a.status === "present").length;
    const daysHalf = workerAttendance.filter((a) => a.status === "half").length;
    const daysAbsent = workerAttendance.filter((a) => a.status === "absent").length;
    const totalEarned = workerAttendance.reduce((s, a) => s + (parseFloat(a.wage) || 0), 0);
    const totalPaid = payments
      .filter((p) => p.workerId === w.id)
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    return { ...w, daysPresent, daysHalf, daysAbsent, totalEarned, totalPaid, balance: totalEarned - totalPaid };
  });
  const totalOwed = ledger.reduce((s, w) => s + w.balance, 0);
  const totalPaidOut = ledger.reduce((s, w) => s + w.totalPaid, 0);

  function workerName(id) {
    const w = workers.find((x) => x.id === id);
    return w ? w.name : "(removed worker)";
  }

  if (!activeSite) {
    return (
      <div
        style={{
          background: PAPER,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
          fontFamily: fontStack.body,
        }}
      >
        <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <ClipboardList size={30} color={AMBER} style={{ marginBottom: 14 }} />
        <div style={{ fontFamily: fontStack.display, fontSize: 26, fontWeight: 700, color: INK, marginBottom: 6, textAlign: "center" }}>
          Labor Register
        </div>
        <div style={{ color: FADED, fontSize: 14, marginBottom: 26, textAlign: "center", maxWidth: 320 }}>
          Enter your site or contractor code to open its register. First time here? Just make one up.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={siteCode}
            onChange={(e) => setSiteCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && openSite(siteCode)}
            placeholder="e.g. SHARMA-SITE-01"
            style={{
              fontFamily: fontStack.mono,
              fontSize: 14,
              padding: "10px 12px",
              border: `1.5px solid ${INK}`,
              borderRadius: 4,
              background: "#fff",
              width: 220,
              outline: "none",
              color: CHARCOAL,
            }}
          />
          <button
            onClick={() => openSite(siteCode)}
            disabled={loading}
            style={{
              background: INK,
              color: PAPER,
              border: "none",
              borderRadius: 4,
              padding: "10px 18px",
              fontFamily: fontStack.body,
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {loading ? <Loader2 size={15} className="spin" /> : "Open"}
          </button>
        </div>
        {error && <div style={{ color: RUST, fontSize: 13, marginTop: 14, maxWidth: 340, textAlign: "center" }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ background: PAPER, minHeight: "100vh", fontFamily: fontStack.body }}>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ background: INK, color: PAPER, padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: fontStack.display, fontSize: 20, fontWeight: 700 }}>Labor Register</div>
          <div style={{ fontFamily: fontStack.mono, fontSize: 11, color: "#9DB5B3", letterSpacing: "0.04em" }}>{activeSite}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saving && <Loader2 size={14} className="spin" style={{ opacity: 0.7 }} />}
          <button
            onClick={() => setActiveSite(null)}
            style={{ background: "transparent", border: `1px solid ${PAPER}55`, color: PAPER, borderRadius: 4, padding: "8px 12px", cursor: "pointer", fontSize: 12, fontFamily: fontStack.body }}
          >
            Switch site
          </button>
        </div>
      </div>

      <div style={{ display: "flex", borderBottom: `1px solid ${PAPER_LINE}`, background: "#F2EDDD", flexWrap: "wrap" }}>
        {[
          { label: "Workers", value: workers.length },
          { label: "Total Earned (all time)", value: `₹${fmt(ledger.reduce((s, w) => s + w.totalEarned, 0))}` },
          { label: "Total Paid Out", value: `₹${fmt(totalPaidOut)}` },
          { label: "Total Owed", value: `₹${fmt(totalOwed)}`, color: totalOwed > 0 ? RUST : GREEN },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, minWidth: 140, padding: "14px 18px", borderRight: i < 3 ? `1px solid ${PAPER_LINE}` : "none" }}>
            <div style={{ fontSize: 11, color: FADED, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: fontStack.mono, fontSize: 20, fontWeight: 600, color: s.color || CHARCOAL }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", padding: "0 24px", borderBottom: `1px solid ${PAPER_LINE}`, gap: 4, flexWrap: "wrap" }}>
        {[
          { id: "today", label: "Today's Attendance" },
          { id: "workers", label: "Workers" },
          { id: "payments", label: "Payments" },
          { id: "ledger", label: "Ledger" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: "none",
              border: "none",
              padding: "12px 6px",
              marginRight: 18,
              fontSize: 13,
              fontWeight: 600,
              color: tab === t.id ? INK : FADED,
              borderBottom: tab === t.id ? `2.5px solid ${AMBER}` : "2.5px solid transparent",
              cursor: "pointer",
              fontFamily: fontStack.body,
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {tab === "workers" && (
          <button onClick={() => setShowWorkerForm(true)} style={addBtnStyle}>
            <Plus size={15} /> Add Worker
          </button>
        )}
        {tab === "payments" && (
          <button onClick={() => setShowPaymentForm(true)} style={addBtnStyle}>
            <Plus size={15} /> Log Payment
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: "#FBEAE7", color: RUST, padding: "10px 24px", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
        {tab === "today" && (
          <>
            <div style={{ marginBottom: 18 }}>
              <Field label="Date">
                <input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} style={{ ...inputStyle, width: 170 }} />
              </Field>
            </div>
            {workers.length === 0 ? (
              <EmptyState icon={<Users size={22} color={FADED} />} text="Add workers first to start marking attendance." />
            ) : (
              <>
                <div style={{ overflowX: "auto", marginBottom: 16 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontStack.mono, fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${INK}` }}>
                        {["Worker", "Rate/day", "Status", "Wage"].map((h) => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {workers.map((w) => {
                        const status = draftStatus[w.id];
                        const rate = parseFloat(w.dailyRate) || 0;
                        const wage = status === "present" ? rate : status === "half" ? rate / 2 : 0;
                        return (
                          <tr key={w.id} style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
                            <td style={tdStyle}>{w.name}</td>
                            <td style={tdStyle}>₹{w.dailyRate}</td>
                            <td style={{ padding: "10px" }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                {[
                                  { id: "present", label: "Present", color: GREEN },
                                  { id: "half", label: "Half", color: AMBER },
                                  { id: "absent", label: "Absent", color: RUST },
                                ].map((opt) => (
                                  <button
                                    key={opt.id}
                                    onClick={() => setDraftStatus({ ...draftStatus, [w.id]: opt.id })}
                                    style={{
                                      background: status === opt.id ? opt.color : "transparent",
                                      color: status === opt.id ? "#fff" : opt.color,
                                      border: `1px solid ${opt.color}`,
                                      borderRadius: 4,
                                      padding: "4px 9px",
                                      fontSize: 11,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      fontFamily: fontStack.body,
                                    }}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td style={{ ...tdStyle, fontWeight: 600 }}>{status ? `₹${fmt(wage)}` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button onClick={saveAttendanceForDay} disabled={savingEntry} style={{ ...primaryBtnStyle, width: "auto" }}>
                  {savingEntry && <Loader2 size={15} className="spin" />}
                  {savingEntry ? "Saving..." : `Save Attendance for ${attendanceDate}`}
                </button>
              </>
            )}
          </>
        )}

        {tab === "workers" && (
          <>
            {workers.length === 0 ? (
              <EmptyState icon={<Users size={22} color={FADED} />} text="No workers added yet." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontStack.mono, fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${INK}` }}>
                      {["Name", "Daily Rate", ""].map((h) => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {workers.map((w) => (
                      <tr key={w.id} style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{w.name}</td>
                        <td style={tdStyle}>₹{w.dailyRate}</td>
                        <td style={{ padding: "10px" }}>
                          <button onClick={() => handleRemoveWorker(w.id)} style={linkBtnStyle}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === "payments" && (
          <>
            {payments.length === 0 ? (
              <EmptyState icon={<Wallet size={22} color={FADED} />} text="No payments logged yet." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontStack.mono, fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${INK}` }}>
                      {["Date", "Worker", "Type", "Amount", "Notes", ""].map((h) => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
                        <td style={tdStyle}>{p.date}</td>
                        <td style={tdStyle}>{workerName(p.workerId)}</td>
                        <td style={{ ...tdStyle, textTransform: "capitalize" }}>{p.type}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>₹{p.amount}</td>
                        <td style={{ padding: "10px", color: FADED }}>{p.notes || "—"}</td>
                        <td style={{ padding: "10px" }}>
                          <button onClick={() => handleDeletePayment(p.id)} style={linkBtnStyle}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === "ledger" && (
          <>
            {ledger.length === 0 ? (
              <EmptyState icon={<ClipboardList size={22} color={FADED} />} text="Add workers and mark attendance to see balances here." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontStack.mono, fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${INK}` }}>
                      {["Worker", "Present", "Half", "Absent", "Earned", "Paid", "Balance"].map((h) => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((w) => (
                      <tr key={w.id} style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{w.name}</td>
                        <td style={tdStyle}>{w.daysPresent}</td>
                        <td style={tdStyle}>{w.daysHalf}</td>
                        <td style={tdStyle}>{w.daysAbsent}</td>
                        <td style={tdStyle}>₹{fmt(w.totalEarned)}</td>
                        <td style={tdStyle}>₹{fmt(w.totalPaid)}</td>
                        <td style={{ padding: "10px", fontWeight: 700, color: w.balance > 0 ? RUST : GREEN }}>₹{fmt(w.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showWorkerForm && (
        <Modal onClose={() => setShowWorkerForm(false)} title="Add a Worker">
          <Field label="Name">
            <input value={workerForm.name} onChange={(e) => setWorkerForm({ ...workerForm, name: e.target.value })} placeholder="e.g. Ramesh Kumar" style={inputStyle} />
          </Field>
          <Field label="Daily rate (₹)">
            <input type="number" value={workerForm.dailyRate} onChange={(e) => setWorkerForm({ ...workerForm, dailyRate: e.target.value })} placeholder="e.g. 500" style={inputStyle} />
          </Field>
          <button onClick={handleAddWorker} disabled={!workerForm.name || !workerForm.dailyRate || savingEntry} style={{ ...primaryBtnStyle, opacity: !workerForm.name || !workerForm.dailyRate || savingEntry ? 0.5 : 1 }}>
            {savingEntry && <Loader2 size={15} className="spin" />}
            {savingEntry ? "Saving..." : "Save Worker"}
          </button>
        </Modal>
      )}

      {showPaymentForm && (
        <Modal onClose={() => setShowPaymentForm(false)} title="Log a Payment">
          <Field label="Worker">
            <select value={paymentForm.workerId} onChange={(e) => setPaymentForm({ ...paymentForm, workerId: e.target.value })} style={inputStyle}>
              <option value="">Select worker</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Amount (₹)">
            <input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} placeholder="e.g. 1000" style={inputStyle} />
          </Field>
          <Field label="Type">
            <select value={paymentForm.type} onChange={(e) => setPaymentForm({ ...paymentForm, type: e.target.value })} style={inputStyle}>
              <option value="advance">Advance</option>
              <option value="settlement">Settlement</option>
            </select>
          </Field>
          <Field label="Notes — optional">
            <input value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} placeholder="e.g. weekly settlement" style={inputStyle} />
          </Field>
          <button onClick={handleAddPayment} disabled={!paymentForm.workerId || !paymentForm.amount || savingEntry} style={{ ...primaryBtnStyle, opacity: !paymentForm.workerId || !paymentForm.amount || savingEntry ? 0.5 : 1 }}>
            {savingEntry && <Loader2 size={15} className="spin" />}
            {savingEntry ? "Saving..." : "Save Payment"}
          </button>
        </Modal>
      )}
    </div>
  );
}

const thStyle = { textAlign: "left", padding: "8px 10px", color: FADED, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: fontStack.body };
const tdStyle = { padding: "10px", color: CHARCOAL };
const linkBtnStyle = { background: "none", border: "none", color: FADED, cursor: "pointer", fontSize: 12, fontFamily: fontStack.body };

const inputStyle = {
  width: "100%",
  padding: "9px 10px",
  border: `1.5px solid ${PAPER_LINE}`,
  borderRadius: 4,
  fontSize: 14,
  fontFamily: "'Inter', system-ui, sans-serif",
  outline: "none",
  boxSizing: "border-box",
  color: CHARCOAL,
  background: "#fff",
};

const primaryBtnStyle = {
  background: INK,
  color: PAPER,
  border: "none",
  borderRadius: 4,
  padding: "11px 16px",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  width: "100%",
  marginTop: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const addBtnStyle = {
  background: AMBER,
  color: "#fff",
  border: "none",
  borderRadius: 4,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 6,
  margin: "8px 0",
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: FADED, marginBottom: 5, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div style={{ textAlign: "center", padding: "50px 20px", color: FADED }}>
      <div style={{ marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 13 }}>{text}</div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(31,58,61,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PAPER, borderRadius: 8, padding: 24, width: 340, maxWidth: "90vw", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: fontStack.display, fontWeight: 700, fontSize: 17, color: INK }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: FADED }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
