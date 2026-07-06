import React, { useState, useEffect } from "react";
import { Plus, Users, Wallet, ClipboardList, X, Loader2, AlertTriangle, LogOut, Mail, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import {
  sanitizeSiteCode,
  fetchWorkers,
  addWorker as apiAddWorker,
  addWorkersBulk as apiAddWorkersBulk,
  updateWorker as apiUpdateWorker,
  removeWorker as apiRemoveWorker,
  fetchAttendance,
  saveAttendanceForDate,
  fetchPayments,
  addPayment as apiAddPayment,
  deletePayment as apiDeletePayment,
} from "./data";
import {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  onAuthStateChange,
  createSite,
  inviteToSite,
  fetchMySites,
} from "./auth";

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
function monthStr(dateStr) {
  return dateStr.slice(0, 7);
}

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState("login"); // 'login' | 'signup'
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authMessage, setAuthMessage] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [mySites, setMySites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [newSiteCode, setNewSiteCode] = useState("");

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState(null);

  const [activeSite, setActiveSite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [section, setSection] = useState("daily"); // 'daily' | 'monthly'
  const [tab, setTab] = useState("today");

  const [workers, setWorkers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [payments, setPayments] = useState([]);

  const [showWorkerForm, setShowWorkerForm] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState(null);
  const [workerForm, setWorkerForm] = useState({ name: "", dailyRate: "", monthlySalary: "" });
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState({ valid: [], invalid: [] });
  const [bulkMode, setBulkMode] = useState("paste"); // 'paste' | 'file'
  const [fileHeaders, setFileHeaders] = useState([]);
  const [fileDataRows, setFileDataRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [nameColIdx, setNameColIdx] = useState("");
  const [rateColIdx, setRateColIdx] = useState("");
  const [fileError, setFileError] = useState(null);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ date: todayStr(), workerId: "", amount: "", type: "advance", notes: "" });

  const [attendanceDate, setAttendanceDate] = useState(todayStr());
  const [draftStatus, setDraftStatus] = useState({});
  const [paymentSortField, setPaymentSortField] = useState("date");
  const [paymentSortDir, setPaymentSortDir] = useState("desc");

  useEffect(() => {
    loadFonts();
  }, []);

  useEffect(() => {
    let unsubscribe;
    (async () => {
      const user = await getCurrentUser();
      setCurrentUser(user);
      setAuthLoading(false);
      unsubscribe = onAuthStateChange((u) => setCurrentUser(u));
    })();
    return () => unsubscribe && unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setMySites([]);
      return;
    }
    loadMySites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  async function loadMySites() {
    setSitesLoading(true);
    const res = await fetchMySites();
    if (res.ok) setMySites(res.data);
    setSitesLoading(false);
  }

  async function handleAuthSubmit() {
    if (!authForm.email || !authForm.password) return;
    setAuthBusy(true);
    setAuthError(null);
    setAuthMessage(null);
    if (authView === "signup") {
      const res = await signUp(authForm.email, authForm.password);
      setAuthBusy(false);
      if (!res.ok) {
        setAuthError(res.error?.message || "Could not create account.");
        return;
      }
      if (!res.data?.session) {
        setAuthMessage("Check your email to confirm your account, then log in.");
        setAuthView("login");
      }
    } else {
      const res = await signIn(authForm.email, authForm.password);
      setAuthBusy(false);
      if (!res.ok) {
        setAuthError(res.error?.message || "Could not log in. Check your email and password.");
        return;
      }
    }
  }

  async function handleSignOut() {
    await signOut();
    setActiveSite(null);
    setMySites([]);
  }

  async function handleCreateSite() {
    const normalized = sanitizeSiteCode(newSiteCode);
    if (!normalized) return;
    setSitesLoading(true);
    const res = await createSite(normalized);
    setSitesLoading(false);
    if (!res.ok) {
      setError(`Could not create this site (${res.error?.message || "unknown error"}).`);
      return;
    }
    setNewSiteCode("");
    await loadMySites();
  }

  async function handleInvite() {
    if (!inviteEmail) return;
    const res = await inviteToSite(activeSite, inviteEmail);
    if (!res.ok) {
      setInviteMessage({ type: "error", text: res.error?.message || "Could not send this invite." });
      return;
    }
    setInviteMessage({ type: "success", text: `Invited ${inviteEmail}. They'll get access as soon as they sign up or log in with that email.` });
    setInviteEmail("");
  }

  useEffect(() => {
    if (!activeSite) return;
    const existing = {};
    attendance.filter((a) => a.date === attendanceDate).forEach((a) => (existing[a.workerId] = a.status));
    setDraftStatus(existing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceDate, activeSite]);

  function mapWorker(w) {
    return { id: w.id, name: w.name, payType: w.pay_type, dailyRate: w.daily_rate, monthlySalary: w.monthly_salary };
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

    const [w, a, p] = await Promise.all([fetchWorkers(normalized), fetchAttendance(normalized), fetchPayments(normalized)]);
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
    const [w, a, p] = await Promise.all([fetchWorkers(activeSite), fetchAttendance(activeSite), fetchPayments(activeSite)]);
    if (w.ok) setWorkers(w.data.map(mapWorker));
    if (a.ok) setAttendance(a.data.map(mapAttendance));
    if (p.ok) setPayments(p.data.map(mapPayment));
  }

  function switchSection(next) {
    setSection(next);
    setTab(next === "daily" ? "today" : "workers");
  }

  const sectionWorkers = workers.filter((w) => w.payType === section).sort((a, b) => a.name.localeCompare(b.name));

  function workerById(id) {
    return workers.find((w) => w.id === id);
  }

  function openAddWorker() {
    setEditingWorkerId(null);
    setWorkerForm({ name: "", dailyRate: "", monthlySalary: "" });
    setShowWorkerForm(true);
  }

  function openBulkAdd() {
    setBulkText("");
    setBulkPreview({ valid: [], invalid: [] });
    setBulkMode("paste");
    setFileHeaders([]);
    setFileDataRows([]);
    setFileName("");
    setNameColIdx("");
    setRateColIdx("");
    setFileError(null);
    setShowBulkForm(true);
  }

  function parseBulkText(text) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const valid = [];
    const invalid = [];
    lines.forEach((line) => {
      const parts = line.split(/,|\t/).map((p) => p.trim()).filter(Boolean);
      const rateValue = parts[1] ? parseFloat(parts[1]) : NaN;
      if (parts.length >= 2 && parts[0] && !isNaN(rateValue) && rateValue > 0) {
        valid.push({
          name: parts[0],
          payType: section,
          dailyRate: section === "daily" ? rateValue : null,
          monthlySalary: section === "monthly" ? rateValue : null,
        });
      } else {
        invalid.push(line);
      }
    });
    return { valid, invalid };
  }

  function handleBulkTextChange(text) {
    setBulkText(text);
    setBulkPreview(parseBulkText(text));
  }

  function guessColumn(headers, keywords) {
    const idx = headers.findIndex((h) => keywords.some((k) => String(h).toLowerCase().includes(k)));
    return idx >= 0 ? String(idx) : "";
  }

  function handleFileSelect(file) {
    if (!file) return;
    setFileError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
        if (!rows.length) {
          setFileError("This file appears to be empty.");
          return;
        }
        const headers = rows[0].map((h) => String(h).trim());
        const dataRows = rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ""));
        setFileHeaders(headers);
        setFileDataRows(dataRows);
        setNameColIdx(guessColumn(headers, ["name", "worker", "employee"]));
        setRateColIdx(guessColumn(headers, section === "daily" ? ["rate", "daily", "wage"] : ["salary", "monthly", "pay"]));
      } catch (err) {
        setFileError("Could not read this file. Make sure it's a valid .xlsx, .xls, or .csv file.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  useEffect(() => {
    if (bulkMode !== "file" || nameColIdx === "" || rateColIdx === "") {
      if (bulkMode === "file") setBulkPreview({ valid: [], invalid: [] });
      return;
    }
    const nIdx = parseInt(nameColIdx, 10);
    const rIdx = parseInt(rateColIdx, 10);
    const valid = [];
    const invalid = [];
    fileDataRows.forEach((row) => {
      const name = String(row[nIdx] ?? "").trim();
      const rateValue = parseFloat(row[rIdx]);
      if (name && !isNaN(rateValue) && rateValue > 0) {
        valid.push({
          name,
          payType: section,
          dailyRate: section === "daily" ? rateValue : null,
          monthlySalary: section === "monthly" ? rateValue : null,
        });
      } else {
        invalid.push(row.join(", "));
      }
    });
    setBulkPreview({ valid, invalid });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkMode, nameColIdx, rateColIdx, fileDataRows, section]);

  async function handleBulkSubmit() {
    if (bulkPreview.valid.length === 0) return;
    setSaving(true);
    const res = await apiAddWorkersBulk(activeSite, bulkPreview.valid);
    setSaving(false);
    if (!res.ok) {
      setError(`Could not save these workers (${res.error?.message || "unknown error"}). Please try again.`);
      return;
    }
    setWorkers([...workers, ...res.data.map(mapWorker)]);
    setBulkText("");
    setBulkPreview({ valid: [], invalid: [] });
    setFileHeaders([]);
    setFileDataRows([]);
    setFileName("");
    setShowBulkForm(false);
  }

  function openEditWorker(worker) {
    setEditingWorkerId(worker.id);
    setWorkerForm({ name: worker.name, dailyRate: worker.dailyRate || "", monthlySalary: worker.monthlySalary || "" });
    setShowWorkerForm(true);
  }

  async function handleSaveWorker() {
    if (!workerForm.name) return;
    if (section === "daily" && !workerForm.dailyRate) return;
    if (section === "monthly" && !workerForm.monthlySalary) return;
    setSaving(true);
    const payload = {
      name: workerForm.name,
      payType: section,
      dailyRate: workerForm.dailyRate ? parseFloat(workerForm.dailyRate) : null,
      monthlySalary: workerForm.monthlySalary ? parseFloat(workerForm.monthlySalary) : null,
    };
    const res = editingWorkerId ? await apiUpdateWorker(editingWorkerId, payload) : await apiAddWorker(activeSite, payload);
    setSaving(false);
    if (!res.ok) {
      setError(`Could not save this worker (${res.error?.message || "unknown error"}). Please try again.`);
      return;
    }
    if (editingWorkerId) {
      setWorkers(workers.map((w) => (w.id === editingWorkerId ? mapWorker(res.data) : w)));
    } else {
      setWorkers([...workers, mapWorker(res.data)]);
    }
    setWorkerForm({ name: "", dailyRate: "", monthlySalary: "" });
    setEditingWorkerId(null);
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
    const entries = sectionWorkers
      .filter((w) => draftStatus[w.id])
      .map((w) => {
        const status = draftStatus[w.id];
        if (section === "daily") {
          const rate = parseFloat(w.dailyRate) || 0;
          const wage = status === "present" ? rate : status === "half" ? rate / 2 : 0;
          return { workerId: w.id, status, wage };
        }
        // Monthly workers get an attendance record for leave tracking only —
        // it never drives a wage calculation.
        return { workerId: w.id, status, wage: 0 };
      });
    setSaving(true);
    const res = await saveAttendanceForDate(activeSite, attendanceDate, entries);
    setSaving(false);
    if (!res.ok) {
      setError(`Could not save attendance for ${attendanceDate} (${res.error?.message || "unknown error"}).`);
      return;
    }
    await refreshAll();
  }

  async function handleAddPayment() {
    if (!paymentForm.workerId || !paymentForm.amount) return;
    setSaving(true);
    const res = await apiAddPayment(activeSite, { ...paymentForm, amount: parseFloat(paymentForm.amount) });
    setSaving(false);
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

  function openLogSalary(worker) {
    setPaymentForm({ date: todayStr(), workerId: worker.id, amount: worker.monthlySalary, type: "salary", notes: `Salary for ${monthStr(todayStr())}` });
    setShowPaymentForm(true);
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function buildLedgerSummaryText() {
    const rows = ledger.filter((w) => w.payType === section).sort((a, b) => a.name.localeCompare(b.name));
    const lines = rows.map((w) =>
      section === "daily"
        ? `${w.name}: earned ₹${fmt(w.totalEarned)}, paid ₹${fmt(w.totalPaid)}, balance ₹${fmt(w.balance)}`
        : `${w.name}: ₹${w.monthlySalary}/month — ${w.thisMonthPaid ? "paid this month" : "not yet paid this month"}${w.lastPaid ? `, last paid ${w.lastPaid}` : ""}`
    );
    const title = section === "daily" ? "Daily-Wage Ledger" : "Monthly-Salary Ledger";
    return `${activeSite} — ${title}\n${todayStr()}\n\n${lines.join("\n")}`;
  }

  function downloadLedgerCsv() {
    const rows = ledger.filter((w) => w.payType === section).sort((a, b) => a.name.localeCompare(b.name));
    const header =
      section === "daily"
        ? ["Worker", "Present", "Half", "Absent", "Earned", "Paid", "Balance"]
        : ["Worker", "Monthly Salary", "Present", "Absent", "Last Paid", "Paid This Month"];
    const body =
      section === "daily"
        ? rows.map((w) => [w.name, w.daysPresent, w.daysHalf, w.daysAbsent, fmt(w.totalEarned), fmt(w.totalPaid), fmt(w.balance)])
        : rows.map((w) => [w.name, w.monthlySalary, w.daysPresent, w.daysAbsent, w.lastPaid || "", w.thisMonthPaid ? "Yes" : "No"]);
    downloadCsv(`${activeSite}_${section}_ledger.csv`, [header, ...body]);
  }

  function shareLedgerOnWhatsApp() {
    const url = `https://wa.me/?text=${encodeURIComponent(buildLedgerSummaryText())}`;
    window.open(url, "_blank");
  }

  function copyLedgerSummary() {
    navigator.clipboard?.writeText(buildLedgerSummaryText());
  }

  const ledger = workers.map((w) => {
    const wa = attendance.filter((a) => a.workerId === w.id);
    const daysPresent = wa.filter((a) => a.status === "present").length;
    const daysAbsent = wa.filter((a) => a.status === "absent").length;
    if (w.payType === "daily") {
      const daysHalf = wa.filter((a) => a.status === "half").length;
      const totalEarned = wa.reduce((s, a) => s + (parseFloat(a.wage) || 0), 0);
      const totalPaid = payments.filter((p) => p.workerId === w.id).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      return { ...w, daysPresent, daysHalf, daysAbsent, totalEarned, totalPaid, balance: totalEarned - totalPaid };
    }
    const salaryPayments = payments.filter((p) => p.workerId === w.id && p.type === "salary");
    const totalPaid = payments.filter((p) => p.workerId === w.id).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const lastPaid = salaryPayments.length ? salaryPayments.sort((a, b) => (a.date < b.date ? 1 : -1))[0].date : null;
    const thisMonthPaid = salaryPayments.some((p) => monthStr(p.date) === monthStr(todayStr()));
    return { ...w, daysPresent, daysAbsent, totalPaid, lastPaid, thisMonthPaid };
  });

  if (authLoading) {
    return (
      <div style={{ background: PAPER, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <Loader2 size={24} className="spin" color={AMBER} />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div style={{ background: PAPER, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, fontFamily: fontStack.body }}>
        <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <ClipboardList size={30} color={AMBER} style={{ marginBottom: 14 }} />
        <div style={{ fontFamily: fontStack.display, fontSize: 26, fontWeight: 700, color: INK, marginBottom: 6, textAlign: "center" }}>Labor Register</div>
        <div style={{ color: FADED, fontSize: 14, marginBottom: 22, textAlign: "center", maxWidth: 320 }}>
          {authView === "signup" ? "Create an account to get started." : "Log in to see your sites."}
        </div>
        <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            value={authForm.email}
            onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
            placeholder="Email"
            type="email"
            style={{ fontSize: 14, padding: "10px 12px", border: `1.5px solid ${INK}`, borderRadius: 4, background: "#fff", outline: "none", color: CHARCOAL, width: "100%", boxSizing: "border-box" }}
          />
          <input
            value={authForm.password}
            onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && handleAuthSubmit()}
            placeholder="Password"
            type="password"
            style={{ fontSize: 14, padding: "10px 12px", border: `1.5px solid ${INK}`, borderRadius: 4, background: "#fff", outline: "none", color: CHARCOAL, width: "100%", boxSizing: "border-box" }}
          />
          <button onClick={handleAuthSubmit} disabled={authBusy} style={{ background: INK, color: PAPER, border: "none", borderRadius: 4, padding: "10px 18px", fontFamily: fontStack.body, fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {authBusy ? <Loader2 size={15} className="spin" /> : authView === "signup" ? "Create Account" : "Log In"}
          </button>
        </div>
        <button
          onClick={() => { setAuthView(authView === "signup" ? "login" : "signup"); setAuthError(null); setAuthMessage(null); }}
          style={{ background: "none", border: "none", color: FADED, fontSize: 13, marginTop: 14, cursor: "pointer", textDecoration: "underline" }}
        >
          {authView === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
        </button>
        {authMessage && <div style={{ color: GREEN, fontSize: 13, marginTop: 14, maxWidth: 320, textAlign: "center" }}>{authMessage}</div>}
        {authError && <div style={{ color: RUST, fontSize: 13, marginTop: 14, maxWidth: 320, textAlign: "center" }}>{authError}</div>}
      </div>
    );
  }

  if (!activeSite) {
    return (
      <div style={{ background: PAPER, minHeight: "100vh", fontFamily: fontStack.body }}>
        <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ background: INK, color: PAPER, padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: fontStack.display, fontSize: 20, fontWeight: 700 }}>Labor Register</div>
          <button onClick={handleSignOut} style={{ background: "transparent", border: `1px solid ${PAPER}55`, color: PAPER, borderRadius: 4, padding: "8px 12px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
        <div style={{ padding: 24, maxWidth: 500, margin: "0 auto" }}>
          <div style={{ fontFamily: fontStack.display, fontSize: 18, fontWeight: 700, color: INK, marginBottom: 4 }}>Your Sites</div>
          <div style={{ color: FADED, fontSize: 13, marginBottom: 20 }}>{currentUser.email}</div>

          {sitesLoading ? (
            <Loader2 size={18} className="spin" color={AMBER} />
          ) : mySites.length === 0 ? (
            <div style={{ color: FADED, fontSize: 13, marginBottom: 20 }}>You're not a member of any site yet — create one below, or ask someone to invite your email to theirs.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
              {mySites.map((s) => (
                <button
                  key={s.site_code}
                  onClick={() => openSite(s.site_code)}
                  style={{ textAlign: "left", background: "#fff", border: `1.5px solid ${PAPER_LINE}`, borderRadius: 6, padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span style={{ fontFamily: fontStack.mono, fontWeight: 600, color: CHARCOAL }}>{s.site_code}</span>
                  <span style={{ fontSize: 11, color: FADED, textTransform: "uppercase" }}>{s.role}</span>
                </button>
              ))}
            </div>
          )}

          <div style={{ borderTop: `1px solid ${PAPER_LINE}`, paddingTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: CHARCOAL, marginBottom: 8 }}>Create a new site</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={newSiteCode}
                onChange={(e) => setNewSiteCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateSite()}
                placeholder="e.g. SHARMA-SITE-01"
                style={{ fontFamily: fontStack.mono, fontSize: 14, padding: "10px 12px", border: `1.5px solid ${INK}`, borderRadius: 4, background: "#fff", flex: 1, minWidth: 160, outline: "none", color: CHARCOAL }}
              />
              <button onClick={handleCreateSite} style={{ background: AMBER, color: "#fff", border: "none", borderRadius: 4, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                Create
              </button>
            </div>
          </div>

          {error && <div style={{ color: RUST, fontSize: 13, marginTop: 16 }}>{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: PAPER, minHeight: "100vh", fontFamily: fontStack.body }}>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ background: INK, color: PAPER, padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: fontStack.display, fontSize: 20, fontWeight: 700 }}>Labor Register</div>
          <div style={{ fontFamily: fontStack.mono, fontSize: 11, color: "#9DB5B3" }}>{activeSite}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saving && <Loader2 size={14} className="spin" style={{ opacity: 0.7 }} />}
          <button onClick={() => { setInviteEmail(""); setInviteMessage(null); setShowInviteForm(true); }} style={{ background: "transparent", border: `1px solid ${PAPER}55`, color: PAPER, borderRadius: 4, padding: "8px 12px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <Mail size={13} /> Invite
          </button>
          <button onClick={() => setActiveSite(null)} style={{ background: "transparent", border: `1px solid ${PAPER}55`, color: PAPER, borderRadius: 4, padding: "8px 12px", cursor: "pointer", fontSize: 12 }}>
            Switch site
          </button>
        </div>
      </div>

      {/* Top-level split: everything below is scoped to one pay type at a time */}
      <div style={{ display: "flex", gap: 8, padding: "16px 24px 0", maxWidth: 960, margin: "0 auto" }}>
        {[
          { id: "daily", label: "Daily-Wage Workers" },
          { id: "monthly", label: "Monthly-Salary Workers" },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => switchSection(s.id)}
            style={{
              flex: 1,
              padding: "10px 8px",
              borderRadius: "6px 6px 0 0",
              border: `1.5px solid ${PAPER_LINE}`,
              background: section === s.id ? PAPER : "#EFE7D6",
              color: section === s.id ? INK : FADED,
              fontFamily: fontStack.display,
              fontWeight: 700,
              fontSize: 13,
              lineHeight: 1.3,
              cursor: "pointer",
              minHeight: 44,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", padding: "0 24px", borderBottom: `1px solid ${PAPER_LINE}`, gap: 4, flexWrap: "wrap", maxWidth: 960, margin: "0 auto" }}>
        {(section === "daily"
          ? [
              { id: "today", label: "Today's Attendance" },
              { id: "workers", label: "Workers" },
              { id: "payments", label: "Payments" },
              { id: "ledger", label: "Ledger" },
            ]
          : [
              { id: "today", label: "Attendance / Leave" },
              { id: "workers", label: "Workers" },
              { id: "payments", label: "Salary & Payments" },
              { id: "ledger", label: "Ledger" },
            ]
        ).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "none", border: "none", padding: "12px 6px", marginRight: 18, fontSize: 13, fontWeight: 600, color: tab === t.id ? INK : FADED, borderBottom: tab === t.id ? `2.5px solid ${AMBER}` : "2.5px solid transparent", cursor: "pointer" }}>
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {tab === "workers" && (
          <>
            <button onClick={openBulkAdd} style={{ ...secondaryBtnStyle, padding: "8px 14px", fontSize: 13, marginRight: 8 }}>Bulk Add</button>
            <button onClick={openAddWorker} style={addBtnStyle}><Plus size={15} /> Add Worker</button>
          </>
        )}
        {tab === "payments" && (
          <button onClick={() => { setPaymentForm({ date: todayStr(), workerId: "", amount: "", type: section === "daily" ? "advance" : "salary", notes: "" }); setShowPaymentForm(true); }} style={addBtnStyle}><Plus size={15} /> Log Payment</button>
        )}
      </div>

      {error && (
        <div style={{ background: "#FBEAE7", color: RUST, padding: "10px 24px", fontSize: 13, display: "flex", alignItems: "center", gap: 8, maxWidth: 960, margin: "0 auto" }}>
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
        {tab === "today" && (
          <>
            <Field label="Date">
              <input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} style={{ ...inputStyle, width: 170 }} />
            </Field>
            {sectionWorkers.length === 0 ? (
              <EmptyState icon={<Users size={22} color={FADED} />} text={`No ${section === "daily" ? "daily-wage" : "monthly-salary"} workers added yet.`} />
            ) : (
              <>
                <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontStack.mono, fontSize: 13, marginTop: 12, marginBottom: 16 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${INK}` }}>
                      {["Worker", "Status", section === "daily" ? "Wage" : "Note"].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sectionWorkers.map((w) => {
                      const status = draftStatus[w.id];
                      const rate = parseFloat(w.dailyRate) || 0;
                      const wage = status === "present" ? rate : status === "half" ? rate / 2 : 0;
                      return (
                        <tr key={w.id} style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{w.name}</td>
                          <td style={{ padding: "10px" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              {[{ id: "present", label: "Present", color: GREEN }, { id: "half", label: "Half", color: AMBER }, { id: "absent", label: "Absent", color: RUST }].map((opt) => (
                                <button key={opt.id} onClick={() => setDraftStatus({ ...draftStatus, [w.id]: opt.id })} style={{ background: status === opt.id ? opt.color : "transparent", color: status === opt.id ? "#fff" : opt.color, border: `1px solid ${opt.color}`, borderRadius: 4, padding: "7px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer", minHeight: 32 }}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{section === "daily" ? (status ? `₹${fmt(wage)}` : "—") : "For leave record only"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                <button onClick={saveAttendanceForDay} style={{ ...primaryBtnStyle, width: "auto" }}>Save Attendance for {attendanceDate}</button>
              </>
            )}
          </>
        )}

        {tab === "workers" && (
          <>
            {sectionWorkers.length === 0 ? (
              <EmptyState icon={<Users size={22} color={FADED} />} text="No workers added yet." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontStack.mono, fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${INK}` }}>
                      {["Name", section === "daily" ? "Daily Rate" : "Monthly Salary", "", ""].map((h, i) => <th key={i} style={thStyle}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sectionWorkers.map((w) => (
                      <tr key={w.id} style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{w.name}</td>
                        <td style={tdStyle}>₹{w.payType === "daily" ? `${w.dailyRate}/day` : `${w.monthlySalary}/month`}</td>
                        <td style={{ padding: "10px" }}><button onClick={() => openEditWorker(w)} style={{ ...linkBtnStyle, color: AMBER, fontWeight: 600 }}>Edit</button></td>
                        <td style={{ padding: "10px" }}><button onClick={() => handleRemoveWorker(w.id)} style={linkBtnStyle}>Remove</button></td>
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
            {payments.filter((p) => sectionWorkers.some((w) => w.id === p.workerId)).length === 0 ? (
              <EmptyState icon={<Wallet size={22} color={FADED} />} text="No payments logged yet." />
            ) : (
              <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontStack.mono, fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${INK}` }}>
                    <SortableTh label="Date" field="date" sortField={paymentSortField} sortDir={paymentSortDir} setSortField={setPaymentSortField} setSortDir={setPaymentSortDir} />
                    <th style={thStyle}>Worker</th>
                    <th style={thStyle}>Type</th>
                    <SortableTh label="Amount" field="amount" sortField={paymentSortField} sortDir={paymentSortDir} setSortField={setPaymentSortField} setSortDir={setPaymentSortDir} />
                    <th style={thStyle}>Notes</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {payments
                    .filter((p) => sectionWorkers.some((w) => w.id === p.workerId))
                    .sort((a, b) => {
                      const dir = paymentSortDir === "asc" ? 1 : -1;
                      if (paymentSortField === "amount") return (parseFloat(a.amount) - parseFloat(b.amount)) * dir;
                      return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) * dir;
                    })
                    .map((p) => (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
                      <td style={tdStyle}>{p.date}</td>
                      <td style={tdStyle}>{workerById(p.workerId)?.name || "(removed)"}</td>
                      <td style={{ ...tdStyle, textTransform: "capitalize" }}>{p.type}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>₹{p.amount}</td>
                      <td style={{ padding: "10px", color: FADED }}>{p.notes || "—"}</td>
                      <td style={{ padding: "10px" }}><button onClick={() => handleDeletePayment(p.id)} style={linkBtnStyle}>Remove</button></td>
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
            {ledger.filter((w) => w.payType === section).length === 0 ? (
              <EmptyState icon={<ClipboardList size={22} color={FADED} />} text="Add workers to see balances here." />
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <button onClick={downloadLedgerCsv} style={secondaryBtnStyle}>Download CSV</button>
                  <button onClick={shareLedgerOnWhatsApp} style={secondaryBtnStyle}>Share on WhatsApp</button>
                  <button onClick={copyLedgerSummary} style={secondaryBtnStyle}>Copy Summary</button>
                </div>
                {section === "daily" ? (
                  <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontStack.mono, fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${INK}` }}>
                        {["Worker", "Present", "Half", "Absent", "Earned", "Paid", "Balance"].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.filter((w) => w.payType === "daily").sort((a, b) => a.name.localeCompare(b.name)).map((w) => (
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
                ) : (
                  <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontStack.mono, fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${INK}` }}>
                        {["Worker", "Monthly Salary", "Present", "Absent", "Last Paid", "This Month", ""].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.filter((w) => w.payType === "monthly").sort((a, b) => a.name.localeCompare(b.name)).map((w) => (
                        <tr key={w.id} style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{w.name}</td>
                          <td style={tdStyle}>₹{w.monthlySalary}</td>
                          <td style={tdStyle}>{w.daysPresent}</td>
                          <td style={tdStyle}>{w.daysAbsent}</td>
                          <td style={tdStyle}>{w.lastPaid || "—"}</td>
                          <td style={{ padding: "10px", fontWeight: 700, color: w.thisMonthPaid ? GREEN : RUST }}>{w.thisMonthPaid ? "Paid" : "Not yet"}</td>
                          <td style={{ padding: "10px" }}>
                            {!w.thisMonthPaid && (
                              <button onClick={() => openLogSalary(w)} style={{ ...linkBtnStyle, color: AMBER, fontWeight: 600 }}>Log this month's salary</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {showWorkerForm && (
        <Modal onClose={() => setShowWorkerForm(false)} title={editingWorkerId ? "Edit Worker" : `Add a ${section === "daily" ? "Daily-Wage" : "Monthly-Salary"} Worker`}>
          <Field label="Name">
            <input value={workerForm.name} onChange={(e) => setWorkerForm({ ...workerForm, name: e.target.value })} placeholder="e.g. Ramesh Kumar" style={inputStyle} />
          </Field>
          {section === "daily" ? (
            <Field label="Daily rate (₹)">
              <input type="number" value={workerForm.dailyRate} onChange={(e) => setWorkerForm({ ...workerForm, dailyRate: e.target.value })} placeholder="e.g. 500" style={inputStyle} />
            </Field>
          ) : (
            <Field label="Monthly salary (₹)">
              <input type="number" value={workerForm.monthlySalary} onChange={(e) => setWorkerForm({ ...workerForm, monthlySalary: e.target.value })} placeholder="e.g. 15000" style={inputStyle} />
            </Field>
          )}
          <button onClick={handleSaveWorker} disabled={saving} style={{ ...primaryBtnStyle, opacity: saving ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {saving && <Loader2 size={15} className="spin" />}
            {saving ? "Saving..." : editingWorkerId ? "Save Changes" : "Save Worker"}
          </button>
        </Modal>
      )}

      {showBulkForm && (
        <Modal onClose={() => setShowBulkForm(false)} title={`Bulk Add ${section === "daily" ? "Daily-Wage" : "Monthly-Salary"} Workers`} width={440}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[{ id: "paste", label: "Paste a List" }, { id: "file", label: "Upload Excel/CSV" }].map((m) => (
              <button
                key={m.id}
                onClick={() => setBulkMode(m.id)}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: 4,
                  border: `1.5px solid ${bulkMode === m.id ? INK : PAPER_LINE}`,
                  background: bulkMode === m.id ? INK : "#fff",
                  color: bulkMode === m.id ? PAPER : CHARCOAL,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {bulkMode === "paste" ? (
            <>
              <div style={{ fontSize: 12, color: FADED, marginBottom: 10 }}>
                One worker per line: <strong>Name, {section === "daily" ? "Daily Rate" : "Monthly Salary"}</strong>
                <br />
                Example: <span style={{ fontFamily: fontStack.mono }}>Ramesh Kumar, {section === "daily" ? "500" : "15000"}</span>
              </div>
              <textarea
                value={bulkText}
                onChange={(e) => handleBulkTextChange(e.target.value)}
                placeholder={`Ramesh Kumar, ${section === "daily" ? "500" : "15000"}\nSuresh Patil, ${section === "daily" ? "450" : "14000"}\n...`}
                rows={7}
                style={{ ...inputStyle, fontFamily: fontStack.mono, resize: "vertical" }}
              />
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: FADED, marginBottom: 10 }}>
                Upload a .xlsx, .xls, or .csv file with a header row. You'll pick which columns are the name and the{" "}
                {section === "daily" ? "daily rate" : "monthly salary"} next.
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  border: `1.5px dashed ${PAPER_LINE}`,
                  borderRadius: 6,
                  padding: "20px",
                  cursor: "pointer",
                  color: FADED,
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                <Upload size={16} />
                {fileName || "Click to choose a file"}
                <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => handleFileSelect(e.target.files?.[0])} style={{ display: "none" }} />
              </label>
              {fileError && <div style={{ color: RUST, fontSize: 12, marginBottom: 10 }}>{fileError}</div>}
              {fileHeaders.length > 0 && (
                <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
                  <Field label="Name column">
                    <select value={nameColIdx} onChange={(e) => setNameColIdx(e.target.value)} style={inputStyle}>
                      <option value="">Select column</option>
                      {fileHeaders.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </Field>
                  <Field label={section === "daily" ? "Rate column" : "Salary column"}>
                    <select value={rateColIdx} onChange={(e) => setRateColIdx(e.target.value)} style={inputStyle}>
                      <option value="">Select column</option>
                      {fileHeaders.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </Field>
                </div>
              )}
            </>
          )}

          {((bulkMode === "paste" && bulkText.trim()) || (bulkMode === "file" && nameColIdx !== "" && rateColIdx !== "")) && (
            <div style={{ marginTop: 10, fontSize: 12 }}>
              <div style={{ color: GREEN, fontWeight: 600, marginBottom: 4 }}>{bulkPreview.valid.length} worker{bulkPreview.valid.length !== 1 ? "s" : ""} ready to add</div>
              {bulkPreview.invalid.length > 0 && (
                <div style={{ color: RUST }}>
                  {bulkPreview.invalid.length} row{bulkPreview.invalid.length !== 1 ? "s" : ""} couldn't be read (need a name and a positive number):
                  <ul style={{ margin: "4px 0 0 18px", padding: 0, maxHeight: 90, overflowY: "auto" }}>
                    {bulkPreview.invalid.map((line, i) => <li key={i} style={{ fontFamily: fontStack.mono }}>{line}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleBulkSubmit}
            disabled={bulkPreview.valid.length === 0 || saving}
            style={{ ...primaryBtnStyle, opacity: bulkPreview.valid.length === 0 || saving ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {saving && <Loader2 size={15} className="spin" />}
            {saving ? "Saving..." : `Add ${bulkPreview.valid.length || ""} Worker${bulkPreview.valid.length !== 1 ? "s" : ""}`}
          </button>
        </Modal>
      )}

      {showInviteForm && (
        <Modal onClose={() => setShowInviteForm(false)} title="Invite Someone to This Site">
          <div style={{ fontSize: 12, color: FADED, marginBottom: 10 }}>
            They'll get access to <strong>{activeSite}</strong> as soon as they sign up (or log in, if they already
            have an account) using this email address.
          </div>
          <Field label="Email address">
            <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="e.g. manager@example.com" type="email" style={inputStyle} />
          </Field>
          {inviteMessage && (
            <div style={{ fontSize: 12, marginBottom: 10, color: inviteMessage.type === "error" ? RUST : GREEN }}>{inviteMessage.text}</div>
          )}
          <button onClick={handleInvite} disabled={!inviteEmail} style={{ ...primaryBtnStyle, opacity: !inviteEmail ? 0.5 : 1 }}>Send Invite</button>
        </Modal>
      )}

      {showPaymentForm && (
        <Modal onClose={() => setShowPaymentForm(false)} title={`Log a Payment — ${section === "daily" ? "Daily-Wage" : "Monthly-Salary"}`}>
          <Field label="Worker">
            <select value={paymentForm.workerId} onChange={(e) => setPaymentForm({ ...paymentForm, workerId: e.target.value })} style={inputStyle}>
              <option value="">Select worker</option>
              {sectionWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Amount (₹)">
            <input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Type">
            <select value={paymentForm.type} onChange={(e) => setPaymentForm({ ...paymentForm, type: e.target.value })} style={inputStyle}>
              {section === "monthly" && <option value="salary">Monthly Salary</option>}
              <option value="advance">Advance</option>
              <option value="settlement">Settlement</option>
            </select>
          </Field>
          <Field label="Notes — optional">
            <input value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} style={inputStyle} />
          </Field>
          <button onClick={handleAddPayment} style={primaryBtnStyle}>Save Payment</button>
        </Modal>
      )}
    </div>
  );
}

const thStyle = { textAlign: "left", padding: "8px 10px", color: FADED, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: fontStack.body };
const tdStyle = { padding: "10px", color: CHARCOAL };
const linkBtnStyle = { background: "none", border: "none", color: FADED, cursor: "pointer", fontSize: 12, fontFamily: fontStack.body };
const inputStyle = { width: "100%", padding: "9px 10px", border: `1.5px solid ${PAPER_LINE}`, borderRadius: 4, fontSize: 14, fontFamily: "'Inter', system-ui, sans-serif", outline: "none", boxSizing: "border-box", color: CHARCOAL, background: "#fff" };
const primaryBtnStyle = { background: INK, color: PAPER, border: "none", borderRadius: 4, padding: "11px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer", width: "100%", marginTop: 8 };
const addBtnStyle = { background: AMBER, color: "#fff", border: "none", borderRadius: 4, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, margin: "8px 0" };
const secondaryBtnStyle = { background: "#fff", color: INK, border: `1.5px solid ${INK}`, borderRadius: 4, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: fontStack.body };

function SortableTh({ label, field, sortField, sortDir, setSortField, setSortDir }) {
  const active = sortField === field;
  return (
    <th
      onClick={() => {
        if (active) setSortDir(sortDir === "asc" ? "desc" : "asc");
        else {
          setSortField(field);
          setSortDir(field === "date" ? "desc" : "asc");
        }
      }}
      style={{
        textAlign: "left",
        padding: "8px 10px",
        color: active ? INK : FADED,
        fontWeight: 600,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        fontFamily: fontStack.body,
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      {label} {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}

function Field({ label, children }) {
  return <div style={{ marginBottom: 14 }}><div style={{ fontSize: 12, color: FADED, marginBottom: 5, fontWeight: 600 }}>{label}</div>{children}</div>;
}
function EmptyState({ icon, text }) {
  return <div style={{ textAlign: "center", padding: "50px 20px", color: FADED }}><div style={{ marginBottom: 8 }}>{icon}</div><div style={{ fontSize: 13 }}>{text}</div></div>;
}
function Modal({ title, onClose, children, width = 340 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(31,58,61,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PAPER, borderRadius: 8, padding: 24, width, maxWidth: "90vw", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: fontStack.display, fontWeight: 700, fontSize: 17, color: INK }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: FADED }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
