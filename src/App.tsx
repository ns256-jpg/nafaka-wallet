import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHome, faWallet, faExchangeAlt, faChartLine,
  faGift, faCog, faBell, faArrowLeft, faSpinner,
  faArrowUp, faArrowDown, faMobileAlt, faMoneyBillWave,
  faTimes, faPaperPlane, faHandHoldingUsd, faShieldAlt,
  faUsers, faFlag, faPiggyBank,
} from "@fortawesome/free-solid-svg-icons";
import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
} from "recharts";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const urlParams = new URLSearchParams(window.location.search);
const verifyToken = urlParams.get("token");
if (verifyToken) {
  fetch(`${API}/auth/verify-email?token=${verifyToken}`)
    .then(() => window.location.href = window.location.origin)
    .catch(() => {});
}

const apiFetch = async (path: string, options?: RequestInit) => {
  const token = localStorage.getItem("nafaka_token");
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};

interface User { id: string; fullName: string; email: string; phone: string; username: string; role: string }
interface Transaction {
  id: string; type: string; amount: number; fee: number; description: string;
  status: string; mpesaRef?: string; counterparty?: string; createdAt: string; flagged?: boolean;
  user?: { fullName: string; username: string; email?: string };
}
interface Notification { id: string; message: string; isRead: boolean; createdAt: string; type?: string }
interface Reward { id: string; redeemed: boolean; reward: { name: string; description: string; points: number; type: string } }
interface Limits { dailyLimit: number | null; monthlyLimit: number | null }
interface AdminStats {
  totalUsers: number; totalTransactions: number; totalWalletBalance: number;
  totalVolume: number; totalFees: number; flaggedCount: number;
  recentTransactions: Transaction[];
}

// ─── Modal ───────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <FontAwesomeIcon icon={faTimes} onClick={onClose} style={{ cursor: "pointer", opacity: 0.7 }} />
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Auth Screen ─────────────────────────────────────────────
function AuthScreen({ onAuth }: { onAuth: (token: string, user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError(""); setMessage(""); setLoading(true);
    try {
      if (mode === "login") {
        const data = await apiFetch("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: form.email, password: form.password }),
        });
        localStorage.setItem("nafaka_token", data.token);
        localStorage.setItem("nafaka_user", JSON.stringify(data.user));
        onAuth(data.token, data.user);
      } else if (mode === "register") {
        await apiFetch("/auth/register", { method: "POST", body: JSON.stringify(form) });
        setMessage("Account created! You can now log in.");
        setMode("login");
      } else {
        await apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: form.email }) });
        setMessage("If that email exists, a reset link has been sent.");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="logo auth-logo">NAFAKA</h1>
        <p className="auth-subtitle">Digital Wallet</p>
        {message && <div className="auth-success">{message}</div>}
        {error && <div className="auth-error">{error}</div>}
        {mode === "register" && (
          <input className="auth-input" placeholder="Full Name"
            value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />
        )}
        <input className="auth-input" placeholder="Email" type="email"
          value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        {mode === "register" && (<>
          <input className="auth-input" placeholder="Phone (e.g. 0712345678)"
            value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <input className="auth-input" placeholder="Username (e.g. wanjiku.m79)"
            value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
        </>)}
        {mode !== "forgot" && (
          <input className="auth-input" placeholder="Password" type="password"
            value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        )}
        <button className="auth-btn" onClick={handleSubmit} disabled={loading}>
          {loading ? <FontAwesomeIcon icon={faSpinner} spin /> :
            mode === "login" ? "Login" : mode === "register" ? "Create Account" : "Send Reset Link"}
        </button>
        <div className="auth-links">
          {mode === "login" && (<>
            <span onClick={() => setMode("register")}>Create account</span>
            <span onClick={() => setMode("forgot")}>Forgot password?</span>
          </>)}
          {mode !== "login" && <span onClick={() => setMode("login")}>← Back to login</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────
function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "transactions" | "flagged">("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<{ id: string; fullName: string; email: string; username: string; balance: number; phone: string; createdAt: string }[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [flagged, setFlagged] = useState<{ id: string; type: string; amount: number; status: string; createdAt: string; user: { fullName: string; username: string }; reason: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchUser, setSearchUser] = useState("");
  const [searchTx, setSearchTx] = useState("");

  const fetchStats = useCallback(async () => {
    try { const d = await apiFetch("/admin/stats"); setStats(d); } catch {}
  }, []);

  const fetchUsers = useCallback(async () => {
    try { const d = await apiFetch("/admin/users"); setUsers(d.users); } catch {}
  }, []);

  const fetchAllTransactions = useCallback(async () => {
    try { const d = await apiFetch("/admin/transactions"); setAllTransactions(d.transactions); } catch {}
  }, []);

  const fetchFlagged = useCallback(async () => {
    try { const d = await apiFetch("/admin/flagged"); setFlagged(d.flagged); } catch {}
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    setLoading(true);
    if (activeTab === "users") fetchUsers().finally(() => setLoading(false));
    else if (activeTab === "transactions") fetchAllTransactions().finally(() => setLoading(false));
    else if (activeTab === "flagged") fetchFlagged().finally(() => setLoading(false));
    else setLoading(false);
  }, [activeTab, fetchUsers, fetchAllTransactions, fetchFlagged]);

  const isCredit = (type: string) => ["DEPOSIT", "RECEIVE", "VAULT_WITHDRAWAL"].includes(type);

  const filteredUsers = users.filter(u =>
    u.fullName.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.username.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.email.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.phone.includes(searchUser)
  );

  const filteredTx = allTransactions.filter(tx =>
    tx.user?.username?.toLowerCase().includes(searchTx.toLowerCase()) ||
    tx.type.toLowerCase().includes(searchTx.toLowerCase()) ||
    tx.description.toLowerCase().includes(searchTx.toLowerCase())
  );

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      DEPOSIT: "#22c55e", WITHDRAWAL: "#ef4444", SEND: "#f59e0b",
      RECEIVE: "#22c55e", VAULT_DEPOSIT: "#3b82f6", VAULT_WITHDRAWAL: "#3b82f6",
    };
    return colors[type] || "#94a3b8";
  };

  return (
    <div className="admin-panel">
      {/* Admin Header */}
      <header className="admin-header">
        <div className="admin-logo">
          <FontAwesomeIcon icon={faShieldAlt} />
          <div>
            <span>NAFAKA Admin Console</span>
            <p style={{ margin: 0, fontSize: "11px", opacity: 0.6, fontWeight: "normal" }}>
              Secure Administrative Access
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <span style={{ fontSize: "12px", opacity: 0.6 }}>
            {new Date().toLocaleString("en-KE")}
          </span>
          <button className="logout" onClick={onLogout}>Logout</button>
        </div>
      </header>

      {/* Admin Nav */}
      <div className="admin-nav">
        {[
          { key: "overview", icon: faChartLine, label: "Overview" },
          { key: "users", icon: faUsers, label: `Users (${users.length || "..."})` },
          { key: "transactions", icon: faExchangeAlt, label: "Transactions" },
          { key: "flagged", icon: faFlag, label: `🚨 Flagged ${stats?.flaggedCount ? `(${stats.flaggedCount})` : ""}` },
        ].map(tab => (
          <div key={tab.key}
            className={`admin-nav-item ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}>
            <FontAwesomeIcon icon={tab.icon} />
            <span>{tab.label}</span>
          </div>
        ))}
      </div>

      {/* Admin Content */}
      <main className="admin-main">

        {/* OVERVIEW */}
        {activeTab === "overview" && stats && (
          <div>
            <div style={{ marginBottom: "25px" }}>
              <h2 style={{ margin: "0 0 5px 0" }}>System Overview</h2>
              <p style={{ margin: 0, opacity: 0.5, fontSize: "13px" }}>
                Real-time platform metrics and transaction monitoring
              </p>
            </div>

            <div className="admin-stats-grid">
              <div className="admin-stat-card">
                <span>👥 Total Users</span>
                <strong>{stats.totalUsers.toLocaleString()}</strong>
                <p style={{ margin: 0, fontSize: "11px", color: "#22c55e" }}>Active accounts</p>
              </div>
              <div className="admin-stat-card">
                <span>💳 Total Transactions</span>
                <strong>{stats.totalTransactions.toLocaleString()}</strong>
                <p style={{ margin: 0, fontSize: "11px", opacity: 0.5 }}>All time</p>
              </div>
              <div className="admin-stat-card">
                <span>💰 Total Wallet Balance</span>
                <strong className="pos">KES {stats.totalWalletBalance.toLocaleString()}</strong>
                <p style={{ margin: 0, fontSize: "11px", opacity: 0.5 }}>Across all users</p>
              </div>
              <div className="admin-stat-card">
                <span>📊 Transaction Volume</span>
                <strong>KES {stats.totalVolume.toLocaleString()}</strong>
                <p style={{ margin: 0, fontSize: "11px", opacity: 0.5 }}>Total processed</p>
              </div>
              <div className="admin-stat-card" style={{ borderLeft: "3px solid #22c55e" }}>
                <span>💵 Platform Revenue</span>
                <strong className="pos">KES {stats.totalFees.toLocaleString()}</strong>
                <p style={{ margin: 0, fontSize: "11px", color: "#22c55e" }}>Fees collected</p>
              </div>
              <div className="admin-stat-card" style={{ borderLeft: "3px solid #ef4444" }}>
                <span>🚨 Flagged Transactions</span>
                <strong className="neg">{stats.flaggedCount}</strong>
                <p style={{ margin: 0, fontSize: "11px", color: "#ef4444" }}>Requires review</p>
              </div>
            </div>

            {/* Compliance Summary */}
            <div className="admin-compliance-card">
              <h3>⚖️ Compliance & Risk Summary</h3>
              <div className="admin-compliance-grid">
                <div className="compliance-item">
                  <span>Fraud Detection</span>
                  <strong style={{ color: "#22c55e" }}>● Active</strong>
                </div>
                <div className="compliance-item">
                  <span>Auto-Flag Threshold</span>
                  <strong>KES 50,000+</strong>
                </div>
                <div className="compliance-item">
                  <span>Spending Limit Enforcement</span>
                  <strong style={{ color: "#22c55e" }}>● Enabled</strong>
                </div>
                <div className="compliance-item">
                  <span>Transaction Logging</span>
                  <strong style={{ color: "#22c55e" }}>● Full Audit Trail</strong>
                </div>
                <div className="compliance-item">
                  <span>Data Encryption</span>
                  <strong style={{ color: "#22c55e" }}>● JWT + bcrypt</strong>
                </div>
                <div className="compliance-item">
                  <span>Rate Limiting</span>
                  <strong style={{ color: "#22c55e" }}>● Active (100 req/15min)</strong>
                </div>
              </div>
            </div>

            {/* Recent Transactions */}
            <div style={{ marginTop: "25px" }}>
              <h3 style={{ marginBottom: "15px" }}>🕐 Recent Platform Activity</h3>
              <div className="admin-table">
                <div className="admin-table-header admin-tx-grid">
                  <span>User</span>
                  <span>Type</span>
                  <span>Amount</span>
                  <span>Fee</span>
                  <span>Status</span>
                  <span>Date</span>
                </div>
                {stats.recentTransactions.map(tx => (
                  <div key={tx.id} className={`admin-table-row admin-tx-grid ${tx.flagged ? "flagged-row" : ""}`}>
                    <span>
                      <strong>@{tx.user?.username}</strong>
                      {tx.flagged && <span style={{ color: "#ef4444", marginLeft: "5px" }}>🚨</span>}
                    </span>
                    <span style={{ color: getTypeColor(tx.type), fontWeight: 600 }}>{tx.type}</span>
                    <span className={isCredit(tx.type) ? "pos" : "neg"}>
                      {isCredit(tx.type) ? "+" : "-"}KES {tx.amount.toLocaleString()}
                    </span>
                    <span style={{ opacity: 0.7 }}>KES {tx.fee.toLocaleString()}</span>
                    <span>
                      <span className={`admin-status-badge ${tx.status === "SUCCESS" ? "success" : "failed"}`}>
                        {tx.status}
                      </span>
                    </span>
                    <span style={{ opacity: 0.6, fontSize: "12px" }}>
                      {new Date(tx.createdAt).toLocaleString("en-KE")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* USERS */}
        {activeTab === "users" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <h2 style={{ margin: "0 0 5px 0" }}>User Management</h2>
                <p style={{ margin: 0, opacity: 0.5, fontSize: "13px" }}>
                  {filteredUsers.length} of {users.length} users
                </p>
              </div>
              <input
                className="admin-search"
                placeholder="🔍 Search by name, username, email or phone..."
                value={searchUser}
                onChange={e => setSearchUser(e.target.value)}
              />
            </div>

            {loading ? (
              <div className="empty-state"><FontAwesomeIcon icon={faSpinner} spin /> Loading users...</div>
            ) : (
              <div className="admin-table">
                <div className="admin-table-header admin-users-grid">
                  <span>Full Name</span>
                  <span>Username</span>
                  <span>Email</span>
                  <span>Phone</span>
                  <span>Balance</span>
                  <span>Joined</span>
                </div>
                {filteredUsers.map(u => (
                  <div key={u.id} className="admin-table-row admin-users-grid">
                    <span><strong>{u.fullName}</strong></span>
                    <span style={{ color: "#3b82f6" }}>@{u.username}</span>
                    <span style={{ opacity: 0.7, fontSize: "12px" }}>{u.email}</span>
                    <span style={{ opacity: 0.7 }}>{u.phone}</span>
                    <span className={u.balance > 0 ? "pos" : ""}>
                      KES {u.balance.toLocaleString()}
                    </span>
                    <span style={{ opacity: 0.6, fontSize: "12px" }}>
                      {new Date(u.createdAt).toLocaleDateString("en-KE")}
                    </span>
                  </div>
                ))}
                {filteredUsers.length === 0 && (
                  <div className="empty-state">
                    <p>No users found</p>
                    <span>{searchUser ? "Try a different search term" : "No users registered yet"}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TRANSACTIONS */}
        {activeTab === "transactions" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <h2 style={{ margin: "0 0 5px 0" }}>Transaction Ledger</h2>
                <p style={{ margin: 0, opacity: 0.5, fontSize: "13px" }}>
                  Complete audit trail — {filteredTx.length} of {allTransactions.length} transactions
                </p>
              </div>
              <input
                className="admin-search"
                placeholder="🔍 Search by user, type or description..."
                value={searchTx}
                onChange={e => setSearchTx(e.target.value)}
              />
            </div>

            {loading ? (
              <div className="empty-state"><FontAwesomeIcon icon={faSpinner} spin /> Loading transactions...</div>
            ) : (
              <div className="admin-table">
                <div className="admin-table-header admin-tx-full-grid">
                  <span>User</span>
                  <span>Type</span>
                  <span>Amount</span>
                  <span>Fee</span>
                  <span>Description</span>
                  <span>Status</span>
                  <span>Date</span>
                </div>
                {filteredTx.map(tx => (
                  <div key={tx.id} className={`admin-table-row admin-tx-full-grid ${tx.flagged ? "flagged-row" : ""}`}>
                    <span>
                      <strong>@{tx.user?.username}</strong>
                      {tx.flagged && <span style={{ color: "#ef4444" }}> 🚨</span>}
                    </span>
                    <span style={{ color: getTypeColor(tx.type), fontWeight: 600, fontSize: "12px" }}>{tx.type}</span>
                    <span className={isCredit(tx.type) ? "pos" : "neg"}>
                      {isCredit(tx.type) ? "+" : "-"}KES {tx.amount.toLocaleString()}
                    </span>
                    <span style={{ opacity: 0.7 }}>KES {tx.fee.toLocaleString()}</span>
                    <span style={{ opacity: 0.7, fontSize: "12px" }}>{tx.description}</span>
                    <span>
                      <span className={`admin-status-badge ${tx.status === "SUCCESS" ? "success" : "failed"}`}>
                        {tx.status}
                      </span>
                    </span>
                    <span style={{ opacity: 0.6, fontSize: "12px" }}>
                      {new Date(tx.createdAt).toLocaleDateString("en-KE")}
                    </span>
                  </div>
                ))}
                {filteredTx.length === 0 && (
                  <div className="empty-state">
                    <p>No transactions found</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* FLAGGED */}
        {activeTab === "flagged" && (
          <div>
            <div style={{ marginBottom: "20px" }}>
              <h2 style={{ margin: "0 0 5px 0" }}>🚨 Fraud & Risk Detection</h2>
              <p style={{ margin: 0, opacity: 0.5, fontSize: "13px" }}>
                Transactions automatically flagged for review based on risk rules
              </p>
            </div>

            <div className="admin-risk-rules">
              <h4>Active Risk Rules</h4>
              <div className="admin-compliance-grid">
                <div className="compliance-item">
                  <span>Large Transaction Flag</span>
                  <strong style={{ color: "#f59e0b" }}>KES 50,000+</strong>
                </div>
                <div className="compliance-item">
                  <span>Auto-Review</span>
                  <strong style={{ color: "#22c55e" }}>● Enabled</strong>
                </div>
                <div className="compliance-item">
                  <span>Flagged Count</span>
                  <strong className="neg">{flagged.length}</strong>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="empty-state"><FontAwesomeIcon icon={faSpinner} spin /> Loading...</div>
            ) : (
              <div className="admin-table" style={{ marginTop: "20px" }}>
                <div className="admin-table-header admin-flagged-grid">
                  <span>User</span>
                  <span>Type</span>
                  <span>Amount</span>
                  <span>Risk Reason</span>
                  <span>Date</span>
                </div>
                {flagged.map(tx => (
                  <div key={tx.id} className="admin-table-row admin-flagged-grid flagged-row">
                    <span>
                      <strong>@{tx.user?.username}</strong>
                      <br />
                      <span style={{ fontSize: "11px", opacity: 0.6 }}>{tx.user?.fullName}</span>
                    </span>
                    <span style={{ color: "#f59e0b", fontWeight: 600 }}>{tx.type}</span>
                    <span className="neg" style={{ fontWeight: 700 }}>KES {tx.amount.toLocaleString()}</span>
                    <span>
                      <span className="admin-risk-badge">⚠️ {tx.reason}</span>
                    </span>
                    <span style={{ opacity: 0.6, fontSize: "12px" }}>
                      {new Date(tx.createdAt).toLocaleString("en-KE")}
                    </span>
                  </div>
                ))}
                {flagged.length === 0 && (
                  <div className="empty-state">
                    <p>✅ No flagged transactions</p>
                    <span>All transactions are within normal parameters</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("nafaka_token"));
  const [user, setUser] = useState<User | null>(() => {
    const u = localStorage.getItem("nafaka_user");
    return u ? JSON.parse(u) : null;
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState("Dashboard");
  const [collapsed, setCollapsed] = useState(true);

  const [balance, setBalance] = useState<number | null>(null);
  const [vaultBalance, setVaultBalance] = useState<number>(0);
  const [vaultGoal, setVaultGoal] = useState<number | null>(null);
  const [vaultGoalName, setVaultGoalName] = useState<string>("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [analytics, setAnalytics] = useState<{
    summary: Record<string, number | string>;
    dailySpending: { date: string; amount: number }[];
    monthlySpending: { month: string; amount: number }[];
  } | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [limits, setLimits] = useState<Limits>({ dailyLimit: null, monthlyLimit: null });
  const [limitsForm, setLimitsForm] = useState({ dailyLimit: "", monthlyLimit: "" });

  const [modal, setModal] = useState<"send" | "request" | null>(null);
  const [sendForm, setSendForm] = useState({ username: "", amount: "", note: "" });
  const [requestForm, setRequestForm] = useState({ username: "", amount: "", note: "" });
  const [profileForm, setProfileForm] = useState({ fullName: "", phone: "", username: "" });
  const [securityForm, setSecurityForm] = useState({ currentPassword: "", newPassword: "" });
  const [vaultForm, setVaultForm] = useState({ amount: "", goalAmount: "", goalName: "" });

  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [depositStep, setDepositStep] = useState<"idle" | "processing" | "done">("idle");
  const [withdrawStep, setWithdrawStep] = useState<"idle" | "processing" | "done">("idle");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const setL = (key: string, val: boolean) => setLoading(p => ({ ...p, [key]: val }));
  const setM = (key: string, val: string) => setMsg(p => ({ ...p, [key]: val }));

  const fetchBalance = useCallback(async () => {
    try { const d = await apiFetch("/wallet"); setBalance(d.balance); } catch {}
  }, []);

  const fetchVault = useCallback(async () => {
    try {
      const d = await apiFetch("/vault");
      setVaultBalance(d.balance);
      setVaultGoal(d.goal);
      setVaultGoalName(d.goalName || "");
    } catch {}
  }, []);

  const fetchTransactions = useCallback(async () => {
    try { const d = await apiFetch("/transactions"); setTransactions(d.transactions); } catch {}
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const d = await apiFetch("/notifications");
      setNotifications(d.notifications);
      setUnreadCount(d.unreadCount);
    } catch {}
  }, []);

  const fetchRewards = useCallback(async () => {
    try { const d = await apiFetch("/rewards"); setRewards(d.rewards); } catch {}
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try { const d = await apiFetch("/analytics/overview"); setAnalytics(d); } catch {}
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      const d = await apiFetch("/settings/profile");
      setProfile(d.user);
      setProfileForm({ fullName: d.user.fullName, phone: d.user.phone, username: d.user.username });
    } catch {}
  }, []);

  const fetchLimits = useCallback(async () => {
    try {
      const d = await apiFetch("/settings/limits");
      setLimits(d);
      setLimitsForm({
        dailyLimit: d.dailyLimit ? String(d.dailyLimit) : "",
        monthlyLimit: d.monthlyLimit ? String(d.monthlyLimit) : "",
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (!token || user?.role === "ADMIN") return;
    fetchBalance(); fetchTransactions(); fetchNotifications(); fetchVault();
  }, [token, user, fetchBalance, fetchTransactions, fetchNotifications, fetchVault]);

  useEffect(() => {
    if (active === "Analytics") fetchAnalytics();
    if (active === "Rewards") fetchRewards();
    if (active === "Settings") { fetchProfile(); fetchLimits(); }
    if (active === "Vault") fetchVault();
    if (active === "Notifications") {
      fetchNotifications();
      setUnreadCount(0);
      apiFetch("/notifications/mark-all-read", { method: "PATCH" }).catch(() => {});
    }
  }, [active, fetchAnalytics, fetchRewards, fetchProfile, fetchLimits, fetchVault, fetchNotifications]);

  const handleAuth = (t: string, u: User) => { setToken(t); setUser(u); };

  const handleLogout = () => {
    localStorage.removeItem("nafaka_token");
    localStorage.removeItem("nafaka_user");
    setToken(null); setUser(null); setActive("Dashboard");
    setBalance(null); setTransactions([]); setNotifications([]);
  };

  // ─── Deposit ─────────────────────────────────────────────
  const handleDeposit = async () => {
    if (!depositAmount) return;
    setDepositStep("processing"); setM("deposit", "");
    try {
      await new Promise(r => setTimeout(r, 8000));
      await apiFetch("/mpesa/deposit", { method: "POST", body: JSON.stringify({ amount: Number(depositAmount) }) });
      setDepositStep("done");
      setM("deposit", `KES ${Number(depositAmount).toLocaleString()} deposited successfully!`);
      setDepositAmount("");
      await fetchBalance(); await fetchTransactions(); await fetchNotifications();
      setTimeout(() => { setActive("Dashboard"); setDepositStep("idle"); setM("deposit", ""); }, 2000);
    } catch (e: unknown) {
      setDepositStep("idle");
      setM("deposit", e instanceof Error ? e.message : "Deposit failed");
    }
  };

  // ─── Withdraw ────────────────────────────────────────────
  const handleWithdraw = async () => {
    if (!withdrawAmount) return;
    setWithdrawStep("processing"); setM("withdraw", "");
    try {
      await new Promise(r => setTimeout(r, 5000));
      const d = await apiFetch("/mpesa/withdraw", { method: "POST", body: JSON.stringify({ amount: Number(withdrawAmount) }) });
      setWithdrawStep("done");
      setM("withdraw", d.message);
      setWithdrawAmount("");
      await fetchBalance(); await fetchTransactions(); await fetchNotifications();
      setTimeout(() => { setActive("Dashboard"); setWithdrawStep("idle"); setM("withdraw", ""); }, 3000);
    } catch (e: unknown) {
      setWithdrawStep("idle");
      setM("withdraw", e instanceof Error ? e.message : "Withdrawal failed");
    }
  };

  // ─── Send ────────────────────────────────────────────────
  const handleSend = async () => {
    if (!sendForm.username || !sendForm.amount) return;
    setL("send", true); setM("send", "");
    try {
      const d = await apiFetch("/transactions/send", {
        method: "POST",
        body: JSON.stringify({ username: sendForm.username, amount: Number(sendForm.amount), note: sendForm.note }),
      });
      setM("send", d.message);
      setSendForm({ username: "", amount: "", note: "" });
      await fetchBalance(); await fetchTransactions(); await fetchNotifications();
      setTimeout(() => { setModal(null); setM("send", ""); }, 3000);
    } catch (e: unknown) {
      setM("send", e instanceof Error ? e.message : "Send failed");
    } finally { setL("send", false); }
  };

  // ─── Request ─────────────────────────────────────────────
  const handleRequest = async () => {
    if (!requestForm.username || !requestForm.amount) return;
    setL("request", true); setM("request", "");
    try {
      const d = await apiFetch("/transactions/request", {
        method: "POST",
        body: JSON.stringify({ username: requestForm.username, amount: Number(requestForm.amount), note: requestForm.note }),
      });
      setM("request", d.message);
      setRequestForm({ username: "", amount: "", note: "" });
      setTimeout(() => { setModal(null); setM("request", ""); }, 3000);
    } catch (e: unknown) {
      setM("request", e instanceof Error ? e.message : "Request failed");
    } finally { setL("request", false); }
  };

  // ─── Vault ───────────────────────────────────────────────
  const handleVaultDeposit = async () => {
    if (!vaultForm.amount) return;
    setL("vault-deposit", true); setM("vault", "");
    try {
      const d = await apiFetch("/vault/deposit", { method: "POST", body: JSON.stringify({ amount: Number(vaultForm.amount) }) });
      setM("vault", d.message);
      setVaultForm({ ...vaultForm, amount: "" });
      await fetchBalance(); await fetchVault(); await fetchTransactions();
    } catch (e: unknown) {
      setM("vault", e instanceof Error ? e.message : "Vault deposit failed");
    } finally { setL("vault-deposit", false); }
  };

  const handleVaultWithdraw = async () => {
    if (!vaultForm.amount) return;
    setL("vault-withdraw", true); setM("vault", "");
    try {
      const d = await apiFetch("/vault/withdraw", { method: "POST", body: JSON.stringify({ amount: Number(vaultForm.amount) }) });
      setM("vault", d.message);
      setVaultForm({ ...vaultForm, amount: "" });
      await fetchBalance(); await fetchVault(); await fetchTransactions();
    } catch (e: unknown) {
      setM("vault", e instanceof Error ? e.message : "Vault withdrawal failed");
    } finally { setL("vault-withdraw", false); }
  };

  const handleVaultGoal = async () => {
    setL("vault-goal", true);
    try {
      await apiFetch("/vault/goal", {
        method: "PATCH",
        body: JSON.stringify({ goal: Number(vaultForm.goalAmount), goalName: vaultForm.goalName }),
      });
      setM("vault", "Savings goal updated!");
      await fetchVault();
    } catch (e: unknown) {
      setM("vault", e instanceof Error ? e.message : "Failed to update goal");
    } finally { setL("vault-goal", false); }
  };

  // ─── Rewards ─────────────────────────────────────────────
  const handleRedeemReward = async (userRewardId: string) => {
    setL(`reward-${userRewardId}`, true);
    try {
      const d = await apiFetch(`/rewards/${userRewardId}/redeem`, { method: "POST" });
      setM(`reward-${userRewardId}`, d.message);
      fetchRewards(); fetchBalance();
    } catch (e: unknown) {
      setM(`reward-${userRewardId}`, e instanceof Error ? e.message : "Failed to redeem");
    } finally { setL(`reward-${userRewardId}`, false); }
  };

  const handleUpdateProfile = async () => {
    setL("profile", true); setM("profile", "");
    try {
      await apiFetch("/settings/profile", { method: "PATCH", body: JSON.stringify(profileForm) });
      setM("profile", "Profile updated successfully!");
      fetchProfile();
    } catch (e: unknown) {
      setM("profile", e instanceof Error ? e.message : "Update failed");
    } finally { setL("profile", false); }
  };

  const handleUpdatePassword = async () => {
    setL("security", true); setM("security", "");
    try {
      await apiFetch("/settings/security", { method: "PATCH", body: JSON.stringify(securityForm) });
      setM("security", "Password updated successfully!");
      setSecurityForm({ currentPassword: "", newPassword: "" });
    } catch (e: unknown) {
      setM("security", e instanceof Error ? e.message : "Update failed");
    } finally { setL("security", false); }
  };

  const handleUpdateLimits = async () => {
    setL("limits", true); setM("limits", "");
    try {
      await apiFetch("/settings/limits", {
        method: "PATCH",
        body: JSON.stringify({
          dailyLimit: limitsForm.dailyLimit ? Number(limitsForm.dailyLimit) : null,
          monthlyLimit: limitsForm.monthlyLimit ? Number(limitsForm.monthlyLimit) : null,
        }),
      });
      setM("limits", "Spending limits updated successfully!");
      fetchLimits(); fetchNotifications();
    } catch (e: unknown) {
      setM("limits", e instanceof Error ? e.message : "Update failed");
    } finally { setL("limits", false); }
  };

  const handlePrintReceipt = (tx: Transaction) => {
    const win = window.open("", "_blank");
    if (!win) return;
    const isCredit = ["DEPOSIT", "RECEIVE", "VAULT_WITHDRAWAL"].includes(tx.type);
    win.document.write(`
      <html><head><title>NAFAKA Receipt</title>
      <style>
        body{font-family:Arial;padding:30px;max-width:450px;margin:auto;background:#fff;}
        .header{text-align:center;border-bottom:2px solid #1d4ed8;padding-bottom:15px;margin-bottom:20px;}
        h1{color:#1d4ed8;margin:0;font-size:24px;} h3{color:#555;margin:5px 0;}
        table{width:100%;border-collapse:collapse;margin-top:15px;}
        td{padding:10px;border-bottom:1px solid #eee;font-size:14px;}
        td:first-child{color:#888;width:40%;}
        .amount{font-size:28px;font-weight:bold;text-align:center;padding:15px;
          color:${isCredit ? "#22c55e" : "#ef4444"};}
        .status{background:${tx.status === "SUCCESS" ? "#dcfce7" : "#fef2f2"};
          color:${tx.status === "SUCCESS" ? "#166534" : "#991b1b"};
          padding:4px 10px;border-radius:20px;font-size:12px;}
        .footer{text-align:center;margin-top:20px;font-size:11px;color:#aaa;}
      </style></head>
      <body>
        <div class="header">
          <h1>NAFAKA</h1>
          <h3>Digital Wallet — Transaction Receipt</h3>
        </div>
        <div class="amount">${isCredit ? "+" : "-"}KES ${tx.amount.toLocaleString()}</div>
        <table>
          <tr><td>Transaction ID</td><td>${tx.id.toUpperCase()}</td></tr>
          <tr><td>Type</td><td>${tx.type.replace("_", " ")}</td></tr>
          <tr><td>Description</td><td>${tx.description}</td></tr>
          <tr><td>Fee</td><td>KES ${(tx.fee || 0).toLocaleString()}</td></tr>
          <tr><td>Total</td><td>KES ${(tx.amount + (tx.fee || 0)).toLocaleString()}</td></tr>
          <tr><td>Status</td><td><span class="status">${tx.status}</span></td></tr>
          <tr><td>Counterparty</td><td>${tx.counterparty || "N/A"}</td></tr>
          <tr><td>Date & Time</td><td>${new Date(tx.createdAt).toLocaleString("en-KE")}</td></tr>
          <tr><td>Account</td><td>${user?.fullName || ""}</td></tr>
          <tr><td>Username</td><td>@${user?.username || ""}</td></tr>
        </table>
        <div class="footer">
          <p>NAFAKA Digital Wallet © 2026 | support@nafaka.co.ke</p>
          <p>This is an official NAFAKA transaction receipt.</p>
        </div>
        <script>window.print()</script>
      </body></html>
    `);
    win.document.close();
  };

  if (!token) return <AuthScreen onAuth={handleAuth} />;
  if (user?.role === "ADMIN") return <AdminPanel onLogout={handleLogout} />;

  const goBack = () => setActive("Dashboard");
  const isCredit = (type: string) => ["DEPOSIT", "RECEIVE", "VAULT_WITHDRAWAL"].includes(type);

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      DEPOSIT: "Deposit", WITHDRAWAL: "Withdrawal", SEND: "Sent",
      RECEIVE: "Received", VAULT_DEPOSIT: "Vault Save", VAULT_WITHDRAWAL: "Vault Withdraw",
    };
    return labels[type] || type;
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      DEPOSIT: "📲", WITHDRAWAL: "📤", SEND: "💸",
      RECEIVE: "💰", VAULT_DEPOSIT: "🏦", VAULT_WITHDRAWAL: "🏦",
    };
    return icons[type] || "💳";
  };

  return (
    <div className="app" onClick={() => menuOpen && setMenuOpen(false)}>

      {/* MODALS */}
      {modal === "send" && (
        <Modal title="Send Money" onClose={() => { setModal(null); setM("send", ""); setSendForm({ username: "", amount: "", note: "" }); }}>
          {!msg.send ? (<>
            <p style={{ fontSize: "13px", opacity: 0.6, margin: "0 0 10px 0" }}>
              Send money instantly to any NAFAKA user using their username.
            </p>
            <input className="wallet-input" placeholder="@username"
              value={sendForm.username} onChange={e => setSendForm({ ...sendForm, username: e.target.value })} />
            <input className="wallet-input" type="number" placeholder="Amount (KES)"
              value={sendForm.amount} onChange={e => setSendForm({ ...sendForm, amount: e.target.value })} />
            <input className="wallet-input" placeholder="Note (optional)"
              value={sendForm.note} onChange={e => setSendForm({ ...sendForm, note: e.target.value })} />
            <div className="fee-notice">
              {sendForm.amount && Number(sendForm.amount) > 0 && (
                <span>Fee: KES {Math.max(Math.ceil(Number(sendForm.amount) * 0.005), 2)} · Total: KES {(Number(sendForm.amount) + Math.max(Math.ceil(Number(sendForm.amount) * 0.005), 2)).toLocaleString()}</span>
              )}
            </div>
            <p style={{ fontSize: "13px", opacity: 0.6 }}>Available: KES {balance?.toLocaleString() || 0}</p>
            {msg.send && <p className="form-error">{msg.send}</p>}
            <button className="modal-btn" onClick={handleSend}
              disabled={loading.send || !sendForm.username || !sendForm.amount}>
              {loading.send ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faPaperPlane} /> Send</>}
            </button>
          </>) : (
            <div className="modal-processing">
              <p className="form-success" style={{ fontSize: "15px" }}>✅ {msg.send}</p>
            </div>
          )}
        </Modal>
      )}

      {modal === "request" && (
        <Modal title="Request Money" onClose={() => { setModal(null); setM("request", ""); setRequestForm({ username: "", amount: "", note: "" }); }}>
          {!msg.request ? (<>
            <p style={{ fontSize: "13px", opacity: 0.6, margin: "0 0 10px 0" }}>
              Send a money request to another NAFAKA user. They will receive a notification.
            </p>
            <input className="wallet-input" placeholder="@username"
              value={requestForm.username} onChange={e => setRequestForm({ ...requestForm, username: e.target.value })} />
            <input className="wallet-input" type="number" placeholder="Amount (KES)"
              value={requestForm.amount} onChange={e => setRequestForm({ ...requestForm, amount: e.target.value })} />
            <input className="wallet-input" placeholder="Note (optional)"
              value={requestForm.note} onChange={e => setRequestForm({ ...requestForm, note: e.target.value })} />
            {msg.request && <p className="form-error">{msg.request}</p>}
            <button className="modal-btn" onClick={handleRequest}
              disabled={loading.request || !requestForm.username || !requestForm.amount}>
              {loading.request ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faHandHoldingUsd} /> Request</>}
            </button>
          </>) : (
            <div className="modal-processing">
              <p className="form-success" style={{ fontSize: "15px" }}>✅ {msg.request}</p>
            </div>
          )}
        </Modal>
      )}

      {/* TOP BAR */}
      <header className="topbar">
        <div className="left">
          <div className="hamburger" onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}>☰</div>
          <h1 className="logo">NAFAKA</h1>
        </div>
        <div className="right">
          <div className="topbar-icon" title="Notifications"
            onClick={e => { e.stopPropagation(); setActive("Notifications"); }}>
            <FontAwesomeIcon icon={faBell} />
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </div>
          <div className="topbar-icon" title="Settings"
            onClick={e => { e.stopPropagation(); setActive("Settings"); }}>
            <FontAwesomeIcon icon={faCog} />
          </div>
          <button className="logout" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* SIDEBAR */}
      <div className={`sidebar ${menuOpen ? "open" : ""} ${collapsed ? "collapsed" : ""}`}
        onClick={e => e.stopPropagation()}>
        <div className="sidebar-header">
          <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? "→" : "←"}
          </button>
        </div>
        {[
          { name: "Dashboard", icon: faHome },
          { name: "Wallet", icon: faWallet },
          { name: "Vault", icon: faPiggyBank },
          { name: "Transactions", icon: faExchangeAlt },
          { name: "Analytics", icon: faChartLine },
          { name: "Rewards", icon: faGift },
          { name: "Settings", icon: faCog },
        ].map(({ name, icon }) => (
          <div key={name} className={`menu-item ${active === name ? "active" : ""}`}
            onClick={() => setActive(name)} title={name}>
            <FontAwesomeIcon icon={icon} /><span>{name}</span>
          </div>
        ))}
      </div>

      {/* MAIN */}
      <main className="main">

        {/* DASHBOARD */}
        {active === "Dashboard" && (
          <div>
            <section className="balance-card">
              <div className="balance-card-content">
                <div>
                  <p className="label">Available Balance</p>
                  <h2>{balance !== null ? `KES ${Number(balance).toLocaleString()}` : "Loading..."}</h2>
                  <span className="sub">Hi, {user?.fullName?.split(" ")[0]} 👋 · @{user?.username}</span>
                </div>
                {vaultBalance > 0 && (
                  <div className="vault-mini">
                    <FontAwesomeIcon icon={faPiggyBank} />
                    <span>Vault: KES {vaultBalance.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </section>

            <section className="actions">
              <div className="action-card" onClick={() => setModal("send")}>
                <FontAwesomeIcon icon={faArrowUp} /><span>Send</span>
              </div>
              <div className="action-card" onClick={() => setModal("request")}>
                <FontAwesomeIcon icon={faArrowDown} /><span>Request</span>
              </div>
              <div className="action-card" onClick={() => setActive("Wallet")}>
                <FontAwesomeIcon icon={faMobileAlt} /><span>Deposit</span>
              </div>
              <div className="action-card" onClick={() => setActive("Wallet")}>
                <FontAwesomeIcon icon={faMoneyBillWave} /><span>Withdraw</span>
              </div>
            </section>

            <section className="grid">
              <div className="card">
                <div className="card-header-row">
                  <h3>Recent Transactions</h3>
                  <span className="view-all" onClick={() => setActive("Transactions")}>View all →</span>
                </div>
                {transactions.slice(0, 5).map(tx => (
                  <div key={tx.id} className="tx-item">
                    <div className="tx-icon">{getTypeIcon(tx.type)}</div>
                    <div className="tx-details">
                      <p>{getTypeLabel(tx.type)}</p>
                      <span>{tx.counterparty ? `${tx.counterparty} · ` : ""}{new Date(tx.createdAt).toLocaleDateString("en-KE")}</span>
                    </div>
                    <div className="tx-amount">
                      <strong className={isCredit(tx.type) ? "pos" : "neg"}>
                        {isCredit(tx.type) ? "+" : "-"}KES {tx.amount.toLocaleString()}
                      </strong>
                      <span className="tx-status completed">Completed</span>
                    </div>
                  </div>
                ))}
                {transactions.length === 0 && (
                  <div className="empty-state">
                    <p>No transactions yet</p>
                    <span>Make your first deposit to get started</span>
                  </div>
                )}
              </div>

              <div className="card spending-card" onClick={() => setActive("Analytics")}>
                <div className="card-header-row">
                  <h3>Spending Overview</h3>
                  <span className="view-all">Analytics →</span>
                </div>
                {analytics?.dailySpending && analytics.dailySpending.length > 0 ? (<>
                  <div className="spending-stats">
                    <div>
                      <span>This Month</span>
                      <strong className="neg">KES {Number(analytics.summary.monthlySpend).toLocaleString()}</strong>
                    </div>
                    <div>
                      <span>Total In</span>
                      <strong className="pos">KES {Number(analytics.summary.totalDeposited).toLocaleString()}</strong>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={analytics.dailySpending}>
                      <defs>
                        <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="amount" stroke="#3b82f6" fill="url(#colorSpend)" strokeWidth={2} dot={false} />
                      <Tooltip contentStyle={{ background: "#020617", border: "none", fontSize: "11px" }}
                        formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Spent"]} />
                    </AreaChart>
                  </ResponsiveContainer>
                </>) : (
                  <div className="chart-placeholder" style={{ height: "150px" }}>
                    <p style={{ margin: 0 }}>📊</p>
                    <p style={{ margin: "5px 0 0 0", fontSize: "13px" }}>Make transactions to see your spending chart</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* WALLET */}
        {active === "Wallet" && (
          <section className="wallet-section">
            <h2>Wallet</h2>
            <div className="wallet-balance-card">
              <p className="label">Available Balance</p>
              <h2>{balance !== null ? `KES ${Number(balance).toLocaleString()}` : "Loading..."}</h2>
              <span className="sub">@{user?.username}</span>
            </div>
            <div className="wallet-actions-grid">
              <div className="wallet-action-card">
                <h3><FontAwesomeIcon icon={faMobileAlt} /> Deposit via M-Pesa</h3>
                <p style={{ fontSize: "12px", opacity: 0.5, margin: "0 0 10px 0" }}>Free · Instant</p>
                {depositStep === "idle" && (<>
                  <input className="wallet-input" type="number" placeholder="Amount (KES)"
                    value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />
                  {msg.deposit && <p className="form-error">{msg.deposit}</p>}
                  <button className="wallet-action-btn deposit-btn" onClick={handleDeposit} disabled={!depositAmount}>
                    Deposit
                  </button>
                </>)}
                {depositStep === "processing" && (
                  <div className="wallet-processing">
                    <FontAwesomeIcon icon={faSpinner} spin style={{ fontSize: "28px", color: "#3b82f6" }} />
                    <p>Processing deposit...</p>
                    <p style={{ opacity: 0.5, fontSize: "12px" }}>Please wait</p>
                  </div>
                )}
                {depositStep === "done" && (
                  <div className="wallet-processing">
                    <p className="form-success" style={{ fontSize: "16px" }}>✅ {msg.deposit}</p>
                  </div>
                )}
              </div>

              <div className="wallet-action-card">
                <h3><FontAwesomeIcon icon={faMoneyBillWave} /> Withdraw to M-Pesa</h3>
                <p style={{ fontSize: "12px", opacity: 0.5, margin: "0 0 10px 0" }}>1% fee · Min KES 5</p>
                {withdrawStep === "idle" && (<>
                  <input className="wallet-input" type="number" placeholder="Amount (KES)"
                    value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} />
                  {withdrawAmount && Number(withdrawAmount) > 0 && (
                    <p style={{ fontSize: "12px", color: "#94a3b8" }}>
                      Fee: KES {Math.max(Math.ceil(Number(withdrawAmount) * 0.01), 5)} · You receive: KES {Number(withdrawAmount).toLocaleString()}
                    </p>
                  )}
                  <p style={{ fontSize: "13px", opacity: 0.6 }}>Available: KES {balance?.toLocaleString() || 0}</p>
                  {msg.withdraw && <p className="form-error">{msg.withdraw}</p>}
                  <button className="wallet-action-btn withdraw-btn" onClick={handleWithdraw} disabled={!withdrawAmount}>
                    Withdraw
                  </button>
                </>)}
                {withdrawStep === "processing" && (
                  <div className="wallet-processing">
                    <FontAwesomeIcon icon={faSpinner} spin style={{ fontSize: "28px", color: "#9333ea" }} />
                    <p>Processing withdrawal...</p>
                    <p style={{ opacity: 0.5, fontSize: "12px" }}>Sending to your M-Pesa</p>
                  </div>
                )}
                {withdrawStep === "done" && (
                  <div className="wallet-processing">
                    <p className="form-success" style={{ fontSize: "15px" }}>✅ {msg.withdraw}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="fee-info-card">
              <h4>💡 NAFAKA Fee Structure</h4>
              <div className="fee-table">
                <div className="fee-row"><span>Deposits</span><strong className="pos">FREE</strong></div>
                <div className="fee-row"><span>Withdrawals to M-Pesa</span><strong>1% (min KES 5)</strong></div>
                <div className="fee-row"><span>Send to NAFAKA user</span><strong>0.5% (min KES 2)</strong></div>
                <div className="fee-row"><span>Savings Vault</span><strong className="pos">FREE</strong></div>
              </div>
            </div>
          </section>
        )}

        {/* SAVINGS VAULT */}
        {active === "Vault" && (
          <section className="vault-section">
            <h2>🏦 Savings Vault</h2>
            <p style={{ opacity: 0.6, marginBottom: "20px" }}>
              Lock your money away from daily spending. Set a savings goal and track your progress.
            </p>

            <div className="vault-balance-card">
              <p className="label">Vault Balance</p>
              <h2>KES {vaultBalance.toLocaleString()}</h2>
              {vaultGoal && (
                <div className="vault-goal-progress">
                  <div className="vault-goal-label">
                    <span>{vaultGoalName || "Savings Goal"}</span>
                    <span>KES {vaultBalance.toLocaleString()} / KES {vaultGoal.toLocaleString()}</span>
                  </div>
                  <div className="vault-progress-bar">
                    <div className="vault-progress-fill"
                      style={{ width: `${Math.min((vaultBalance / vaultGoal) * 100, 100)}%` }} />
                  </div>
                  <span style={{ fontSize: "12px", opacity: 0.6 }}>
                    {((vaultBalance / vaultGoal) * 100).toFixed(1)}% of goal reached
                  </span>
                </div>
              )}
            </div>

            <div className="vault-actions">
              <div className="wallet-action-card">
                <h3>Move to Vault</h3>
                <p style={{ fontSize: "12px", opacity: 0.5 }}>Transfer from wallet to vault · FREE</p>
                <input className="wallet-input" type="number" placeholder="Amount (KES)"
                  value={vaultForm.amount} onChange={e => setVaultForm({ ...vaultForm, amount: e.target.value })} />
                <p style={{ fontSize: "13px", opacity: 0.6 }}>Wallet: KES {balance?.toLocaleString() || 0}</p>
                {msg.vault && <p className={msg.vault.includes("failed") ? "form-error" : "form-success"}>{msg.vault}</p>}
                <button className="wallet-action-btn deposit-btn" onClick={handleVaultDeposit}
                  disabled={loading["vault-deposit"] || !vaultForm.amount}>
                  {loading["vault-deposit"] ? <FontAwesomeIcon icon={faSpinner} spin /> : "Save to Vault"}
                </button>
              </div>

              <div className="wallet-action-card">
                <h3>Withdraw from Vault</h3>
                <p style={{ fontSize: "12px", opacity: 0.5 }}>Transfer back to wallet · FREE</p>
                <input className="wallet-input" type="number" placeholder="Amount (KES)"
                  value={vaultForm.amount} onChange={e => setVaultForm({ ...vaultForm, amount: e.target.value })} />
                <p style={{ fontSize: "13px", opacity: 0.6 }}>Vault: KES {vaultBalance.toLocaleString()}</p>
                <button className="wallet-action-btn withdraw-btn" onClick={handleVaultWithdraw}
                  disabled={loading["vault-withdraw"] || !vaultForm.amount}>
                  {loading["vault-withdraw"] ? <FontAwesomeIcon icon={faSpinner} spin /> : "Withdraw from Vault"}
                </button>
              </div>
            </div>

            <div className="wallet-action-card" style={{ marginTop: "20px" }}>
              <h3>🎯 Set Savings Goal</h3>
              <input className="wallet-input" placeholder="Goal name (e.g. New Phone, Rent)"
                value={vaultForm.goalName} onChange={e => setVaultForm({ ...vaultForm, goalName: e.target.value })} />
              <input className="wallet-input" type="number" placeholder="Target amount (KES)"
                value={vaultForm.goalAmount} onChange={e => setVaultForm({ ...vaultForm, goalAmount: e.target.value })} />
              <button className="wallet-action-btn deposit-btn" onClick={handleVaultGoal}
                disabled={loading["vault-goal"]}>
                {loading["vault-goal"] ? "Saving..." : "Set Goal"}
              </button>
            </div>
          </section>
        )}

        {/* TRANSACTIONS */}
        {active === "Transactions" && (
          <section className="transactions-section">
            <h2>Transaction History</h2>
            <div className="print-receipt-wrapper">
              <button className="print-receipt-btn" onClick={() => transactions[0] && handlePrintReceipt(transactions[0])}>
                🖨️ Print Latest Receipt
              </button>
            </div>
            <div className="transactions-list">
              {transactions.map(tx => (
                <div key={tx.id} className="tx-detail-item">
                  <div className="tx-detail-header">
                    <div className="tx-detail-left">
                      <span className="tx-type-badge">{getTypeIcon(tx.type)} {getTypeLabel(tx.type)}</span>
                      <strong className={isCredit(tx.type) ? "pos" : "neg"} style={{ fontSize: "18px" }}>
                        {isCredit(tx.type) ? "+" : "-"}KES {tx.amount.toLocaleString()}
                      </strong>
                    </div>
                    <div className="tx-detail-right">
                      <span className="tx-status-badge completed">✅ Completed</span>
                      <button className="print-mini-btn" onClick={() => handlePrintReceipt(tx)}>🖨️</button>
                    </div>
                  </div>
                  <div className="tx-detail-body">
                    <div className="tx-detail-row"><span>Description</span><span>{tx.description}</span></div>
                    {tx.counterparty && <div className="tx-detail-row"><span>Counterparty</span><span>{tx.counterparty}</span></div>}
                    <div className="tx-detail-row"><span>Transaction Fee</span><span>KES {(tx.fee || 0).toLocaleString()}</span></div>
                    <div className="tx-detail-row"><span>Total</span><span>KES {(tx.amount + (tx.fee || 0)).toLocaleString()}</span></div>
                    <div className="tx-detail-row"><span>Date & Time</span><span>{new Date(tx.createdAt).toLocaleString("en-KE")}</span></div>
                    <div className="tx-detail-row"><span>Reference</span><span>TXN#{tx.id.slice(0, 8).toUpperCase()}</span></div>
                  </div>
                </div>
              ))}
              {transactions.length === 0 && (
                <div className="empty-state">
                  <p>No transactions yet</p>
                  <span>Your transaction history will appear here</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ANALYTICS */}
        {active === "Analytics" && (
          <section className="analytics-section">
            <h2>Spending Analytics</h2>
            {analytics ? (<>
              <div className="analytics-summary">
                <div className="summary-card">
                  <span>Total Deposited</span>
                  <strong className="pos">KES {Number(analytics.summary.totalDeposited).toLocaleString()}</strong>
                </div>
                <div className="summary-card">
                  <span>Total Withdrawn</span>
                  <strong className="neg">KES {Number(analytics.summary.totalWithdrawn).toLocaleString()}</strong>
                </div>
                <div className="summary-card">
                  <span>This Month</span>
                  <strong>KES {Number(analytics.summary.monthlySpend).toLocaleString()}</strong>
                </div>
                <div className="summary-card">
                  <span>vs Last Month</span>
                  <strong style={{ color: Number(analytics.summary.spendChange) > 0 ? "#ef4444" : "#22c55e" }}>
                    {Number(analytics.summary.spendChange) > 0 ? "▲" : "▼"} {Math.abs(Number(analytics.summary.spendChange))}%
                  </strong>
                </div>
              </div>

              <div className="analytics-cards">
                <div className="card">
                  <h3>Daily Spending</h3>
                  <p style={{ fontSize: "12px", opacity: 0.5, margin: "0 0 15px 0" }}>Your spending activity this month</p>
                  {analytics.dailySpending.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={analytics.dailySpending} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <defs>
                          <linearGradient id="dailyGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }}
                          tickFormatter={v => v.slice(5)} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }}
                          tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip
                          contentStyle={{ background: "#020617", border: "1px solid #1e293b", borderRadius: "8px" }}
                          formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Spent"]} />
                        <Area type="monotone" dataKey="amount" stroke="#3b82f6"
                          fill="url(#dailyGrad)" strokeWidth={2.5} dot={{ fill: "#3b82f6", r: 3 }} activeDot={{ r: 5 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="chart-placeholder">
                      Make some transactions to see your daily spending chart
                    </div>
                  )}
                </div>

                <div className="card">
                  <h3>Monthly Spending</h3>
                  <p style={{ fontSize: "12px", opacity: 0.5, margin: "0 0 15px 0" }}>Your spending over the last 6 months</p>
                  {analytics.monthlySpending.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={analytics.monthlySpending} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <defs>
                          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#9333ea" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.7} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }}
                          tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip
                          contentStyle={{ background: "#020617", border: "1px solid #1e293b", borderRadius: "8px" }}
                          formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Spent"]} />
                        <Bar dataKey="amount" fill="url(#barGrad)" radius={[6, 6, 0, 0]} maxBarSize={60} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="chart-placeholder">
                      No monthly data yet
                    </div>
                  )}
                </div>
              </div>
            </>) : <p style={{ opacity: 0.5 }}>Loading analytics...</p>}
          </section>
        )}

        {/* REWARDS */}
        {active === "Rewards" && (
          <section className="rewards-section">
            <h2>Rewards</h2>
            <p style={{ opacity: 0.6, marginBottom: "20px" }}>
              Earn rewards for using NAFAKA. Redeem them for cash credited directly to your wallet.
            </p>
            <div className="rewards-list">
              {rewards.map(ur => (
                <div key={ur.id} className={`reward-card ${ur.redeemed ? "redeemed" : ""}`}>
                  <div className="reward-icon">
                    {ur.reward.type === "POINTS" ? "🔋" : ur.reward.type === "REFERRAL" ? "🤝" : "💰"}
                  </div>
                  <div className="reward-content">
                    <h3>{ur.reward.name}</h3>
                    <p>{ur.reward.description}</p>
                    <p className="reward-value">
                      {ur.reward.type === "POINTS" ? `${ur.reward.points} pts → KES ${Math.floor(ur.reward.points / 100)}` :
                        ur.reward.type === "REFERRAL" ? `KES ${ur.reward.points} cash` : "5% of your total deposits"}
                    </p>
                    {msg[`reward-${ur.id}`] && (
                      <p className={msg[`reward-${ur.id}`].includes("Failed") || msg[`reward-${ur.id}`].includes("failed") ? "form-error" : "form-success"}>
                        {msg[`reward-${ur.id}`]}
                      </p>
                    )}
                  </div>
                  <button
                    className={`reward-btn ${ur.redeemed ? "redeemed-btn" : ""}`}
                    disabled={ur.redeemed || loading[`reward-${ur.id}`]}
                    onClick={() => handleRedeemReward(ur.id)}>
                    {ur.redeemed ? "✅ Redeemed" : loading[`reward-${ur.id}`] ? <FontAwesomeIcon icon={faSpinner} spin /> : "Redeem"}
                  </button>
                </div>
              ))}
              {rewards.length === 0 && (
                <div className="empty-state">
                  <p>No rewards available</p>
                  <span>Rewards will appear here once your account is set up</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* SETTINGS */}
        {active === "Settings" && (
          <section className="settings-section">
            <div className="back-arrow" onClick={goBack}><FontAwesomeIcon icon={faArrowLeft} /> Back</div>
            <h2>Settings</h2>
            <div className="settings-list">

              <div className="setting-item setting-form">
                <h4>👤 Profile</h4>
                <input className="wallet-input" placeholder="Full Name"
                  value={profileForm.fullName} onChange={e => setProfileForm({ ...profileForm, fullName: e.target.value })} />
                <input className="wallet-input" placeholder="Phone"
                  value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} />
                <input className="wallet-input" placeholder="Username"
                  value={profileForm.username} onChange={e => setProfileForm({ ...profileForm, username: e.target.value })} />
                {msg.profile && <p className="form-success">{msg.profile}</p>}
                <button onClick={handleUpdateProfile} disabled={loading.profile}>
                  {loading.profile ? "Saving..." : "Save Profile"}
                </button>
              </div>

              <div className="setting-item setting-form">
                <h4>💰 Spending Limits</h4>
                <p style={{ fontSize: "13px", opacity: 0.6, margin: "0 0 10px 0" }}>
                  Control your spending. You'll be warned at 80% and blocked at 100%.
                </p>
                {limits.dailyLimit && (
                  <p style={{ fontSize: "13px", color: "#3b82f6" }}>Current daily limit: KES {limits.dailyLimit.toLocaleString()}</p>
                )}
                {limits.monthlyLimit && (
                  <p style={{ fontSize: "13px", color: "#3b82f6" }}>Current monthly limit: KES {limits.monthlyLimit.toLocaleString()}</p>
                )}
                <input className="wallet-input" type="number" placeholder="Daily Limit (KES) — leave empty to remove"
                  value={limitsForm.dailyLimit} onChange={e => setLimitsForm({ ...limitsForm, dailyLimit: e.target.value })} />
                <input className="wallet-input" type="number" placeholder="Monthly Limit (KES) — leave empty to remove"
                  value={limitsForm.monthlyLimit} onChange={e => setLimitsForm({ ...limitsForm, monthlyLimit: e.target.value })} />
                {msg.limits && <p className="form-success">{msg.limits}</p>}
                <button onClick={handleUpdateLimits} disabled={loading.limits}>
                  {loading.limits ? "Saving..." : "Save Limits"}
                </button>
              </div>

              <div className="setting-item setting-form">
                <h4>🔒 Security — Change Password</h4>
                <input className="wallet-input" type="password" placeholder="Current Password"
                  value={securityForm.currentPassword} onChange={e => setSecurityForm({ ...securityForm, currentPassword: e.target.value })} />
                <input className="wallet-input" type="password" placeholder="New Password"
                  value={securityForm.newPassword} onChange={e => setSecurityForm({ ...securityForm, newPassword: e.target.value })} />
                {msg.security && <p className={msg.security.includes("incorrect") ? "form-error" : "form-success"}>{msg.security}</p>}
                <button onClick={handleUpdatePassword} disabled={loading.security}>
                  {loading.security ? "Updating..." : "Update Password"}
                </button>
              </div>

              <div className="setting-item">
                <span>📧 Email</span>
                <span style={{ opacity: 0.6 }}>{profile?.email}</span>
              </div>
              <div className="setting-item">
                <span>📅 Account Created</span>
                <span style={{ opacity: 0.6 }}>
                  {profile ? new Date((profile as unknown as { createdAt: string }).createdAt).toLocaleDateString("en-KE") : ""}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* NOTIFICATIONS */}
        {active === "Notifications" && (
          <section className="notifications-section">
            <div className="back-arrow" onClick={goBack}><FontAwesomeIcon icon={faArrowLeft} /> Back</div>
            <h2>Notifications</h2>
            <div className="notifications-list">
              {notifications.map(n => (
                <div key={n.id}
                  className={`notification-item ${!n.isRead ? "unread" : ""} notification-${n.type?.toLowerCase() || "info"}`}
                  onClick={() => {
                    if (n.type === "TRANSACTION" || n.type === "REQUEST") setActive("Transactions");
                  }}>
                  <div className="notif-icon">
                    {n.type === "WARNING" ? "⚠️" : n.type === "TRANSACTION" ? "💳" : n.type === "REQUEST" ? "📨" : "ℹ️"}
                  </div>
                  <div className="notif-content">
                    <p>{n.message}</p>
                    {(n.type === "TRANSACTION" || n.type === "REQUEST") && (
                      <span className="notif-link">View in Transactions →</span>
                    )}
                    <span className="notif-date">{new Date(n.createdAt).toLocaleString("en-KE")}</span>
                  </div>
                </div>
              ))}
              {notifications.length === 0 && (
                <div className="empty-state">
                  <p>No notifications yet</p>
                  <span>You'll be notified about transactions, warnings and updates here</span>
                </div>
              )}
            </div>
          </section>
        )}

      </main>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <h4>Product</h4>
            <p style={{ cursor: "pointer" }} onClick={() => setActive("Wallet")}>Wallet</p>
            <p style={{ cursor: "pointer" }} onClick={() => setActive("Vault")}>Savings Vault</p>
            <p style={{ cursor: "pointer" }} onClick={() => setActive("Analytics")}>Analytics</p>
            <p style={{ cursor: "pointer" }} onClick={() => setActive("Rewards")}>Rewards</p>
          </div>
          <div>
            <h4>Support</h4>
            <p style={{ cursor: "pointer" }} onClick={() => setActive("Help")}>Help Center</p>
            <p style={{ cursor: "pointer" }} onClick={() => setActive("FAQs")}>FAQs</p>
            <p style={{ cursor: "pointer" }} onClick={() => setActive("Contact")}>Contact Us</p>
          </div>
          <div>
            <h4>Legal</h4>
            <p style={{ cursor: "pointer" }} onClick={() => setActive("Terms")}>Terms of Service</p>
            <p style={{ cursor: "pointer" }} onClick={() => setActive("Privacy")}>Privacy Policy</p>
          </div>
        </div>
        <p className="copyright">© 2026 NAFAKA Wallet · All rights reserved</p>
      </footer>

      {/* FOOTER PAGES */}
      {active === "Help" && (
        <div className="footer-page">
          <div className="back-arrow" onClick={goBack}><FontAwesomeIcon icon={faArrowLeft} /> Back</div>
          <h2>Help Center</h2>
          <div className="help-list">
            <div className="help-item"><h4>How do I deposit money?</h4><p>Go to Wallet → Deposit via M-Pesa. Enter the amount and confirm. Funds are credited instantly to your NAFAKA wallet at no charge.</p></div>
            <div className="help-item"><h4>How do I withdraw money?</h4><p>Go to Wallet → Withdraw to M-Pesa. Enter the amount. A 1% fee applies (minimum KES 5). Funds are sent to your registered M-Pesa number.</p></div>
            <div className="help-item"><h4>How do I send money to another user?</h4><p>Click Send on your dashboard and enter the recipient's NAFAKA username (e.g. @john_doe). A 0.5% fee applies (minimum KES 2).</p></div>
            <div className="help-item"><h4>How do I request money?</h4><p>Click Request on your dashboard and enter the username of the person you want to request from. They will receive a notification.</p></div>
            <div className="help-item"><h4>What is the Savings Vault?</h4><p>The Savings Vault lets you lock money away from daily spending. Set a savings goal and track your progress. Transfers to and from the vault are free.</p></div>
            <div className="help-item"><h4>How do spending limits work?</h4><p>Go to Settings → Spending Limits to set daily and monthly limits. You will receive a warning notification at 80% usage and transactions will be blocked at 100%.</p></div>
            <div className="help-item"><h4>How do rewards work?</h4><p>Visit the Rewards page to see available rewards and redeem them for cash credited directly to your wallet.</p></div>
          </div>
        </div>
      )}

      {active === "FAQs" && (
        <div className="footer-page">
          <div className="back-arrow" onClick={goBack}><FontAwesomeIcon icon={faArrowLeft} /> Back</div>
          <h2>Frequently Asked Questions</h2>
          <div className="help-list">
            <div className="help-item"><h4>Is NAFAKA safe?</h4><p>Yes. NAFAKA uses industry-standard JWT authentication and encrypted data storage to keep your account and funds secure at all times.</p></div>
            <div className="help-item"><h4>What fees does NAFAKA charge?</h4><p>Deposits are free. Withdrawals to M-Pesa cost 1% (minimum KES 5). Sending to other NAFAKA users costs 0.5% (minimum KES 2). Savings Vault transfers are always free.</p></div>
            <div className="help-item"><h4>Why does NAFAKA charge fees?</h4><p>Fees allow NAFAKA to maintain and improve the platform, provide customer support, and ensure the security of your funds.</p></div>
            <div className="help-item"><h4>What is the minimum deposit?</h4><p>The minimum deposit amount is KES 1.</p></div>
            <div className="help-item"><h4>How long do withdrawals take?</h4><p>Withdrawals are processed and funds are sent to your M-Pesa within minutes.</p></div>
            <div className="help-item"><h4>Can I use NAFAKA without M-Pesa?</h4><p>Yes. You can send and receive money between NAFAKA users using only your username — no M-Pesa needed for peer-to-peer transfers.</p></div>
            <div className="help-item"><h4>What is my NAFAKA username?</h4><p>Your username is your unique identifier on NAFAKA (e.g. @john_doe). Other users send or request money using your username.</p></div>
            <div className="help-item"><h4>How do I reset my password?</h4><p>Click "Forgot password?" on the login page and follow the instructions sent to your email.</p></div>
            <div className="help-item"><h4>Is there a spending limit?</h4><p>You can set your own daily and monthly spending limits in Settings for better financial control. NAFAKA will warn you at 80% and block transactions at 100%.</p></div>
          </div>
        </div>
      )}

      {active === "Contact" && (
        <div className="footer-page">
          <div className="back-arrow" onClick={goBack}><FontAwesomeIcon icon={faArrowLeft} /> Back</div>
          <h2>Contact Us</h2>
          <div className="contact-card">
            <p>We're here to help. Reach out and we'll respond within 24 hours on business days.</p>
            <div className="contact-item"><strong>📧 Support Email:</strong> support@nafaka.co.ke</div>
            <div className="contact-item"><strong>🕐 Support Hours:</strong> Monday – Friday, 8:00 AM – 6:00 PM EAT</div>
            <div className="contact-item"><strong>📍 Location:</strong> Nairobi, Kenya</div>
            <div className="contact-item"><strong>🌐 Website:</strong> nafaka-wallet.vercel.app</div>
          </div>
        </div>
      )}

      {active === "Terms" && (
        <div className="footer-page">
          <div className="back-arrow" onClick={goBack}><FontAwesomeIcon icon={faArrowLeft} /> Back</div>
          <h2>Terms of Service</h2>
          <div className="legal-content">
            <h4>1. Acceptance of Terms</h4>
            <p>By using NAFAKA Wallet, you agree to these terms. Please read them carefully before using our platform.</p>
            <h4>2. Eligibility</h4>
            <p>You must be 18 years or older to use NAFAKA Wallet. By registering, you confirm that you meet this requirement.</p>
            <h4>3. Account Security</h4>
            <p>You are responsible for maintaining the security of your account credentials. Do not share your password with anyone.</p>
            <h4>4. Usernames</h4>
            <p>Your NAFAKA username is unique. Choose it carefully — it is used by other users to send and request money from you.</p>
            <h4>5. Transactions & Fees</h4>
            <p>Deposits are free. Withdrawals to M-Pesa incur a 1% fee (minimum KES 5). Sending to NAFAKA users incurs a 0.5% fee (minimum KES 2). All transactions are final once confirmed.</p>
            <h4>6. Spending Limits</h4>
            <p>Users may set daily and monthly spending limits. NAFAKA will enforce these limits and notify users when approaching them.</p>
            <h4>7. Prohibited Use</h4>
            <p>NAFAKA must not be used for money laundering, fraud, or any illegal activity. Suspicious transactions are monitored and flagged.</p>
            <h4>8. Termination</h4>
            <p>NAFAKA reserves the right to suspend accounts that violate these terms without prior notice.</p>
            <p style={{ opacity: 0.5, marginTop: "20px", fontSize: "12px" }}>Last updated: April 2026</p>
          </div>
        </div>
      )}

      {active === "Privacy" && (
        <div className="footer-page">
          <div className="back-arrow" onClick={goBack}><FontAwesomeIcon icon={faArrowLeft} /> Back</div>
          <h2>Privacy Policy</h2>
          <div className="legal-content">
            <h4>1. Information We Collect</h4>
            <p>We collect your name, email, phone number, username and transaction data when you use NAFAKA Wallet.</p>
            <h4>2. How We Use Your Information</h4>
            <p>Your information is used to operate your wallet, process transactions, send notifications, detect fraud and improve our service.</p>
            <h4>3. Data Security</h4>
            <p>We use JWT authentication and encrypted storage to protect your personal and financial information.</p>
            <h4>4. Data Sharing</h4>
            <p>We do not sell your personal data. We share data with M-Pesa only to process payment transactions.</p>
            <h4>5. Fraud Detection</h4>
            <p>We monitor transactions for unusual patterns to protect our users. Large or suspicious transactions may be reviewed by our team.</p>
            <h4>6. Your Rights</h4>
            <p>You may request access to, correction of, or deletion of your personal data by contacting support@nafaka.co.ke.</p>
            <h4>7. Cookies & Storage</h4>
            <p>NAFAKA uses browser local storage to maintain your session. No third-party tracking cookies are used.</p>
            <p style={{ opacity: 0.5, marginTop: "20px", fontSize: "12px" }}>Last updated: April 2026</p>
          </div>
        </div>
      )}

    </div>
  );
}