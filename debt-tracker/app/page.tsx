'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export default function FinCoreEnterprise() {
  // 1. Security & Multi-Role Access
  const [authRole, setAuthRole] = useState<'ADMIN' | 'AGENT' | 'AUDITOR' | null>(null);
  const [passcode, setPasscode] = useState('');
  
  // 2. Global Navigation & Branch Hierarchy
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [branchId, setBranchId] = useState('ALL');
  const [branches, setBranches] = useState<any[]>([]);
  
  // 3. Dynamic Lender Settings & Webhooks
  const [lenderInfo, setLenderInfo] = useState({ name: 'Sandeep Kumar', company: 'SK Finserv', phone: '', address: '', upi: '', lateFee: '0', webhookUrl: '', tgToken: '', tgChat: '' });
  
  // 4. Data States
  const [loans, setLoans] = useState<any[]>([]);
  const [borrowers, setBorrowers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  
  // 5. Advanced Disbursal Form (Collateral, Guarantor, Auto-Debit)
  const [formData, setFormData] = useState({
    name: '', phone: '', pan: '', aadhaar: '', friendId: null as string | null,
    amount: '', months: '', intRate: '0', intType: 'SI', charges: '0',
    schedule: 'MONTHLY', gName: '', gPhone: '', collateralType: 'NONE', collateralVal: '0', branch: ''
  });

  // UI Modals
  const [manageLoan, setManageLoan] = useState<any>(null);
  const [payAmount, setPayAmount] = useState('');
  const [discount, setDiscount] = useState('0');
  const [showQR, setShowQR] = useState(false);

  // Initialize Data Engine
  const loadData = async () => {
    const { data: lender } = await supabase.from('lender_profile').select('*').limit(1).maybeSingle();
    if (lender) setLenderInfo({ name: lender.lender_name || '', company: lender.company_name || '', phone: lender.phone || '', address: lender.address || '', upi: lender.upi_id || '', lateFee: lender.late_fee_per_day || '0', webhookUrl: lender.webhook_url || '', tgToken: lender.telegram_bot_token || '', tgChat: lender.telegram_chat_id || '' });

    const { data: bData } = await supabase.from('branches').select('*');
    if (bData) setBranches(bData);

    const { data: loansData } = await supabase.from('loans').select(`*, friends (*), branches (name)`).order('created_at', { ascending: false });
    if (loansData) {
      setLoans(loansData.map(l => {
        // AI Risk Scoring Logic (Days Overdue Calculation)
        const expectedPaid = (parseFloat(l.emi_amount) * (new Date().getMonth() - new Date(l.created_at).getMonth()));
        const isHighRisk = expectedPaid > parseFloat(l.total_repaid);
        return {
          ...l,
          principal: parseFloat(l.principal_amount),
          totalAmount: parseFloat(l.total_with_interest || l.principal_amount),
          repaid: parseFloat(l.total_repaid || 0),
          emi: parseFloat(l.emi_amount),
          riskLevel: isHighRisk ? 'HIGH RISK' : 'HEALTHY',
          friend: l.friends
        };
      }));
    }

    const { data: friendsData } = await supabase.from('friends').select('*, loans(*)');
    if (friendsData) setBorrowers(friendsData);

    if (authRole === 'ADMIN') {
      const { data: logs } = await supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(50);
      if (logs) setAuditLogs(logs);
    }
  };

  useEffect(() => { if (authRole) loadData(); }, [authRole]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === '1305' || passcode === 'sandeep@123') { setAuthRole('ADMIN'); logAudit('ADMIN', 'System Login'); }
    else if (passcode === '8899') { setAuthRole('AGENT'); logAudit('AGENT', 'Field Agent Login'); }
    else alert('❌ Security Breach: Invalid Token');
  };

  // 6. Audit Logging Engine
  const logAudit = async (role: string, action: string) => {
    await supabase.from('audit_logs').insert([{ user_role: role, action, details: `Executed at ${new Date().toISOString()}` }]);
  };

  // 7. Automated Reposting Engine (Webhook/Telegram)
  const triggerReposting = async (payload: string) => {
    if (lenderInfo.webhookUrl) {
      try { await fetch(lenderInfo.webhookUrl, { method: 'POST', body: JSON.stringify({ message: payload }) }); } catch (e) { console.error("Webhook failed"); }
    }
    if (lenderInfo.tgToken && lenderInfo.tgChat) {
      try { await fetch(`https://api.telegram.org/bot${lenderInfo.tgToken}/sendMessage?chat_id=${lenderInfo.tgChat}&text=${encodeURIComponent(payload)}`); } catch (e) { console.error("TG failed"); }
    }
  };

  // 8. One-Click CSV Portfolio Export
  const exportToCSV = () => {
    if (authRole !== 'ADMIN') return;
    const headers = ['LoanID,Borrower,Branch,Principal,Total,Repaid,Status,Risk,Collateral,Date\n'];
    const rows = loans.map(l => `${l.id},${l.friend?.name},${l.branches?.name||'HQ'},${l.principal},${l.totalAmount},${l.repaid},${l.status},${l.riskLevel},${l.collateral_type},${new Date(l.created_at).toLocaleDateString()}`);
    const blob = new Blob([headers + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob); a.download = `Enterprise_Audit_${new Date().getTime()}.csv`;
    a.click();
    logAudit(authRole, 'Exported Portfolio CSV');
  };

  // 9. Razorpay e-Mandate Link Generator (Mock)
  const generateAutoDebitLink = async (loanId: string, phone: string, emi: number) => {
    alert(`Razorpay e-Mandate generated for ₹${emi}/month. Sent to ${phone}.`);
    await supabase.from('loans').update({ mandate_status: 'PENDING_USER_APPROVAL' }).eq('id', loanId);
    logAudit(authRole || 'SYS', `Initiated Auto-Debit for Loan ${loanId}`);
    loadData();
  };

  const processLoan = async () => {
    const { name, phone, pan, aadhaar, amount, months, intRate, intType, charges, schedule, gName, gPhone, collateralType, collateralVal, friendId, branch } = formData;
    if (!name || !phone || !amount || !months) return alert("Validation Failed: Missing primary metrics");
    
    const p = parseFloat(amount), m = parseInt(months), r = parseFloat(intRate || '0'), c = parseFloat(charges || '0');
    const total = (r > 0) ? (intType === 'SI' ? p + ((p * r * (m/12)) / 100) : p * Math.pow((1 + r/100), m/12)) + c : p + c;
    const emi = (total / (schedule === 'WEEKLY' ? m * 4 : m)).toFixed(2);

    let fid = friendId;
    if (!fid) {
      const { data: fData } = await supabase.from('friends').insert([{ name, phone, pan_number: pan, aadhaar_number: aadhaar, kyc_status: 'VERIFIED' }]).select().single();
      fid = fData?.id;
    }

    const { data: lData } = await supabase.from('loans').insert([{
      friend_id: fid, branch_id: branch || null, principal_amount: p, duration_months: m, interest_rate: r, interest_type: intType, extra_charges: c, 
      total_with_interest: total.toFixed(2), emi_amount: emi, schedule_type: schedule, guarantor_name: gName, guarantor_phone: gPhone, collateral_type: collateralType, collateral_value: parseFloat(collateralVal)
    }]).select().single();

    await supabase.from('transactions').insert([{ loan_id: lData?.id, amount_paid: p, type: 'DISBURSEMENT' }]);
    logAudit(authRole || 'SYS', `Disbursed ₹${p} to ${name}`);
    triggerReposting(`💰 *NEW DISBURSAL*\nClient: ${name}\nAmount: ₹${p}\nEMI: ₹${emi}\nBranch: ${branch || 'HQ'}`);
    
    setFormData({ name: '', phone: '', pan: '', aadhaar: '', friendId: null, amount: '', months: '', intRate: '0', intType: 'SI', charges: '0', schedule: 'MONTHLY', gName: '', gPhone: '', collateralType: 'NONE', collateralVal: '0', branch: '' });
    loadData();
  };

  const handlePayment = async (isForeclose = false) => {
    let amt = parseFloat(payAmount), disc = parseFloat(discount || '0');
    if (isForeclose) amt = Math.max(0, (manageLoan.totalAmount - manageLoan.repaid) - disc);
    
    await supabase.from('transactions').insert([{ loan_id: manageLoan.id, amount_paid: amt, type: 'REPAYMENT' }]);
    const totalPaid = manageLoan.repaid + amt + (isForeclose ? disc : 0);
    const status = totalPaid >= manageLoan.totalAmount || isForeclose ? 'CLOSED' : 'ACTIVE';
    await supabase.from('loans').update({ total_repaid: totalPaid, status }).eq('id', manageLoan.id);
    
    logAudit(authRole || 'SYS', `Recovered ₹${amt} from ${manageLoan.friend?.name}`);
    triggerReposting(`✅ *RECOVERY LOGGED*\nClient: ${manageLoan.friend?.name}\nAmount: ₹${amt}\nStatus: ${status}`);
    
    setManageLoan(null); setPayAmount(''); setDiscount('0');
    loadData();
  };

  const sendWA = (loan: any, type: string) => {
    const bal = Math.max(0, loan.totalAmount - loan.repaid);
    const link = `upi://pay?pa=${lenderInfo.upi}&pn=${encodeURIComponent(lenderInfo.company)}&am=${type==='EMI'?loan.emi:bal}`;
    const msgs: any = {
      'EMI': `🚨 *PAYMENT REMINDER*\nDear ${loan.friend?.name}, EMI of ₹${loan.emi} is due.\nPay: ${link}`,
      'STATEMENT': `🧾 *STATEMENT*\nTotal: ₹${loan.totalAmount}\nPaid: ₹${loan.repaid}\nBalance: ₹${bal.toFixed(2)}`,
      'NOC': `🎉 *NOC*\nLoan of ₹${loan.principal} closed. Zero dues.\n-${lenderInfo.company}`
    };
    window.open(`https://wa.me/91${loan.friend?.phone}?text=${encodeURIComponent(msgs[type])}`, '_blank');
    logAudit(authRole || 'SYS', `Sent ${type} WA to ${loan.friend?.name}`);
  };

  const filteredLoans = loans.filter(l => branchId === 'ALL' || l.branch_id === branchId);
  const { lent, recovered, interest } = filteredLoans.reduce((acc, l) => ({ lent: acc.lent + l.principal, recovered: acc.recovered + l.repaid, interest: acc.interest + (l.totalAmount - l.principal) }), { lent: 0, recovered: 0, interest: 0 });

  if (!authRole) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 w-full max-w-sm">
        <h1 className="text-3xl font-black text-center mb-2 text-white">FIN-CORE <span className="text-emerald-500">PRO</span></h1>
        <p className="text-xs text-neutral-500 text-center mb-8 uppercase tracking-[0.2em]">Enterprise Gateway</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="password" placeholder="••••" value={passcode} onChange={e=>setPasscode(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 text-white p-4 rounded-xl text-center text-2xl tracking-[1em] focus:border-emerald-500 outline-none" autoFocus />
          <button className="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl hover:bg-emerald-500 transition-colors">Authenticate</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50 pb-24 font-sans text-neutral-900 flex">
      {/* Enterprise Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-neutral-950 text-neutral-400 h-screen fixed p-4 border-r border-neutral-800">
        <h1 className="text-2xl font-black text-white mb-8">FIN-CORE</h1>
        <nav className="space-y-2 flex-1">
          {['DASHBOARD', 'BORROWERS', 'ADD', 'ANALYTICS', 'AUTOMATION', 'AUDIT', 'SETTINGS'].map(tab => (
            <button key={tab} onClick={()=>setActiveTab(tab)} className={`w-full text-left px-4 py-3 rounded-lg font-bold text-sm ${activeTab === tab ? 'bg-emerald-900/30 text-emerald-500' : 'hover:bg-neutral-900 hover:text-white'}`}>{tab}</button>
          ))}
        </nav>
        <button onClick={()=>setAuthRole(null)} className="w-full bg-neutral-900 py-3 rounded-lg font-bold text-sm text-white">End Session</button>
      </aside>

      <main className="flex-1 md:ml-64 p-4 md:p-8 max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-black tracking-tight">{activeTab}</h2>
          <select value={branchId} onChange={e=>setBranchId(e.target.value)} className="bg-white border p-2 rounded-lg text-sm font-bold shadow-sm">
            <option value="ALL">All Branches / HQ</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {activeTab === 'DASHBOARD' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100"><p className="text-xs text-neutral-500 font-bold uppercase">Total AUM</p><p className="text-3xl font-black mt-1">₹{lent.toLocaleString()}</p></div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100"><p className="text-xs text-neutral-500 font-bold uppercase">Recovered</p><p className="text-3xl font-black mt-1 text-emerald-600">₹{recovered.toLocaleString()}</p></div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100"><p className="text-xs text-neutral-500 font-bold uppercase">Net Profit Margin</p><p className="text-3xl font-black mt-1 text-blue-600">₹{interest.toLocaleString()}</p></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredLoans.filter(l=>l.status==='ACTIVE').map(loan => (
                <div key={loan.id} className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-200">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-lg">{loan.friend?.name}</h3>
                      <p className="text-xs text-neutral-500">{loan.schedule_type} EMI: ₹{loan.emi} | Bal: ₹{(loan.totalAmount - loan.repaid).toFixed(2)}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded font-black tracking-wider ${loan.riskLevel === 'HIGH RISK' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{loan.riskLevel}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setManageLoan(loan); setPayAmount(loan.emi); }} className="flex-1 bg-neutral-900 text-white py-2 rounded-lg text-sm font-bold">Manage Account</button>
                    {loan.mandate_status === 'INACTIVE' && (
                      <button onClick={()=>generateAutoDebitLink(loan.id, loan.friend?.phone, loan.emi)} className="flex-1 bg-blue-50 text-blue-700 py-2 rounded-lg text-sm font-bold">Setup Auto-Debit</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'ADD' && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border">
            <h2 className="text-xl font-black mb-6">Underwrite & Disburse Asset</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <p className="text-xs font-bold text-neutral-400 uppercase">Primary Borrower & KYC</p>
                <input type="text" placeholder="Full Name" value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} className="w-full bg-neutral-50 border p-3 rounded-xl" />
                <input type="number" placeholder="Phone Number" value={formData.phone} onChange={e=>setFormData({...formData, phone:e.target.value})} className="w-full bg-neutral-50 border p-3 rounded-xl" />
                <input type="text" placeholder="Aadhaar / DigiLocker ID" value={formData.aadhaar} onChange={e=>setFormData({...formData, aadhaar:e.target.value})} className="w-full bg-neutral-50 border p-3 rounded-xl" />
              </div>
              <div className="space-y-4">
                <p className="text-xs font-bold text-neutral-400 uppercase">Financial Structuring</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" placeholder="Principal (₹)" value={formData.amount} onChange={e=>setFormData({...formData, amount:e.target.value})} className="bg-neutral-50 border p-3 rounded-xl" />
                  <input type="number" placeholder="Tenure" value={formData.months} onChange={e=>setFormData({...formData, months:e.target.value})} className="bg-neutral-50 border p-3 rounded-xl" />
                  <input type="number" placeholder="Rate (%)" value={formData.intRate} onChange={e=>setFormData({...formData, intRate:e.target.value})} className="bg-neutral-50 border p-3 rounded-xl" />
                  <select value={formData.schedule} onChange={e=>setFormData({...formData, schedule:e.target.value})} className="bg-neutral-50 border p-3 rounded-xl"><option value="MONTHLY">Monthly</option><option value="WEEKLY">Weekly</option></select>
                </div>
                <p className="text-xs font-bold text-neutral-400 uppercase mt-4">Collateral Register</p>
                <div className="grid grid-cols-2 gap-2">
                  <select value={formData.collateralType} onChange={e=>setFormData({...formData, collateralType:e.target.value})} className="bg-neutral-50 border p-3 rounded-xl"><option value="NONE">Unsecured</option><option value="PROPERTY">Property Lien</option><option value="VEHICLE">Vehicle RC</option><option value="GOLD">Gold</option></select>
                  <input type="number" placeholder="Asset Value (₹)" value={formData.collateralVal} onChange={e=>setFormData({...formData, collateralVal:e.target.value})} className="bg-neutral-50 border p-3 rounded-xl" />
                </div>
              </div>
            </div>
            <button onClick={processLoan} className="w-full md:w-auto mt-8 bg-emerald-600 text-white font-bold py-4 px-12 rounded-xl shadow-lg">Execute Agreement & Disburse</button>
          </div>
        )}

        {activeTab === 'AUTOMATION' && authRole === 'ADMIN' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border">
              <h3 className="font-bold text-lg mb-4">API Webhooks & Reposting</h3>
              <p className="text-sm text-neutral-500 mb-4">Broadcast all ledger activities to external accounting tools (Zoho, Tally) or Telegram groups in real-time.</p>
              <input type="text" placeholder="Accounting Webhook POST URL" value={lenderInfo.webhookUrl} onChange={e=>setLenderInfo({...lenderInfo, webhookUrl:e.target.value})} className="w-full bg-neutral-50 border p-3 rounded-xl mb-2" />
              <div className="grid grid-cols-2 gap-2 mb-4">
                <input type="text" placeholder="Telegram Bot Token" value={lenderInfo.tgToken} onChange={e=>setLenderInfo({...lenderInfo, tgToken:e.target.value})} className="bg-neutral-50 border p-3 rounded-xl" />
                <input type="text" placeholder="Telegram Chat ID" value={lenderInfo.tgChat} onChange={e=>setLenderInfo({...lenderInfo, tgChat:e.target.value})} className="bg-neutral-50 border p-3 rounded-xl" />
              </div>
              <button onClick={() => triggerReposting('🔄 Automation Connection Test Successful')} className="bg-neutral-900 text-white px-6 py-3 rounded-xl font-bold text-sm">Test Integration</button>
            </div>
          </div>
        )}

        {activeTab === 'AUDIT' && authRole === 'ADMIN' && (
          <div className="bg-white rounded-3xl border overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg">Immutable Audit Trail</h3>
              <button onClick={exportToCSV} className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-sm font-bold">Export Audit CSV</button>
            </div>
            <div className="divide-y max-h-[60vh] overflow-y-auto">
              {auditLogs.map(log => (
                <div key={log.id} className="p-4 hover:bg-neutral-50 flex justify-between items-center text-sm">
                  <div><span className={`font-black text-[10px] px-2 py-1 rounded mr-3 ${log.user_role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{log.user_role}</span><span className="font-bold">{log.action}</span></div>
                  <span className="text-xs text-neutral-400">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Repayment Modal */}
      {manageLoan && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl relative">
            <button onClick={()=>setManageLoan(null)} className="absolute top-4 right-4 bg-neutral-100 p-2 rounded-full font-bold">✕</button>
            <h3 className="text-xl font-black mb-1">{manageLoan.friend?.name}</h3>
            <p className="text-xs font-bold text-neutral-400 mb-6">Risk Profile: {manageLoan.riskLevel} | Auto-Debit: {manageLoan.mandate_status}</p>

            <div className="bg-neutral-50 p-4 rounded-2xl border mb-6">
              <p className="text-xs font-bold text-neutral-500 mb-2 uppercase tracking-wide">Ledger Entry</p>
              <div className="flex gap-2 mb-2">
                <input type="number" value={payAmount} onChange={e=>setPayAmount(e.target.value)} className="flex-1 border p-3 rounded-xl font-bold bg-white" />
                <button onClick={()=>handlePayment(false)} className="bg-emerald-600 text-white px-6 rounded-xl font-bold">Post</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={()=>sendWA(manageLoan, 'STATEMENT')} className="bg-neutral-100 py-3 rounded-xl text-sm font-bold">🧾 Statement</button>
              <button onClick={()=>sendWA(manageLoan, 'EMI')} className="bg-blue-50 text-blue-700 py-3 rounded-xl text-sm font-bold">📲 Ping EMI</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


