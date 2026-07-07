import React, { useState, useEffect } from "react";
import { Plus, Users, Wallet, ClipboardList, X, Loader2, AlertTriangle, LogOut, Mail, Upload, Search, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import {
  sanitizeSiteCode,
  fetchWorkers,
  addWorker as apiAddWorker,
  addWorkersBulk as apiAddWorkersBulk,
  updateWorker as apiUpdateWorker,
  removeWorker as apiRemoveWorker,
  deactivateWorker as apiDeactivateWorker,
  reactivateWorker as apiReactivateWorker,
  uploadWorkerPhoto,
  removeWorkerPhoto,
  uploadAttendancePhoto,
  fetchAttendance,
  saveAttendanceForDate,
  fetchPayments,
  addPayment as apiAddPayment,
  deletePayment as apiDeletePayment,
  fetchSiteSettings,
  updateSiteSettings,
  fetchAttendanceAuditLog,
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
// India doesn't observe daylight saving, so a fixed UTC+5:30 offset is
// accurate year-round. This matters specifically because of the
// attendance lock (migration_008): if this used the browser's raw UTC
// date instead, a supervisor working right around midnight IST could see
// a different "today" here than the database uses to decide what's
// still editable — this keeps both sides of that decision in sync.
// Resizes and re-encodes a photo entirely in the browser before it's ever
// uploaded — a typical phone camera photo (2-5MB) becomes ~100-300KB JPEG,
// with no visible quality loss for a small identification/verification
// photo. This matters a lot at scale: with photo verification used across
// many workers and many sites, uncompressed uploads would burn through
// storage 10-15x faster than necessary. Falls back to the original file
// if compression fails for any reason (corrupt image, etc.) rather than
// blocking the person from uploading at all.
function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => {
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(file); // fall back to original rather than fail silently
                return;
              }
              const compressedFile = new File(
                [blob],
                file.name.replace(/\.[^.]+$/, "") + ".jpg",
                { type: "image/jpeg", lastModified: Date.now() }
              );
              resolve(compressedFile);
            },
            "image/jpeg",
            quality
          );
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    } catch (e) {
      resolve(file);
    }
  });
}

function todayStr() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
function monthStr(dateStr) {
  return dateStr.slice(0, 7);
}

// Translations cover navigation, labels, buttons, and stat headers — the
// highest-visibility text a site supervisor sees every day. Error messages
// and less-common notes stay in English in this version; that's a known,
// documented gap (see README), not an oversight. Add more languages by
// adding another key alongside "en" and "hi" for each entry.
const TRANSLATIONS = {
  appTitle: { en: "Labor Register", hi: "मजदूर रजिस्टर" },
  yourSites: { en: "Your Sites", hi: "आपकी साइटें" },
  switchSite: { en: "Switch site", hi: "साइट बदलें" },
  signOut: { en: "Sign out", hi: "साइन आउट करें" },
  invite: { en: "Invite", hi: "आमंत्रित करें" },
  dailyWorkersTab: { en: "Daily-Wage Workers", hi: "दैनिक मजदूरी कर्मचारी" },
  monthlyWorkersTab: { en: "Monthly-Salary Workers", hi: "मासिक वेतन कर्मचारी" },
  todaysAttendance: { en: "Today's Attendance", hi: "आज की हाजिरी" },
  attendanceLeave: { en: "Attendance / Leave", hi: "हाजिरी / छुट्टी" },
  workersTab: { en: "Workers", hi: "कर्मचारी" },
  paymentsTab: { en: "Payments", hi: "भुगतान" },
  salaryPaymentsTab: { en: "Salary & Payments", hi: "वेतन और भुगतान" },
  ledgerTab: { en: "Ledger", hi: "बही-खाता" },
  addWorker: { en: "Add Worker", hi: "कर्मचारी जोड़ें" },
  bulkAdd: { en: "Bulk Add", hi: "एक साथ जोड़ें" },
  logPayment: { en: "Log Payment", hi: "भुगतान दर्ज करें" },
  present: { en: "Present", hi: "उपस्थित" },
  half: { en: "Half", hi: "आधा दिन" },
  absent: { en: "Absent", hi: "अनुपस्थित" },
  saveAttendance: { en: "Save Attendance for", hi: "हाजिरी सेव करें" },
  saving: { en: "Saving...", hi: "सेव हो रहा है..." },
  workersCount: { en: "Workers", hi: "कर्मचारी" },
  totalEarned: { en: "Total Earned (all time)", hi: "कुल कमाई (अब तक)" },
  totalPaidOut: { en: "Total Paid Out", hi: "कुल भुगतान" },
  totalOwed: { en: "Total Owed", hi: "कुल बकाया" },
  thisMonthCost: { en: "This Month's Labor Cost", hi: "इस महीने की मजदूरी लागत" },
  downloadCsv: { en: "Download CSV", hi: "CSV डाउनलोड करें" },
  shareWhatsApp: { en: "Share on WhatsApp", hi: "व्हाट्सएप पर भेजें" },
  copySummary: { en: "Copy Summary", hi: "सारांश कॉपी करें" },
  edit: { en: "Edit", hi: "बदलें" },
  remove: { en: "Remove", hi: "हटाएं" },
  name: { en: "Name", hi: "नाम" },
  save: { en: "Save", hi: "सेव करें" },
};

function t(key, lang) {
  return TRANSLATIONS[key]?.[lang] || TRANSLATIONS[key]?.en || key;
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
  const [siteMonthlyCosts, setSiteMonthlyCosts] = useState({}); // site_code -> number
  const [costsLoading, setCostsLoading] = useState(false);

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteMessage, setInviteMessage] = useState(null);

  const [myRole, setMyRole] = useState("member"); // role in the currently active site
  const isViewer = myRole === "viewer";

  const [absenceThreshold, setAbsenceThreshold] = useState(20);
  const [showSettingsForm, setShowSettingsForm] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState("20");
  const [savingSettings, setSavingSettings] = useState(false);

  const [lang, setLang] = useState("en");

  const [uploadingPhotoFor, setUploadingPhotoFor] = useState(null); // workerId currently uploading a profile photo
  const [confirmDeleteWorker, setConfirmDeleteWorker] = useState(null); // worker object pending delete confirmation
  const [confirmDeletePayment, setConfirmDeletePayment] = useState(null); // payment object pending delete confirmation
  const [workerSearchTerm, setWorkerSearchTerm] = useState("");
  const [showInactiveWorkers, setShowInactiveWorkers] = useState(false);
  const [workerSortField, setWorkerSortField] = useState("name");
  const [workerSortDir, setWorkerSortDir] = useState("asc");

  const [capturingPhotoFor, setCapturingPhotoFor] = useState(null); // workerId currently capturing today's verification photo
  const [draftPhotos, setDraftPhotos] = useState({}); // workerId -> { photoUrl, locationLat, locationLng, capturedAt } for today's attendanceDate

  const [showAuditLog, setShowAuditLog] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [auditLogLoading, setAuditLogLoading] = useState(false);

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
  const [workerForm, setWorkerForm] = useState({ name: "", dailyRate: "", monthlySalary: "", photoUrl: null });
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
  const [paymentForm, setPaymentForm] = useState({ date: todayStr(), workerId: "", amount: "", type: "advance", notes: "", deductPerDay: "", interestPercentPerMonth: "" });

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
    if (res.ok) {
      setMySites(res.data);
      loadSiteMonthlyCosts(res.data);
    }
    setSitesLoading(false);
  }

  // Computes "this month's labor cost" per site (daily wages earned this
  // calendar month + monthly salaries paid this month) so a contractor
  // running several sites can see a rollup without opening each one.
  async function loadSiteMonthlyCosts(sites) {
    if (!sites || sites.length === 0) return;
    setCostsLoading(true);
    const month = todayStr().slice(0, 7);
    const costs = {};
    for (const s of sites) {
      const [a, p] = await Promise.all([fetchAttendance(s.site_code), fetchPayments(s.site_code)]);
      const attendanceCost = a.ok
        ? a.data.filter((row) => row.date && row.date.slice(0, 7) === month).reduce((sum, row) => sum + (parseFloat(row.wage) || 0), 0)
        : 0;
      const salaryCost = p.ok
        ? p.data
            .filter((row) => row.type === "salary" && row.date && row.date.slice(0, 7) === month)
            .reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0)
        : 0;
      costs[s.site_code] = attendanceCost + salaryCost;
    }
    setSiteMonthlyCosts(costs);
    setCostsLoading(false);
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
    const res = await inviteToSite(activeSite, inviteEmail, inviteRole);
    if (!res.ok) {
      setInviteMessage({ type: "error", text: res.error?.message || "Could not send this invite." });
      return;
    }
    setInviteMessage({ type: "success", text: `Invited ${inviteEmail} as ${inviteRole === "viewer" ? "a viewer (read-only)" : "a full member"}. They'll get access as soon as they sign up or log in with that email.` });
    setInviteEmail("");
  }

  useEffect(() => {
    if (!activeSite) return;
    const existing = {};
    const existingPhotos = {};
    attendance
      .filter((a) => a.date === attendanceDate)
      .forEach((a) => {
        existing[a.workerId] = a.status;
        if (a.photoUrl) {
          existingPhotos[a.workerId] = {
            photoUrl: a.photoUrl,
            locationLat: a.locationLat,
            locationLng: a.locationLng,
            capturedAt: a.capturedAt,
          };
        }
      });
    setDraftStatus(existing);
    setDraftPhotos(existingPhotos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceDate, activeSite]);

  function mapWorker(w) {
    return { id: w.id, name: w.name, payType: w.pay_type, dailyRate: w.daily_rate, monthlySalary: w.monthly_salary, photoUrl: w.photo_url, active: w.active !== false };
  }
  function mapAttendance(a) {
    return {
      id: a.id,
      date: a.date,
      workerId: a.worker_id,
      status: a.status,
      wage: a.wage,
      photoUrl: a.photo_url,
      locationLat: a.location_lat,
      locationLng: a.location_lng,
      capturedAt: a.captured_at,
    };
  }
  function mapPayment(p) {
    return {
      id: p.id,
      date: p.date,
      workerId: p.worker_id,
      amount: p.amount,
      type: p.type,
      notes: p.notes,
      deductPerDay: p.deduct_per_day,
      interestPercentPerMonth: p.interest_percent_per_month || 0,
    };
  }

  async function openSite(code, role) {
    const normalized = sanitizeSiteCode(code);
    if (!normalized) return;
    setLoading(true);
    setError(null);

    const [w, a, p, settings] = await Promise.all([
      fetchWorkers(normalized),
      fetchAttendance(normalized),
      fetchPayments(normalized),
      fetchSiteSettings(normalized),
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
    setMyRole(role || "member");
    // A settings-fetch failure isn't blocking — falls back to the default
    // of 20 rather than refusing to open the site over a secondary value.
    setAbsenceThreshold(settings.absenceThreshold ?? 20);
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

  // Active-only — used for marking attendance and logging new payments,
  // since an inactive worker shouldn't be operated on going forward, only
  // referenced in their existing history.
  const sectionWorkers = workers.filter((w) => w.payType === section && w.active).sort((a, b) => a.name.localeCompare(b.name));
  // Includes inactive workers too — used specifically by the Workers
  // management tab, which needs to show deactivated workers so they can
  // be reactivated, alongside a toggle to hide/show them.
  const allSectionWorkers = workers.filter((w) => w.payType === section).sort((a, b) => a.name.localeCompare(b.name));

  function workerById(id) {
    return workers.find((w) => w.id === id);
  }

  function openAddWorker() {
    setEditingWorkerId(null);
    setWorkerForm({ name: "", dailyRate: "", monthlySalary: "", photoUrl: null });
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
    setWorkerForm({ name: worker.name, dailyRate: worker.dailyRate || "", monthlySalary: worker.monthlySalary || "", photoUrl: worker.photoUrl || null });
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
    setWorkerForm({ name: "", dailyRate: "", monthlySalary: "", photoUrl: null });
    setEditingWorkerId(null);
    setShowWorkerForm(false);
  }

  // Deliberately does NOT decide in advance whether this worker has
  // history and pick a path based on that — a bug surfaced exactly that
  // approach: local attendance/payments state can be stale or incomplete
  // for reasons that don't matter here, and predicting wrong meant a real
  // delete was attempted and correctly rejected by the database, but
  // surfaced as a raw error instead of gracefully falling back. Instead,
  // this always attempts the permanent delete first and lets the
  // database's actual answer (migration_009's trigger) decide the
  // outcome — if it's specifically rejected for having history, that
  // becomes the signal to deactivate instead, not a client-side guess.
  async function executeRemoveWorker(id) {
    const previous = workers;
    const delRes = await apiRemoveWorker(id);

    if (delRes.ok) {
      setWorkers(workers.filter((w) => w.id !== id));
      setConfirmDeleteWorker(null);
      return;
    }

    const blockedForHistory = delRes.error?.message?.includes("Cannot permanently delete");
    if (blockedForHistory) {
      const deactRes = await apiDeactivateWorker(id);
      if (!deactRes.ok) {
        setWorkers(previous);
        setError(`Could not deactivate this worker (${deactRes.error?.message || "unknown error"}).`);
        setConfirmDeleteWorker(null);
        return;
      }
      setWorkers(workers.map((w) => (w.id === id ? { ...w, active: false } : w)));
      setConfirmDeleteWorker(null);
      return;
    }

    setError(`Could not remove this worker (${delRes.error?.message || "unknown error"}).`);
    setConfirmDeleteWorker(null);
  }

  async function handleReactivateWorker(id) {
    const previous = workers;
    setWorkers(workers.map((w) => (w.id === id ? { ...w, active: true } : w)));
    const res = await apiReactivateWorker(id);
    if (!res.ok) {
      setWorkers(previous);
      setError(`Could not reactivate this worker (${res.error?.message || "unknown error"}).`);
    }
  }

  async function saveAttendanceForDay() {
    const entries = sectionWorkers
      .filter((w) => draftStatus[w.id])
      .map((w) => {
        const status = draftStatus[w.id];
        const photo = draftPhotos[w.id];
        const base = photo
          ? { photoUrl: photo.photoUrl, locationLat: photo.locationLat, locationLng: photo.locationLng, capturedAt: photo.capturedAt }
          : {};
        if (section === "daily") {
          const rate = parseFloat(w.dailyRate) || 0;
          const wage = status === "present" ? rate : status === "half" ? rate / 2 : 0;
          return { workerId: w.id, status, wage, ...base };
        }
        // Monthly workers get an attendance record for leave tracking only —
        // it never drives a wage calculation.
        return { workerId: w.id, status, wage: 0, ...base };
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

  function getLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null), // permission denied or unavailable — photo still proceeds without location
        { timeout: 8000 }
      );
    });
  }

  async function handleCaptureAttendancePhoto(workerId, file) {
    if (!file) return;
    setCapturingPhotoFor(workerId);
    setError(null);
    const [location, compressedFile] = await Promise.all([getLocation(), compressImage(file)]);
    const res = await uploadAttendancePhoto(activeSite, workerId, attendanceDate, compressedFile);
    setCapturingPhotoFor(null);
    if (!res.ok) {
      setError(`Could not upload this photo (${res.error?.message || "unknown error"}). Please try again.`);
      return;
    }
    setDraftPhotos({
      ...draftPhotos,
      [workerId]: {
        photoUrl: res.url,
        locationLat: location?.lat ?? null,
        locationLng: location?.lng ?? null,
        capturedAt: new Date().toISOString(),
      },
    });
  }

  // Worker photo is a one-time profile photo, not a daily re-capture — set
  // once from the Add/Edit Worker form, replaceable or removable any time.
  async function handleUploadWorkerPhoto(workerId, file) {
    if (!file) return;
    setUploadingPhotoFor(workerId);
    setError(null);
    // Smaller max width than the attendance verification photo — this is
    // only ever displayed as a small thumbnail, never needs to be large.
    const compressedFile = await compressImage(file, 400, 0.75);
    const res = await uploadWorkerPhoto(activeSite, workerId, compressedFile);
    setUploadingPhotoFor(null);
    if (!res.ok) {
      setError(`Could not upload this photo (${res.error?.message || "unknown error"}). Please try again.`);
      return;
    }
    setWorkers(workers.map((w) => (w.id === workerId ? { ...w, photoUrl: res.url } : w)));
  }

  async function handleRemoveWorkerPhoto(workerId) {
    const previous = workers;
    setWorkers(workers.map((w) => (w.id === workerId ? { ...w, photoUrl: null } : w)));
    const res = await removeWorkerPhoto(workerId);
    if (!res.ok) {
      setWorkers(previous);
      setError(`Could not remove this photo (${res.error?.message || "unknown error"}).`);
    }
  }

  async function loadAuditLog() {
    setAuditLogLoading(true);
    const res = await fetchAttendanceAuditLog(activeSite);
    if (res.ok) setAuditLog(res.data);
    else setError(`Could not load the change history (${res.error?.message || "unknown error"}).`);
    setAuditLogLoading(false);
  }

  async function handleSaveSettings() {
    const value = parseFloat(settingsDraft);
    if (isNaN(value) || value < 0 || value > 100) {
      setError("Absence threshold must be a number between 0 and 100.");
      return;
    }
    setSavingSettings(true);
    const res = await updateSiteSettings(activeSite, { absenceThreshold: value });
    setSavingSettings(false);
    if (!res.ok) {
      setError(`Could not save this setting (${res.error?.message || "unknown error"}).`);
      return;
    }
    setAbsenceThreshold(value);
    setShowSettingsForm(false);
  }

  async function handleAddPayment() {
    if (!paymentForm.workerId || !paymentForm.amount) return;
    setSaving(true);
    const res = await apiAddPayment(activeSite, {
      ...paymentForm,
      amount: parseFloat(paymentForm.amount),
      deductPerDay: paymentForm.deductPerDay ? parseFloat(paymentForm.deductPerDay) : null,
      interestPercentPerMonth: paymentForm.interestPercentPerMonth ? parseFloat(paymentForm.interestPercentPerMonth) : 0,
    });
    setSaving(false);
    if (!res.ok) {
      setError(`Could not save this payment (${res.error?.message || "unknown error"}). Please try again.`);
      return;
    }
    setPayments([mapPayment(res.data), ...payments]);
    setPaymentForm({ date: todayStr(), workerId: "", amount: "", type: "advance", notes: "", deductPerDay: "", interestPercentPerMonth: "" });
    setShowPaymentForm(false);
  }

  async function executeDeletePayment(id) {
    const previous = payments;
    setPayments(payments.filter((p) => p.id !== id));
    const res = await apiDeletePayment(id);
    if (!res.ok) {
      setPayments(previous);
      setError(`Could not remove this payment (${res.error?.message || "unknown error"}).`);
    }
    setConfirmDeletePayment(null);
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

  // Past days are locked to view-only at midnight IST (see migration_008)
  // to prevent a supervisor from quietly editing attendance after the
  // fact. This mirrors the same date check enforced in the database —
  // this one is just for showing the lock proactively in the UI, the
  // database policy is what actually stops the write.
  const isDayLocked = attendanceDate < todayStr();

  const ledger = workers.map((w) => {
    const wa = attendance.filter((a) => a.workerId === w.id);
    const daysPresent = wa.filter((a) => a.status === "present").length;
    const daysAbsent = wa.filter((a) => a.status === "absent").length;
    if (w.payType === "daily") {
      const daysHalf = wa.filter((a) => a.status === "half").length;
      const totalEarned = wa.reduce((s, a) => s + (parseFloat(a.wage) || 0), 0);
      const totalPaid = payments.filter((p) => p.workerId === w.id).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      const totalMarked = daysPresent + daysHalf + daysAbsent;
      const absenceRate = totalMarked > 0 ? (daysAbsent / totalMarked) * 100 : 0;
      return { ...w, daysPresent, daysHalf, daysAbsent, totalEarned, totalPaid, balance: totalEarned - totalPaid, absenceRate };
    }
    const salaryPayments = payments.filter((p) => p.workerId === w.id && p.type === "salary");
    const totalPaid = payments.filter((p) => p.workerId === w.id).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const lastPaid = salaryPayments.length ? salaryPayments.sort((a, b) => (a.date < b.date ? 1 : -1))[0].date : null;
    const thisMonthPaid = salaryPayments.some((p) => monthStr(p.date) === monthStr(todayStr()));
    const totalMarked = daysPresent + daysAbsent;
    const absenceRate = totalMarked > 0 ? (daysAbsent / totalMarked) * 100 : 0;
    return { ...w, daysPresent, daysAbsent, totalPaid, lastPaid, thisMonthPaid, absenceRate };
  });

  const totalPaidOut = ledger.reduce((s, w) => s + w.totalPaid, 0);
  const totalOwed = ledger.filter((w) => w.payType === "daily").reduce((s, w) => s + w.balance, 0);
  const totalEarnedAllTime = ledger.reduce((s, w) => s + (w.totalEarned || 0), 0);
  const thisMonthLaborCost =
    attendance.filter((a) => a.date && a.date.slice(0, 7) === todayStr().slice(0, 7)).reduce((s, a) => s + (parseFloat(a.wage) || 0), 0) +
    payments.filter((p) => p.type === "salary" && p.date && p.date.slice(0, 7) === todayStr().slice(0, 7)).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

  // A worker is flagged as chronically absent once their absence rate
  // crosses 20% — an arbitrary but reasonable starting threshold; there's
  // no universally "correct" number here, so this is easy to find and
  // adjust in code if a real site owner's sense of "too much" differs.
  // Absence threshold is now a per-site setting (see absenceThreshold
  // state, fetched in openSite and editable via the settings modal below)
  // instead of a hardcoded constant — every site can set its own value.

  // Computes how much of each advance has been recovered automatically
  // from wages, and what's still outstanding (principal + simple monthly
  // interest). Only advances that were given a deductPerDay show up here —
  // a plain advance with no recovery schedule is left as a manual,
  // one-time payment, same as before this feature existed.
  function outstandingAdvancesFor(workerId) {
    const workerAdvances = payments.filter((p) => p.workerId === workerId && p.type === "advance" && p.deductPerDay);
    const workerAttendance = attendance.filter((a) => a.workerId === workerId);
    return workerAdvances.map((adv) => {
      const daysWorkedSince = workerAttendance.filter(
        (a) => a.date >= adv.date && (a.status === "present" || a.status === "half")
      ).length;
      const recovered = Math.min(adv.deductPerDay * daysWorkedSince, adv.amount);
      const outstandingPrincipal = adv.amount - recovered;
      const monthsElapsed = Math.max(0, Math.floor((new Date(todayStr()) - new Date(adv.date)) / (1000 * 60 * 60 * 24 * 30)));
      const interestAccrued = adv.interestPercentPerMonth
        ? outstandingPrincipal * (adv.interestPercentPerMonth / 100) * monthsElapsed
        : 0;
      const totalOutstanding = outstandingPrincipal + interestAccrued;
      const daysRemaining = adv.deductPerDay > 0 ? Math.ceil(totalOutstanding / adv.deductPerDay) : null;
      return {
        ...adv,
        daysWorkedSince,
        recovered,
        outstandingPrincipal,
        interestAccrued,
        totalOutstanding,
        daysRemaining,
      };
    });
  }

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
          <div style={{ fontFamily: fontStack.display, fontSize: 20, fontWeight: 700 }}>{t("appTitle", lang)}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <LangToggle lang={lang} setLang={setLang} />
            <button onClick={handleSignOut} style={{ background: "transparent", border: `1px solid ${PAPER}55`, color: PAPER, borderRadius: 4, padding: "8px 12px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <LogOut size={13} /> {t("signOut", lang)}
            </button>
          </div>
        </div>
        <div style={{ padding: 24, maxWidth: 500, margin: "0 auto" }}>
          <div style={{ fontFamily: fontStack.display, fontSize: 18, fontWeight: 700, color: INK, marginBottom: 4 }}>{t("yourSites", lang)}</div>
          <div style={{ color: FADED, fontSize: 13, marginBottom: 20 }}>{currentUser.email}</div>

          {sitesLoading ? (
            <Loader2 size={18} className="spin" color={AMBER} />
          ) : mySites.length === 0 ? (
            <div style={{ color: FADED, fontSize: 13, marginBottom: 20 }}>You're not a member of any site yet — create one below, or ask someone to invite your email to theirs.</div>
          ) : (
            <>
              {mySites.length > 1 && (
                <div style={{ background: "#fff", border: `1.5px solid ${AMBER}`, borderRadius: 6, padding: "12px 16px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: CHARCOAL }}>{t("thisMonthCost", lang)} — All Sites</span>
                  <span style={{ fontFamily: fontStack.mono, fontWeight: 700, color: AMBER, fontSize: 16 }}>
                    {costsLoading ? <Loader2 size={14} className="spin" /> : `₹${fmt(Object.values(siteMonthlyCosts).reduce((s, v) => s + v, 0))}`}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                {mySites.map((s) => (
                  <button
                    key={s.site_code}
                    onClick={() => openSite(s.site_code, s.role)}
                    style={{ textAlign: "left", background: "#fff", border: `1.5px solid ${PAPER_LINE}`, borderRadius: 6, padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}
                  >
                    <span style={{ fontFamily: fontStack.mono, fontWeight: 600, color: CHARCOAL }}>{s.site_code}</span>
                    <span style={{ fontSize: 11, color: FADED, fontFamily: fontStack.mono }}>
                      {costsLoading ? "..." : `₹${fmt(siteMonthlyCosts[s.site_code] || 0)} this month`}
                    </span>
                    <span style={{ fontSize: 11, color: FADED, textTransform: "uppercase" }}>{s.role}</span>
                  </button>
                ))}
              </div>
            </>
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
          <div style={{ fontFamily: fontStack.display, fontSize: 20, fontWeight: 700 }}>{t("appTitle", lang)}</div>
          <div style={{ fontFamily: fontStack.mono, fontSize: 11, color: "#9DB5B3" }}>{activeSite}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saving && <Loader2 size={14} className="spin" style={{ opacity: 0.7 }} />}
          <LangToggle lang={lang} setLang={setLang} />
          <button onClick={() => { setShowAuditLog(true); loadAuditLog(); }} style={{ background: "transparent", border: `1px solid ${PAPER}55`, color: PAPER, borderRadius: 4, padding: "8px 12px", cursor: "pointer", fontSize: 12 }}>
            History
          </button>
          {!isViewer && (
            <button onClick={() => { setSettingsDraft(String(absenceThreshold)); setShowSettingsForm(true); }} style={{ background: "transparent", border: `1px solid ${PAPER}55`, color: PAPER, borderRadius: 4, padding: "8px 12px", cursor: "pointer", fontSize: 12 }}>
              Settings
            </button>
          )}
          {!isViewer && (
            <button onClick={() => { setInviteEmail(""); setInviteRole("member"); setInviteMessage(null); setShowInviteForm(true); }} style={{ background: "transparent", border: `1px solid ${PAPER}55`, color: PAPER, borderRadius: 4, padding: "8px 12px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Mail size={13} /> {t("invite", lang)}
            </button>
          )}
          <button onClick={() => setActiveSite(null)} style={{ background: "transparent", border: `1px solid ${PAPER}55`, color: PAPER, borderRadius: 4, padding: "8px 12px", cursor: "pointer", fontSize: 12 }}>
            {t("switchSite", lang)}
          </button>
        </div>
      </div>

      {isViewer && (
        <div style={{ background: "#EAF1F7", color: INK, padding: "8px 24px", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={13} />
          You have view-only access to this site — you can see everything but can't add, edit, or remove anything.
        </div>
      )}

      <div style={{ display: "flex", borderBottom: `1px solid ${PAPER_LINE}`, background: "#F2EDDD", flexWrap: "wrap" }}>
        {[
          { label: t("workersCount", lang), value: workers.length },
          { label: t("totalEarned", lang), value: `₹${fmt(totalEarnedAllTime)}` },
          { label: t("totalPaidOut", lang), value: `₹${fmt(totalPaidOut)}` },
          {
            label: t("totalOwed", lang),
            value: `₹${fmt(totalOwed)}`,
            color: totalOwed > 0 ? RUST : GREEN,
            sub: totalOwed < 0 ? "workers owe back (advances exceed earnings)" : totalOwed > 0 ? "still owed to workers" : "settled",
          },
          { label: t("thisMonthCost", lang), value: `₹${fmt(thisMonthLaborCost)}`, color: AMBER },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, minWidth: 140, padding: "14px 18px", borderRight: i < 4 ? `1px solid ${PAPER_LINE}` : "none" }}>
            <div style={{ fontSize: 11, color: FADED, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: fontStack.mono, fontSize: 20, fontWeight: 600, color: s.color || CHARCOAL }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 10, color: FADED, marginTop: 2 }}>{s.sub}</div>}
          </div>
        ))}
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
        {!isViewer && tab === "workers" && (
          <>
            <button onClick={openBulkAdd} style={{ ...secondaryBtnStyle, padding: "8px 14px", fontSize: 13, marginRight: 8 }}>{t("bulkAdd", lang)}</button>
            <button onClick={openAddWorker} style={addBtnStyle}><Plus size={15} /> {t("addWorker", lang)}</button>
          </>
        )}
        {!isViewer && tab === "payments" && (
          <button onClick={() => { setPaymentForm({ date: todayStr(), workerId: "", amount: "", type: section === "daily" ? "advance" : "salary", notes: "", deductPerDay: "", interestPercentPerMonth: "" }); setShowPaymentForm(true); }} style={addBtnStyle}><Plus size={15} /> {t("logPayment", lang)}</button>
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
            {isDayLocked && (
              <div style={{ background: "#EAF1F7", color: INK, padding: "10px 14px", fontSize: 12.5, borderRadius: 6, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={14} />
                This day is locked — attendance for past days can be viewed but not changed, to prevent edits after
                the fact. It locked automatically at midnight.
              </div>
            )}
            {sectionWorkers.length === 0 ? (
              <EmptyState icon={<Users size={22} color={FADED} />} text={`No ${section === "daily" ? "daily-wage" : "monthly-salary"} workers added yet.`} />
            ) : (
              <>
                <div style={{ position: "relative", maxWidth: 280, marginBottom: 14 }}>
                  <Search size={15} color={FADED} style={{ position: "absolute", left: 10, top: 11 }} />
                  <input
                    value={workerSearchTerm}
                    onChange={(e) => setWorkerSearchTerm(e.target.value)}
                    placeholder="Search workers..."
                    style={{ ...inputStyle, paddingLeft: 32 }}
                  />
                </div>
                <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontStack.mono, fontSize: 13, marginTop: 12, marginBottom: 16 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${INK}` }}>
                      {["Worker", "Status", section === "daily" ? "Wage" : "Note", "Today's Verification"].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sectionWorkers
                      .filter((w) => w.name.toLowerCase().includes(workerSearchTerm.toLowerCase()))
                      .map((w) => {
                      const status = draftStatus[w.id];
                      const rate = parseFloat(w.dailyRate) || 0;
                      const wage = status === "present" ? rate : status === "half" ? rate / 2 : 0;
                      const todayPhoto = draftPhotos[w.id];
                      const capturing = capturingPhotoFor === w.id;
                      return (
                        <tr key={w.id} style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {w.photoUrl ? (
                                <img src={w.photoUrl} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", border: `1px solid ${PAPER_LINE}` }} />
                              ) : (
                                <div style={{ width: 26, height: 26, borderRadius: "50%", background: PAPER_LINE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: FADED }}>
                                  {w.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              {w.name}
                            </div>
                          </td>
                          <td style={{ padding: "10px" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              {[{ id: "present", label: t("present", lang), color: GREEN }, { id: "half", label: t("half", lang), color: AMBER }, { id: "absent", label: t("absent", lang), color: RUST }].map((opt) => {
                                const locked = isViewer || isDayLocked;
                                return (
                                <button
                                  key={opt.id}
                                  disabled={locked}
                                  onClick={() => !locked && setDraftStatus({ ...draftStatus, [w.id]: opt.id })}
                                  style={{ background: status === opt.id ? opt.color : "transparent", color: status === opt.id ? "#fff" : opt.color, border: `1px solid ${opt.color}`, borderRadius: 4, padding: "7px 13px", fontSize: 12, fontWeight: 600, cursor: locked ? "default" : "pointer", minHeight: 32, opacity: locked ? 0.6 : 1 }}
                                >
                                  {opt.label}
                                </button>
                                );
                              })}
                            </div>
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{section === "daily" ? (status ? `₹${fmt(wage)}` : "—") : "For leave record only"}</td>
                          <td style={{ padding: "10px" }}>
                            {!isViewer && !isDayLocked && (
                              <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11 }}>
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  style={{ display: "none" }}
                                  onChange={(e) => handleCaptureAttendancePhoto(w.id, e.target.files?.[0])}
                                />
                                {capturing ? (
                                  <Loader2 size={14} className="spin" color={AMBER} />
                                ) : todayPhoto ? (
                                  <span style={{ color: GREEN, fontWeight: 600 }}>&#10003; Verified{todayPhoto.locationLat ? " (GPS)" : ""}</span>
                                ) : (
                                  <span style={{ color: FADED, border: `1px dashed ${PAPER_LINE}`, borderRadius: 4, padding: "5px 8px" }}>&#128247; Verify today</span>
                                )}
                              </label>
                            )}
                            {isDayLocked && todayPhoto && (
                              <span style={{ color: GREEN, fontWeight: 600, fontSize: 11 }}>&#10003; Verified{todayPhoto.locationLat ? " (GPS)" : ""}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                {!isViewer && !isDayLocked && (
                  <button onClick={saveAttendanceForDay} style={{ ...primaryBtnStyle, width: "auto" }}>{t("saveAttendance", lang)} {attendanceDate}</button>
                )}
              </>
            )}
          </>
        )}

        {tab === "workers" && (
          <>
            {allSectionWorkers.length === 0 ? (
              <EmptyState icon={<Users size={22} color={FADED} />} text="No workers added yet." />
            ) : (
              <>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                  <div style={{ position: "relative", maxWidth: 280 }}>
                    <Search size={15} color={FADED} style={{ position: "absolute", left: 10, top: 11 }} />
                    <input
                      value={workerSearchTerm}
                      onChange={(e) => setWorkerSearchTerm(e.target.value)}
                      placeholder="Search workers..."
                      style={{ ...inputStyle, paddingLeft: 32 }}
                    />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: FADED, cursor: "pointer" }}>
                    <input type="checkbox" checked={showInactiveWorkers} onChange={(e) => setShowInactiveWorkers(e.target.checked)} />
                    Show deactivated workers
                  </label>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontStack.mono, fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${INK}` }}>
                        <SortableTh label="Name" field="name" sortField={workerSortField} sortDir={workerSortDir} setSortField={setWorkerSortField} setSortDir={setWorkerSortDir} />
                        <SortableTh label={section === "daily" ? "Daily Rate" : "Monthly Salary"} field="rate" sortField={workerSortField} sortDir={workerSortDir} setSortField={setWorkerSortField} setSortDir={setWorkerSortDir} />
                        <th style={thStyle}></th>
                        <th style={thStyle}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {allSectionWorkers
                        .filter((w) => w.active || showInactiveWorkers)
                        .filter((w) => w.name.toLowerCase().includes(workerSearchTerm.toLowerCase()))
                        .sort((a, b) => {
                          const dir = workerSortDir === "asc" ? 1 : -1;
                          if (workerSortField === "rate") {
                            const aRate = parseFloat(a.payType === "daily" ? a.dailyRate : a.monthlySalary) || 0;
                            const bRate = parseFloat(b.payType === "daily" ? b.dailyRate : b.monthlySalary) || 0;
                            return (aRate - bRate) * dir;
                          }
                          return a.name.localeCompare(b.name) * dir;
                        })
                        .map((w) => (
                        <tr key={w.id} style={{ borderBottom: `1px solid ${PAPER_LINE}`, opacity: w.active ? 1 : 0.55 }}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {w.photoUrl ? (
                                <img src={w.photoUrl} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", border: `1px solid ${PAPER_LINE}` }} />
                              ) : (
                                <div style={{ width: 26, height: 26, borderRadius: "50%", background: PAPER_LINE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: FADED }}>
                                  {w.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              {w.name}
                              {!w.active && <span style={{ fontSize: 10, color: FADED, border: `1px solid ${PAPER_LINE}`, borderRadius: 3, padding: "1px 5px" }}>DEACTIVATED</span>}
                            </div>
                          </td>
                          <td style={tdStyle}>₹{w.payType === "daily" ? `${w.dailyRate}/day` : `${w.monthlySalary}/month`}</td>
                          {w.active ? (
                            <>
                              <td style={{ padding: "10px" }}>{!isViewer && <button onClick={() => openEditWorker(w)} style={{ ...linkBtnStyle, color: AMBER, fontWeight: 600 }}>{t("edit", lang)}</button>}</td>
                              <td style={{ padding: "10px" }}>{!isViewer && <button onClick={() => setConfirmDeleteWorker(w)} style={linkBtnStyle}>{t("remove", lang)}</button>}</td>
                            </>
                          ) : (
                            <td style={{ padding: "10px" }} colSpan={2}>{!isViewer && <button onClick={() => handleReactivateWorker(w.id)} style={{ ...linkBtnStyle, color: GREEN, fontWeight: 600 }}>Reactivate</button>}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
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
                      <td style={{ padding: "10px" }}>{!isViewer && <button onClick={() => setConfirmDeletePayment(p)} style={linkBtnStyle}>{t("remove", lang)}</button>}</td>
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
                  <>
                  <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontStack.mono, fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${INK}` }}>
                        {["Worker", "Present", "Half", "Absent", "Absence %", "Earned", "Paid", "Balance"].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.filter((w) => w.payType === "daily").sort((a, b) => a.name.localeCompare(b.name)).map((w) => {
                        const chronic = w.absenceRate >= absenceThreshold;
                        return (
                        <tr key={w.id} style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{w.name}{!w.active && <span style={{ fontSize: 10, color: FADED, marginLeft: 6, fontWeight: 400 }}>(deactivated)</span>}</td>
                          <td style={tdStyle}>{w.daysPresent}</td>
                          <td style={tdStyle}>{w.daysHalf}</td>
                          <td style={tdStyle}>{w.daysAbsent}</td>
                          <td style={{ padding: "10px", fontWeight: chronic ? 700 : 400, color: chronic ? RUST : CHARCOAL }}>
                            {fmt(w.absenceRate, 0)}%{chronic && " ⚠"}
                          </td>
                          <td style={tdStyle}>₹{fmt(w.totalEarned)}</td>
                          <td style={tdStyle}>₹{fmt(w.totalPaid)}</td>
                          <td style={{ padding: "10px", fontWeight: 700, color: w.balance > 0 ? RUST : GREEN }}>₹{fmt(w.balance)}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>

                  {(() => {
                    const allAdvances = workers
                      .filter((w) => w.payType === "daily")
                      .flatMap((w) => outstandingAdvancesFor(w.id).map((adv) => ({ ...adv, workerName: w.name })))
                      .filter((adv) => adv.totalOutstanding > 0.5);
                    if (allAdvances.length === 0) return null;
                    return (
                      <div style={{ marginTop: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 6 }}>Advance Recovery Progress</div>
                        <div style={{ fontSize: 11, color: FADED, marginBottom: 10, maxWidth: 640 }}>
                          The advance was already paid out in full and is already reflected in the Balance column above.
                          This table is separate — it just tracks how much of that advance corresponds to work
                          already done, so you know roughly how much longer it'll take to fully work off. It doesn't
                          change any cash figure above.
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontStack.mono, fontSize: 13 }}>
                            <thead>
                              <tr style={{ borderBottom: `2px solid ${INK}` }}>
                                {["Worker", "Given On", "Amount", "Deduct/Day", "Worked Off So Far", "Remaining", "Est. Days Left"].map((h) => (
                                  <th key={h} style={thStyle}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {allAdvances.map((adv) => (
                                <tr key={adv.id} style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
                                  <td style={{ ...tdStyle, fontWeight: 600 }}>{adv.workerName}</td>
                                  <td style={tdStyle}>{adv.date}</td>
                                  <td style={tdStyle}>₹{fmt(adv.amount)}</td>
                                  <td style={tdStyle}>₹{fmt(adv.deductPerDay)}</td>
                                  <td style={tdStyle}>₹{fmt(adv.recovered)} ({adv.daysWorkedSince} days)</td>
                                  <td style={{ padding: "10px", fontWeight: 700, color: RUST }}>₹{fmt(adv.totalOutstanding)}{adv.interestAccrued > 0 ? ` (incl. ₹${fmt(adv.interestAccrued)} interest)` : ""}</td>
                                  <td style={tdStyle}>{adv.daysRemaining != null ? `~${adv.daysRemaining} more work-days` : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                  </>
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
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{w.name}{!w.active && <span style={{ fontSize: 10, color: FADED, marginLeft: 6, fontWeight: 400 }}>(deactivated)</span>}</td>
                          <td style={tdStyle}>{w.daysPresent}</td>
                          <td style={tdStyle}>{w.daysAbsent}</td>
                          <td style={tdStyle}>{w.lastPaid || "—"}</td>
                          <td style={{ padding: "10px", fontWeight: 700, color: w.thisMonthPaid ? GREEN : RUST }}>{w.thisMonthPaid ? "Paid" : "Not yet"}</td>
                          <td style={{ padding: "10px" }}>
                            {!w.thisMonthPaid && !isViewer && (
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
          {editingWorkerId && (
            <Field label="Photo">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {workerForm.photoUrl ? (
                  <img src={workerForm.photoUrl} alt="" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: `1px solid ${PAPER_LINE}` }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: PAPER_LINE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: FADED }}>
                    {(workerForm.name || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <label style={{ ...secondaryBtnStyle, cursor: "pointer", padding: "7px 12px", fontSize: 12 }}>
                  {uploadingPhotoFor === editingWorkerId ? <Loader2 size={13} className="spin" /> : workerForm.photoUrl ? "Replace" : "Add photo"}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      await handleUploadWorkerPhoto(editingWorkerId, file);
                      setWorkerForm((f) => ({ ...f, photoUrl: workers.find((w) => w.id === editingWorkerId)?.photoUrl }));
                    }}
                  />
                </label>
                {workerForm.photoUrl && (
                  <button
                    onClick={async () => {
                      await handleRemoveWorkerPhoto(editingWorkerId);
                      setWorkerForm((f) => ({ ...f, photoUrl: null }));
                    }}
                    style={{ ...linkBtnStyle, color: RUST }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: FADED, marginTop: 6 }}>
                A one-time photo for identification — not a daily re-verification. Set it once, replace or remove it any time.
              </div>
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

      {confirmDeleteWorker && (
        <Modal onClose={() => setConfirmDeleteWorker(null)} title="Remove this worker?">
          <div style={{ fontSize: 13, color: CHARCOAL, marginBottom: 16 }}>
            If <strong>{confirmDeleteWorker.name}</strong> has no attendance or payment history yet, this deletes
            them permanently — this cannot be undone. If they do have history, they'll be automatically deactivated
            instead: every record stays intact and correctly attributed, they just stop appearing in Today's
            Attendance and new payments. You can reactivate them any time from the Workers tab.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirmDeleteWorker(null)} style={{ ...secondaryBtnStyle, flex: 1, justifyContent: "center" }}>Cancel</button>
            <button onClick={() => executeRemoveWorker(confirmDeleteWorker.id)} style={{ ...primaryBtnStyle, flex: 1, marginTop: 0, background: RUST }}>
              Continue
            </button>
          </div>
        </Modal>
      )}

      {confirmDeletePayment && (
        <Modal onClose={() => setConfirmDeletePayment(null)} title="Remove this payment?">
          <div style={{ fontSize: 13, color: CHARCOAL, marginBottom: 16 }}>
            This permanently deletes this ₹{confirmDeletePayment.amount} {confirmDeletePayment.type} record. If it
            was an advance with a recovery schedule attached, that recovery tracking goes with it. This cannot be
            undone.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirmDeletePayment(null)} style={{ ...secondaryBtnStyle, flex: 1, justifyContent: "center" }}>Cancel</button>
            <button onClick={() => executeDeletePayment(confirmDeletePayment.id)} style={{ ...primaryBtnStyle, flex: 1, marginTop: 0, background: RUST }}>
              Yes, delete permanently
            </button>
          </div>
        </Modal>
      )}

      {showAuditLog && (
        <Modal onClose={() => setShowAuditLog(false)} title="Attendance Change History" width={640}>
          <div style={{ fontSize: 11, color: FADED, marginBottom: 12 }}>
            Every attendance entry and change, in order, with who made it. This is written automatically at the
            database level — it can't be edited or deleted by anyone, including the person who made the change.
          </div>
          {auditLogLoading ? (
            <Loader2 size={18} className="spin" color={AMBER} />
          ) : auditLog.length === 0 ? (
            <div style={{ fontSize: 13, color: FADED }}>No attendance changes recorded yet.</div>
          ) : (
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontStack.mono, fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${INK}` }}>
                    {["Worker", "Date", "Change", "By", "When"].map((h) => <th key={h} style={{ ...thStyle, position: "sticky", top: 0, background: PAPER }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry) => (
                    <tr key={entry.id} style={{ borderBottom: `1px solid ${PAPER_LINE}` }}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{entry.worker_name}</td>
                      <td style={tdStyle}>{entry.date}</td>
                      <td style={tdStyle}>
                        {entry.old_status ? (
                          <span>
                            <span style={{ color: FADED }}>{entry.old_status}</span> &rarr; <span style={{ fontWeight: 700 }}>{entry.new_status}</span>
                          </span>
                        ) : (
                          <span style={{ color: GREEN }}>new: {entry.new_status}</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 11 }}>{entry.changed_by_email || "—"}</td>
                      <td style={{ ...tdStyle, fontSize: 11 }}>{new Date(entry.changed_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {showSettingsForm && (
        <Modal onClose={() => setShowSettingsForm(false)} title="Site Settings">
          <Field label="Flag a worker as chronically absent once their absence rate reaches (%)">
            <input
              type="number"
              min="0"
              max="100"
              value={settingsDraft}
              onChange={(e) => setSettingsDraft(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <div style={{ fontSize: 11, color: FADED, marginBottom: 10 }}>
            This is specific to this site — other sites you're part of keep their own setting.
          </div>
          <button onClick={handleSaveSettings} disabled={savingSettings} style={{ ...primaryBtnStyle, opacity: savingSettings ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {savingSettings && <Loader2 size={15} className="spin" />}
            {savingSettings ? "Saving..." : "Save Settings"}
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
          <Field label="Access level">
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { id: "member", label: "Full access", desc: "can add, edit, and remove" },
                { id: "viewer", label: "View only", desc: "can look but not change" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setInviteRole(opt.id)}
                  style={{
                    flex: 1,
                    textAlign: "left",
                    padding: "8px 10px",
                    borderRadius: 4,
                    border: `1.5px solid ${inviteRole === opt.id ? INK : PAPER_LINE}`,
                    background: inviteRole === opt.id ? INK : "#fff",
                    color: inviteRole === opt.id ? PAPER : CHARCOAL,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{opt.label}</div>
                  <div style={{ fontSize: 10, opacity: 0.8 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
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
            <select
              value={paymentForm.workerId}
              onChange={(e) => {
                const workerId = e.target.value;
                const suggestedAmount =
                  paymentForm.type === "settlement" ? String(Math.max(0, ledger.find((w) => w.id === workerId)?.balance || 0)) : paymentForm.amount;
                setPaymentForm({ ...paymentForm, workerId, amount: suggestedAmount });
              }}
              style={inputStyle}
            >
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
          {paymentForm.type === "settlement" && paymentForm.workerId && (
            <div style={{ fontSize: 11, color: FADED, marginBottom: 10, marginTop: -8 }}>
              Amount defaulted to this worker's current balance owed — adjust it if you're only paying part of it.
            </div>
          )}
          <Field label="Type">
            <select
              value={paymentForm.type}
              onChange={(e) => {
                const type = e.target.value;
                const suggestedAmount =
                  type === "settlement" && paymentForm.workerId
                    ? String(Math.max(0, ledger.find((w) => w.id === paymentForm.workerId)?.balance || 0))
                    : paymentForm.amount;
                setPaymentForm({ ...paymentForm, type, amount: suggestedAmount });
              }}
              style={inputStyle}
            >
              {section === "monthly" && <option value="salary">Monthly Salary</option>}
              <option value="advance">Advance</option>
              <option value="settlement">Settlement</option>
            </select>
          </Field>
          {paymentForm.type === "advance" && section === "daily" && (
            <>
              <div style={{ fontSize: 11, color: FADED, marginBottom: 10, marginTop: -6 }}>
                Optional — set these to have the advance recover automatically from future wages instead of needing a manual settlement entry.
              </div>
              <Field label="Auto-deduct per day worked (₹) — optional">
                <input type="number" value={paymentForm.deductPerDay} onChange={(e) => setPaymentForm({ ...paymentForm, deductPerDay: e.target.value })} placeholder="e.g. 100" style={inputStyle} />
              </Field>
              <Field label="Interest per month on unpaid balance (%) — optional">
                <input type="number" value={paymentForm.interestPercentPerMonth} onChange={(e) => setPaymentForm({ ...paymentForm, interestPercentPerMonth: e.target.value })} placeholder="e.g. 2" style={inputStyle} />
              </Field>
            </>
          )}
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

function LangToggle({ lang, setLang }) {
  return (
    <div style={{ display: "flex", border: "1px solid #FAF6EC55", borderRadius: 4, overflow: "hidden" }}>
      {[{ code: "en", label: "EN" }, { code: "hi", label: "हि" }].map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          style={{
            background: lang === l.code ? "#FAF6EC" : "transparent",
            color: lang === l.code ? "#1F3A3D" : "#FAF6EC",
            border: "none",
            padding: "7px 10px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {l.label}
        </button>
      ))}
    </div>
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
