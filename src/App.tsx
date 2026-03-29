import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHome, faWallet, faExchangeAlt, faChartLine,
  faGift, faCog, faBell, faArrowLeft, faSpinner,
  faArrowUp, faArrowDown, faMobileAlt, faMoneyBillWave,
} from "@fortawesome/free-solid-svg-icons";
import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import "./App.css";

// ─── API Config ───────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
// Handle email verification from URL
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

// ─── Types ────────────────────────────────────────────────────
interface User { id: string; fullName: string; email: string; phone: string }
interface Transaction {
  id: string; type: string; amount: number; description: string;
  status: string; mpesaRef?: string; counterparty?: string; createdAt: string;
}
interface Notification { id: string; message: string; isRead: boolean; createdAt: string }
interface Reward { id: string; redeemed: boolean; reward: { name: string; description: string; points: number; type: string } }

// ─── Auth Screen ──────────────────────────────────────────────
function AuthScreen({ onAuth }: { onAuth: (token: string, user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "" });
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
        await apiFetch("/auth/register", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setMessage("Account created! Check your email to verify.");
        setMode("login");
      } else {
        await apiFetch("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: form.email }),
        });
        setMessage("If that email exists, a reset link has been sent.");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
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

        <input className="auth-input" placeholder="Email"
          type="email" value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })} />

        {mode === "register" && (
          <input className="auth-input" placeholder="Phone (e.g. 0712345678)"
            value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        )}

        {mode !== "forgot" && (
          <input className="auth-input" placeholder="Password"
            type="password" value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })} />
        )}

        <button className="auth-btn" onClick={handleSubmit} disabled={loading}>
          {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : (
            mode === "login" ? "Login" : mode === "register" ? "Create Account" : "Send Reset Link"
          )}
        </button>

        <div className="auth-links">
          {mode === "login" && (<>
            <span onClick={() => setMode("register")}>Create account</span>
            <span onClick={() => setMode("forgot")}>Forgot password?</span>
          </>)}
          {mode !== "login" && (
            <span onClick={() => setMode("login")}>← Back to login</span>
          )}
        </div>
      </div>
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

  // Data state
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [analytics, setAnalytics] = useState<{ summary: Record<string, number|string>; dailySpending: {date:string;amount:number}[]; monthlySpending: {month:string;amount:number}[] } | null>(null);
  const [profile, setProfile] = useState<User | null>(null);

  // Form state
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [profileForm, setProfileForm] = useState({ fullName: "", phone: "" });
  const [securityForm, setSecurityForm] = useState({ currentPassword: "", newPassword: "" });

  // UI state
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});

  const setL = (key: string, val: boolean) => setLoading(p => ({ ...p, [key]: val }));
  const setM = (key: string, val: string) => setMsg(p => ({ ...p, [key]: val }));

  // ─── Fetch helpers ──────────────────────────────────────────
  const fetchBalance = useCallback(async () => {
    try { const d = await apiFetch("/wallet"); setBalance(d.balance); } catch {}
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
    try { const d = await apiFetch("/settings/profile"); setProfile(d.user); setProfileForm({ fullName: d.user.fullName, phone: d.user.phone }); } catch {}
  }, []);

  useEffect(() => {
    if (!token) return;
    fetchBalance(); fetchTransactions(); fetchNotifications();
  }, [token, fetchBalance, fetchTransactions, fetchNotifications]);

  useEffect(() => {
    if (active === "Analytics") fetchAnalytics();
    if (active === "Rewards") fetchRewards();
    if (active === "Settings") fetchProfile();
    if (active === "Notifications") { fetchNotifications(); apiFetch("/notifications/mark-all-read", { method: "PATCH" }).catch(() => {}); }
  }, [active, fetchAnalytics, fetchRewards, fetchProfile, fetchNotifications]);

  // ─── Auth handlers ──────────────────────────────────────────
  const handleAuth = (t: string, u: User) => { setToken(t); setUser(u); };

  const handleLogout = () => {
    localStorage.removeItem("nafaka_token");
    localStorage.removeItem("nafaka_user");
    setToken(null); setUser(null); setActive("Dashboard");
    setBalance(null); setTransactions([]); setNotifications([]);
  };

  // ─── M-Pesa handlers ────────────────────────────────────────
  const handleDeposit = async () => {
    if (!depositAmount) return;
    setL("deposit", true); setM("deposit", "");
    try {
      const d = await apiFetch("/mpesa/deposit", {
        method: "POST",
        body: JSON.stringify({ amount: Number(depositAmount) }),
      });
      setM("deposit", d.message || "STK Push sent! Check your phone.");
      setDepositAmount("");
      setTimeout(fetchBalance, 10000);
    } catch (e: unknown) {
      setM("deposit", e instanceof Error ? e.message : "Deposit failed");
    } finally { setL("deposit", false); }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount) return;
    setL("withdraw", true); setM("withdraw", "");
    try {
      const d = await apiFetch("/mpesa/withdraw", {
        method: "POST",
        body: JSON.stringify({ amount: Number(withdrawAmount) }),
      });
      setM("withdraw", d.message || "Withdrawal initiated!");
      setWithdrawAmount("");
      await fetchBalance();
    } catch (e: unknown) {
      setM("withdraw", e instanceof Error ? e.message : "Withdrawal failed");
    } finally { setL("withdraw", false); }
  };

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

  const handlePrintReceipt = (tx: Transaction) => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>NAFAKA Receipt</title>
      <style>body{font-family:Arial;padding:30px;max-width:400px;margin:auto;}
      h1{color:#1d4ed8;}table{width:100%;border-collapse:collapse;}
      td{padding:8px;border-bottom:1px solid #eee;}</style></head>
      <body><h1>NAFAKA Wallet</h1><h3>Transaction Receipt</h3>
      <table>
        <tr><td><b>ID</b></td><td>${tx.id}</td></tr>
        <tr><td><b>Type</b></td><td>${tx.type}</td></tr>
        <tr><td><b>Amount</b></td><td>KES ${tx.amount.toLocaleString()}</td></tr>
        <tr><td><b>Description</b></td><td>${tx.description}</td></tr>
        <tr><td><b>Status</b></td><td>${tx.status}</td></tr>
        <tr><td><b>M-Pesa Ref</b></td><td>${tx.mpesaRef || "N/A"}</td></tr>
        <tr><td><b>Date</b></td><td>${new Date(tx.createdAt).toLocaleString("en-KE")}</td></tr>
        <tr><td><b>Account</b></td><td>${user?.fullName || ""}</td></tr>
      </table>
      <script>window.print()</script></body></html>
    `);
    win.document.close();
  };

  if (!token) return <AuthScreen onAuth={handleAuth} />;

  const goBack = () => setActive("Dashboard");
  const isCredit = (type: string) => ["DEPOSIT", "RECEIVE"].includes(type);

  return (
    <div className="app" onClick={() => menuOpen && setMenuOpen(false)}>
      {/* TOP BAR */}
      <header className="topbar">
        <div className="left">
          <div className="hamburger" onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}>☰</div>
          <h1 className="logo">NAFAKA</h1>
        </div>
        <div className="right">
          <div className="topbar-icon" title="Notifications"
            onClick={e => { e.stopPropagation(); setActive("Notifications"); setUnreadCount(0); }}>
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
              <div>
                <p className="label">Available Balance</p>
                <h2>{balance !== null ? `KES ${balance.toLocaleString()}` : "Loading..."}</h2>
                <span className="sub">Hi, {user?.fullName?.split(" ")[0]} 👋</span>
              </div>
            </section>
            <section className="actions">
              <div className="action-card" onClick={() => setActive("Wallet")}>
  <FontAwesomeIcon icon={faArrowUp} />
  <span>Send</span>
</div>
<div className="action-card" onClick={() => setActive("Wallet")}>
  <FontAwesomeIcon icon={faArrowDown} />
  <span>Request</span>
</div>
<div className="action-card" onClick={() => setActive("Wallet")}>
  <FontAwesomeIcon icon={faMobileAlt} />
  <span>Deposit</span>
</div>
<div className="action-card" onClick={() => setActive("Wallet")}>
  <FontAwesomeIcon icon={faMoneyBillWave} />
  <span>Withdraw</span>
</div>
            </section>
            <section className="grid">
              <div className="card">
                <h3>Recent Transactions</h3>
                {transactions.slice(0, 5).map(tx => (
                  <div key={tx.id} className="tx">
                    <div>
                      <p>{tx.description}</p>
                      <span>{new Date(tx.createdAt).toLocaleDateString("en-KE")} | {tx.status}</span>
                    </div>
                    <strong className={isCredit(tx.type) ? "pos" : "neg"}>
                      {isCredit(tx.type) ? "+" : "-"}KES {tx.amount.toLocaleString()}
                    </strong>
                  </div>
                ))}
                {transactions.length === 0 && <p style={{ opacity: 0.5 }}>No transactions yet</p>}
              </div>
              <div className="card">
                <h3>Spending Overview</h3>
                <div className="chart-placeholder">Go to Analytics →</div>
              </div>
            </section>
          </div>
        )}

        {/* WALLET */}
        {active === "Wallet" && (
          <section className="wallet-section">
            <h2>Wallet Overview</h2>
            <div className="wallet-cards">
              <div className="wallet-card">
                <h3>Main Wallet</h3>
                <p>{balance !== null ? `KES ${balance.toLocaleString()}` : "Loading..."}</p>

                <div style={{ marginBottom: "15px" }}>
                  <input className="wallet-input" type="number" placeholder="Amount (KES)"
                    value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />
                  <button onClick={handleDeposit} disabled={loading.deposit}>
                    {loading.deposit ? <FontAwesomeIcon icon={faSpinner} spin /> : "Deposit via M-Pesa"}
                  </button>
                  {msg.deposit && <p className={msg.deposit.includes("failed") || msg.deposit.includes("Failed") ? "form-error" : "form-success"}>{msg.deposit}</p>}
                </div>

                <div>
                  <input className="wallet-input" type="number" placeholder="Amount (KES)"
                    value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} />
                  <button onClick={handleWithdraw} disabled={loading.withdraw}>
                    {loading.withdraw ? <FontAwesomeIcon icon={faSpinner} spin /> : "Withdraw to M-Pesa"}
                  </button>
                  {msg.withdraw && <p className={msg.withdraw.includes("failed") || msg.withdraw.includes("Failed") ? "form-error" : "form-success"}>{msg.withdraw}</p>}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TRANSACTIONS */}
        {active === "Transactions" && (
          <section className="transactions-section">
            <h2>Transactions</h2>
            <div className="print-receipt-wrapper">
              <button className="print-receipt-btn" onClick={() => transactions[0] && handlePrintReceipt(transactions[0])}>
                Print Latest Receipt
              </button>
            </div>
            <div className="transactions-list">
              {transactions.map(tx => (
                <div key={tx.id} className="tx" style={{ cursor: "pointer" }} onClick={() => handlePrintReceipt(tx)}>
                  <div>
                    <p>{tx.description}</p>
                    <span>{new Date(tx.createdAt).toLocaleString("en-KE")} | TXN #{tx.id.slice(0, 8).toUpperCase()} | {tx.status}</span>
                  </div>
                  <strong className={isCredit(tx.type) ? "pos" : "neg"}>
                    {isCredit(tx.type) ? "+" : "-"}KES {tx.amount.toLocaleString()}
                  </strong>
                </div>
              ))}
              {transactions.length === 0 && <p style={{ opacity: 0.5 }}>No transactions yet</p>}
            </div>
          </section>
        )}

        {/* ANALYTICS */}
        {active === "Analytics" && (
          <section className="analytics-section">
            <h2>Spending Overview</h2>
            {analytics && (
              <>
                <div className="analytics-summary">
                  <div className="summary-card"><span>Total Deposited</span><strong className="pos">KES {Number(analytics.summary.totalDeposited).toLocaleString()}</strong></div>
                  <div className="summary-card"><span>Total Withdrawn</span><strong className="neg">KES {Number(analytics.summary.totalWithdrawn).toLocaleString()}</strong></div>
                  <div className="summary-card"><span>This Month</span><strong>KES {Number(analytics.summary.monthlySpend).toLocaleString()}</strong></div>
                  <div className="summary-card"><span>vs Last Month</span><strong>{analytics.summary.spendChange}%</strong></div>
                </div>
                <div className="analytics-cards">
                  <div className="card">
                    <h3>Daily Spending</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={analytics.dailySpending}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: "#020617", border: "none" }} />
                        <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="card">
                    <h3>Monthly Spending</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={analytics.monthlySpending}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: "#020617", border: "none" }} />
                        <Bar dataKey="amount" fill="#9333ea" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
            {!analytics && <p style={{ opacity: 0.5 }}>Loading analytics...</p>}
          </section>
        )}

        {/* REWARDS */}
        {active === "Rewards" && (
          <section className="rewards-section">
            <h2>Rewards</h2>
            <div className="rewards-list">
              {rewards.map(ur => (
                <div key={ur.id} className="reward-card">
                  <h3>{ur.reward.name}</h3>
                  <p>{ur.reward.description}</p>
                  <p style={{ color: "#3b82f6", fontSize: "13px" }}>
                    {ur.reward.type === "POINTS" ? `${ur.reward.points} pts` : `KES ${ur.reward.points}`}
                  </p>
                  {msg[`reward-${ur.id}`] && <p className="form-success">{msg[`reward-${ur.id}`]}</p>}
                  <button disabled={ur.redeemed || loading[`reward-${ur.id}`]}
                    onClick={() => handleRedeemReward(ur.id)}
                    style={{ opacity: ur.redeemed ? 0.5 : 1 }}>
                    {ur.redeemed ? "Redeemed" : loading[`reward-${ur.id}`] ? "..." : "Redeem"}
                  </button>
                </div>
              ))}
              {rewards.length === 0 && <p style={{ opacity: 0.5 }}>No rewards available yet</p>}
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
                <h4>Profile</h4>
                <input className="wallet-input" placeholder="Full Name"
                  value={profileForm.fullName} onChange={e => setProfileForm({ ...profileForm, fullName: e.target.value })} />
                <input className="wallet-input" placeholder="Phone"
                  value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} />
                {msg.profile && <p className="form-success">{msg.profile}</p>}
                <button onClick={handleUpdateProfile} disabled={loading.profile}>
                  {loading.profile ? "Saving..." : "Save Profile"}
                </button>
              </div>

              <div className="setting-item setting-form">
                <h4>Security — Change Password</h4>
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
                <span>Email</span>
                <span style={{ opacity: 0.6 }}>{profile?.email}</span>
              </div>

              <div className="setting-item">
                <span>Account Created</span>
                <span style={{ opacity: 0.6 }}>{profile ? new Date((profile as unknown as { createdAt: string }).createdAt).toLocaleDateString("en-KE") : ""}</span>
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
                <div key={n.id} className={`notification-item ${!n.isRead ? "unread" : ""}`}>
                  <p>{n.message}</p>
                  <span>{new Date(n.createdAt).toLocaleDateString("en-KE")}</span>
                </div>
              ))}
              {notifications.length === 0 && <p style={{ opacity: 0.5 }}>No notifications yet</p>}
            </div>
          </section>
        )}
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-grid">
          <div><h4>Product</h4><p>Wallet</p><p>Analytics</p><p>Rewards</p></div>
          <div><h4>Support</h4><p>Help</p><p>FAQs</p><p>Contact</p></div>
          <div><h4>Legal</h4><p>Terms</p><p>Privacy</p></div>
        </div>
        <p className="copyright">© 2026 NAFAKA Wallet</p>
      </footer>
    </div>
  );
}
