'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export default function EnterpriseDashboard() {
  // Auth & Roles
  const [authRole, setAuthRole] = useState<'ADMIN' | 'AGENT' | null>(null);
  const [passcode, setPasscode] = useState('');
  
  // Navigation
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [dashFilter, setDashFilter] = useState('ACTIVE');
  
  // Global State
  const [lenderInfo, setLenderInfo] = useState({ name: 'Sandeep Kumar', company: 'SK Finserv', phone: '', address: '', upi: '', lateFee: '0' });
  const [loans, setLoans] = useState<any[]>([]);
  const [borrowers, setBorrowers] = useState<any[]>([]);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  
  // Form States (Borrower & Loan)
  const [formData, setFormData] = useState({
    name: '', phone: '', pan: '', friendId: null as string | null,
    amount: '', months: '', intRate: '0', intType: 'SI', charges: '0',
    schedule: 'MONTHLY', gName: '', gPhone: ''
  });

  // UI Modals & Actions
  const [manageLoan, setManageLoan] = useState<any>(null);
  const [payAmount, setPayAmount] = useState('');
  const [discount, setDiscount] = useState('0');
  const [showQR, setShowQR] = useState(false);
  const [sanctionData, setSanctionData] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);

  const loadData = async () => {
    const { data: lender } = await supabase.from('lender_profile').select('*').limit(1).maybeSingle();
    if (lender) {
      setLenderInfo({ name: lender.lender_name || '', company: lender.company_name || '', phone: lender.phone || '', address: lender.address || '', upi: lender.upi_id || '', lateFee: lender.late_fee_per_day || '0' });
    }

    const { data: loansData } = await supabase.from('loans').select(`*, friends ( id, name, phone, pan_number )`).order('created_at', { ascending: false });
    if (loansData) {
      setLoans(loansData.map(l => ({
        ...l,
        principal: parseFloat(l.principal_amount),
        totalAmount: parseFloat(l.total_with_interest || l.principal_amount),
        repaid: parseFloat(l.total_repaid || 0),
        emi: parseFloat(l.emi_amount),
        friend: l.friends
      })));
    }

    const { data: friendsData } = await supabase.from('friends').select('*, loans(*)');
    if (friendsData) setBorrowers(friendsData);

    const { data: txData } = await supabase.from('transactions').select('*, loans(friends(name))').order('payment_date', { ascending: false });
    if (txData) setTxHistory(txData);
  };

  useEffect(() => { if (authRole) loadData(); }, [authRole]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === '1305' || passcode === 'sandeep@123') setAuthRole('ADMIN');
    else if (passcode === '8899') setAuthRole('AGENT');
    else alert('❌ Invalid PIN');
  };

  // Advanced Feature: CSV Data Export
  const exportToCSV = () => {
    if (authRole !== 'ADMIN') return alert("Only Admins can export data.");
    const headers = ['Loan ID,Borrower,Phone,Principal,Total,Repaid,Status,Guarantor,Date\n'];
    const rows = loans.map(l => `${l.id},${l.friend?.name},${l.friend?.phone},${l.principal},${l.totalAmount},${l.repaid},${l.status},${l.guarantor_name || 'N/A'},${new Date(l.created_at).toLocaleDateString()}`);
    const blob = new Blob([headers + rows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Portfolio_Report_${new Date().getTime()}.csv`;
    a.click();
  };

  // Advanced Feature: KYC Upload (Simulated URL save due to standard bucket limits)
  const handleKYCUpload = async (loanId: string) => {
    const url = prompt("Enter KYC Document Drive Link / URL for safekeeping:");
    if (url) {
      setIsUploading(true);
      await supabase.from('loans').update({ kyc_document_url: url }).eq('id', loanId);
      alert("KYC Linked Successfully!");
      setIsUploading(false);
      loadData();
    }
  };

  // Logic: Loan Processing & Disbursal
  const processLoan = async () => {
    const { name, phone, pan, amount, months, intRate, intType, charges, schedule, gName, gPhone, friendId } = formData;
    if (!name || !phone || !amount || !months) return alert("Fill mandatory fields!");
    
    const p = parseFloat(amount), m = parseInt(months), r = parseFloat(intRate || '0'), c = parseFloat(charges || '0');
    let total = p;
    if (r > 0) total = intType === 'SI' ? p + ((p * r * (m/12)) / 100) : p * Math.pow((1 + r/100), m/12);
    total += c;
    const emi = (total / (schedule === 'WEEKLY' ? m * 4 : m)).toFixed(2);

    let fid = friendId;
    if (!fid) {
      const { data: fData, error } = await supabase.from('friends').insert([{ name, phone, pan_number: pan }]).select().single();
      if (error) return alert("Error saving friend");
      fid = fData.id;
    }

    const { data: lData, error: lError } = await supabase.from('loans').insert([{
      friend_id: fid, principal_amount: p, duration_months: m, interest_rate: r, interest_type: intType, extra_charges: c, 
      total_with_interest: total.toFixed(2), emi_amount: emi, schedule_type: schedule, guarantor_name: gName, guarantor_phone: gPhone
    }]).select().single();

    if (lError) return alert(lError.message);
    
    await supabase.from('transactions').insert([{ loan_id: lData.id, amount_paid: p, type: 'DISBURSEMENT' }]);
    setSanctionData({ ...formData, p, total, emi, date: new Date() });
    setFormData({ name: '', phone: '', pan: '', friendId: null, amount: '', months: '', intRate: '0', intType: 'SI', charges: '0', schedule: 'MONTHLY', gName: '', gPhone: '' });
    loadData();
  };

  // Multi-channel Communication
  const sendWA = (loan: any, type: string) => {
    const bal = Math.max(0, loan.totalAmount - loan.repaid);
    const link = `upi://pay?pa=${lenderInfo.upi}&pn=${encodeURIComponent(lenderInfo.company)}&am=${type==='EMI'?loan.emi:bal}`;
    let msg = '';
    
    if (type === 'EMI') msg = `🚨 *PAYMENT REMINDER* 🚨\nDear ${loan.friend?.name},\nEMI of ₹${loan.emi} is due.\nPay: ${link}`;
    if (type === 'FULL') msg = `🌟 *SETTLEMENT NOTICE* 🌟\nDear ${loan.friend?.name},\nClear your balance of ₹${bal.toFixed(2)} today.\nPay: ${link}`;
    if (type === 'STATEMENT') msg = `🧾 *STATEMENT* 🧾\nName: ${loan.friend?.name}\nTotal: ₹${loan.totalAmount}\nPaid: ₹${loan.repaid}\nBalance: ₹${bal.toFixed(2)}`;
    if (type === 'NOC') msg = `🎉 *NOC* 🎉\nDear ${loan.friend?.name},\nLoan of ₹${loan.principal} is completely closed with ZERO dues.\n-${lenderInfo.company}`;
    
    window.open(`https://wa.me/91${loan.friend?.phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Advanced Feature: Bulk EMI Reminders
  const sendBulkReminders = () => {
    const activeLoans = loans.filter(l => l.status === 'ACTIVE');
    if(activeLoans.length === 0) return alert("No active loans to remind.");
    if(confirm(`Send automated reminder templates to ${activeLoans.length} borrowers? (Will open WA tabs)`)) {
      activeLoans.slice(0, 5).forEach((l, idx) => setTimeout(() => sendWA(l, 'EMI'), idx * 1000));
      if(activeLoans.length > 5) alert("Sent batch of 5 to avoid browser pop-up blocks. Click again for next batch.");
    }
  };

  // Record Repayment & Overdue/Late Fee Checks
  const handlePayment = async (isForeclose = false) => {
    let amt = parseFloat(payAmount), disc = parseFloat(discount || '0');
    if (isForeclose) amt = Math.max(0, (manageLoan.totalAmount - manageLoan.repaid) - disc);
    if (isNaN(amt) || amt <= 0) return alert("Invalid Amount");

    await supabase.from('transactions').insert([{ loan_id: manageLoan.id, amount_paid: amt, type: 'REPAYMENT' }]);
    const totalPaid = manageLoan.repaid + amt + (isForeclose ? disc : 0);
    await supabase.from('loans').update({ total_repaid: totalPaid, status: totalPaid >= manageLoan.totalAmount || isForeclose ? 'CLOSED' : 'ACTIVE' }).eq('id', manageLoan.id);
    
    alert(isForeclose ? "Loan Closed! 🤝" : "Payment Saved! ✅");
    setManageLoan(null); setPayAmount(''); setDiscount('0');
    loadData();
  };

  // Calculations for Visuals
  const { lent, recovered, interest, charges } = useMemo(() => {
    return loans.reduce((acc, l) => {
      acc.lent += l.principal; acc.recovered += l.repaid;
      acc.interest += (l.totalAmount - l.principal); acc.charges += parseFloat(l.extra_charges || 0);
      return acc;
    }, { lent: 0, recovered: 0, interest: 0, charges: 0 });
  }, [loans]);
  const pending = Math.max(0, lent - recovered);
  const net = interest + charges;

  if (!authRole) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
        <h1 className="text-2xl font-black text-center mb-6 text-slate-800">FIN-CORE <span className="text-blue-600">PRO</span></h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="password" placeholder="••••" value={passcode} onChange={e=>setPasscode(e.target.value)} className="w-full border-2 p-4 rounded-xl text-center text-2xl tracking-[1em] focus:border-blue-600 outline-none" autoFocus />
          <button className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl">Secure Login</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans text-slate-900">
      <header className="bg-blue-600 text-white p-5 shadow-lg flex justify-between items-center rounded-b-2xl">
        <div>
          <h1 className="text-xl font-black">{lenderInfo.company}</h1>
          <p className="text-[10px] opacity-80 uppercase tracking-widest">{authRole} PORTAL</p>
        </div>
        <button onClick={()=>setAuthRole(null)} className="bg-white/20 px-4 py-2 rounded-lg font-bold text-xs">Logout</button>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4 mt-2">
        {activeTab === 'DASHBOARD' && (
          <div className="space-y-4">
            <div className="flex bg-slate-200 p-1 rounded-xl">
              <button onClick={()=>setDashFilter('ACTIVE')} className={`flex-1 py-2.5 text-sm font-bold rounded-lg ${dashFilter==='ACTIVE'?'bg-white shadow text-blue-700':'text-slate-500'}`}>Active</button>
              <button onClick={()=>setDashFilter('CLOSED')} className={`flex-1 py-2.5 text-sm font-bold rounded-lg ${dashFilter==='CLOSED'?'bg-white shadow text-slate-700':'text-slate-500'}`}>History</button>
            </div>
            
            <div className="flex gap-2">
              <button onClick={sendBulkReminders} className="flex-1 bg-green-100 text-green-700 py-2 rounded-lg text-xs font-bold border border-green-200">📲 Bulk Reminders</button>
              {authRole === 'ADMIN' && <button onClick={exportToCSV} className="flex-1 bg-indigo-100 text-indigo-700 py-2 rounded-lg text-xs font-bold border border-indigo-200">📊 Export Data (CSV)</button>}
            </div>

            {loans.filter(l=>l.status===dashFilter).map(loan => {
              const rem = Math.max(0, loan.totalAmount - loan.repaid);
              const prog = (loan.repaid / loan.totalAmount) * 100;
              return (
                <div key={loan.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-lg">{loan.friend?.name}</h3>
                      <p className="text-xs text-slate-400">Total: ₹{loan.totalAmount} | {loan.schedule_type} EMI: ₹{loan.emi}</p>
                    </div>
                    {loan.kyc_document_url && <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded font-bold">KYC Verified</span>}
                  </div>
                  
                  <div className="mb-4">
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-green-600">Paid: ₹{loan.repaid}</span>
                      <span className="text-red-500">Bal: ₹{rem.toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5"><div className="bg-blue-600 h-1.5 rounded-full" style={{width:`${Math.min(prog,100)}%`}}></div></div>
                  </div>

                  <button onClick={() => { setManageLoan(loan); setPayAmount(loan.emi); }} className="w-full bg-slate-50 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm font-bold active:bg-slate-100">
                    Manage Account
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'ADD' && (
          <div className="bg-white p-6 rounded-3xl shadow-sm border space-y-4">
            <h2 className="text-xl font-black">New Disbursal</h2>
            
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase">Primary Borrower</p>
              <input type="text" placeholder="Full Name" value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl" />
              <input type="number" placeholder="Phone Number" value={formData.phone} onChange={e=>setFormData({...formData, phone:e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl" />
              
              <p className="text-xs font-bold text-slate-400 uppercase pt-2">Financials</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Amount (₹)" value={formData.amount} onChange={e=>setFormData({...formData, amount:e.target.value})} className="bg-slate-50 border p-3 rounded-xl" />
                <input type="number" placeholder="Months" value={formData.months} onChange={e=>setFormData({...formData, months:e.target.value})} className="bg-slate-50 border p-3 rounded-xl" />
                <input type="number" placeholder="Int. Rate (%)" value={formData.intRate} onChange={e=>setFormData({...formData, intRate:e.target.value})} className="bg-slate-50 border p-3 rounded-xl" />
                <select value={formData.intType} onChange={e=>setFormData({...formData, intType:e.target.value})} className="bg-slate-50 border p-3 rounded-xl"><option value="SI">Simple</option><option value="CI">Compound</option></select>
              </div>
              
              <p className="text-xs font-bold text-slate-400 uppercase pt-2">Guarantor (Optional)</p>
              <input type="text" placeholder="Guarantor Name" value={formData.gName} onChange={e=>setFormData({...formData, gName:e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl" />
              <input type="number" placeholder="Guarantor Phone" value={formData.gPhone} onChange={e=>setFormData({...formData, gPhone:e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl" />

              <button onClick={processLoan} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl mt-4 shadow-lg shadow-blue-200">Process & Generate Sanction</button>
            </div>
          </div>
        )}

        {activeTab === 'ANALYTICS' && (
          <div className="space-y-4">
            <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
              <div className="relative z-10">
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Net Business Profit</p>
                <p className="text-4xl font-black mt-1">₹{net.toLocaleString()}</p>
              </div>
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-500 rounded-full opacity-20 blur-2xl"></div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-3xl border"><p className="text-xs text-slate-500 font-bold">Total Disbursed</p><p className="text-xl font-black text-slate-800">₹{lent.toLocaleString()}</p></div>
              <div className="bg-red-50 p-5 rounded-3xl border border-red-100"><p className="text-xs text-red-500 font-bold">Outstanding</p><p className="text-xl font-black text-red-700">₹{pending.toLocaleString()}</p></div>
            </div>

            <div className="bg-white p-5 rounded-3xl border space-y-3">
              <h3 className="font-bold">Recovery Visualization</h3>
              <div className="h-4 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="bg-green-500 h-full" style={{width:`${Math.min((recovered/lent)*100,100)}%`}}></div>
              </div>
              <p className="text-xs text-center text-slate-500 font-bold">{recovered > 0 ? ((recovered/lent)*100).toFixed(1) : 0}% Funds Recovered</p>
            </div>
          </div>
        )}

        {activeTab === 'SETTINGS' && authRole === 'ADMIN' && (
          <div className="bg-white p-6 rounded-3xl border space-y-4">
            <h2 className="text-xl font-black">Business Configuration</h2>
            <input type="text" placeholder="Firm Name" value={lenderInfo.company} onChange={e=>setLenderInfo({...lenderInfo,company:e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl" />
            <input type="text" placeholder="UPI ID" value={lenderInfo.upi} onChange={e=>setLenderInfo({...lenderInfo,upi:e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl" />
            <input type="number" placeholder="Late Fee Per Day (₹)" value={lenderInfo.lateFee} onChange={e=>setLenderInfo({...lenderInfo,lateFee:e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl" />
            <button onClick={saveLenderSettings} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl">Update Settings</button>
          </div>
        )}
        {activeTab === 'SETTINGS' && authRole !== 'ADMIN' && <p className="text-center text-slate-400 mt-10">Access restricted to Admin only.</p>}
      </main>

      {/* Account Management Modal */}
      {manageLoan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end z-50 p-4 pb-20">
          <div className="bg-white w-full max-w-lg mx-auto rounded-3xl p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <button onClick={()=>setManageLoan(null)} className="absolute top-4 right-4 bg-slate-100 p-2 rounded-full font-bold">✕</button>
            <h3 className="text-xl font-black mb-1">{manageLoan.friend?.name}</h3>
            <p className="text-xs font-bold text-slate-400 mb-6">Guarantor: {manageLoan.guarantor_name || 'N/A'}</p>

            {manageLoan.status === 'ACTIVE' && (
              <div className="bg-slate-50 p-4 rounded-2xl border mb-6">
                <p className="text-xs font-bold text-slate-500 mb-2">RECORD REPAYMENT</p>
                <div className="flex gap-2 mb-2">
                  <input type="number" value={payAmount} onChange={e=>setPayAmount(e.target.value)} className="flex-1 border p-3 rounded-xl font-bold" />
                  <button onClick={()=>handlePayment(false)} className="bg-green-600 text-white px-6 rounded-xl font-bold">Save</button>
                </div>
                <div className="flex gap-2">
                  <input type="number" placeholder="Discount (₹)" value={discount} onChange={e=>setDiscount(e.target.value)} className="flex-1 border p-3 rounded-xl text-sm" />
                  <button onClick={()=>handlePayment(true)} className="bg-red-500 text-white px-4 rounded-xl text-xs font-bold">Foreclose</button>
                </div>
              </div>
            )}

            <p className="text-xs font-bold text-slate-500 mb-2">COMMUNICATION & DOCUMENTS</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={()=>sendWA(manageLoan, 'STATEMENT')} className="bg-slate-100 py-3 rounded-xl text-sm font-bold">🧾 Statement</button>
              {manageLoan.status === 'ACTIVE' ? (
                <>
                  <button onClick={()=>sendWA(manageLoan, 'EMI')} className="bg-indigo-50 text-indigo-700 py-3 rounded-xl text-sm font-bold">📲 EMI Link</button>
                  <button onClick={()=>setShowQR(!showQR)} className="bg-purple-50 text-purple-700 py-3 rounded-xl text-sm font-bold">📷 {showQR?'Hide':'Show'} QR</button>
                  <button onClick={()=>handleKYCUpload(manageLoan.id)} className="bg-blue-50 text-blue-700 py-3 rounded-xl text-sm font-bold">{isUploading ? '...' : '📁 Add KYC'}</button>
                </>
              ) : (
                <button onClick={()=>sendWA(manageLoan, 'NOC')} className="bg-green-100 text-green-700 py-3 rounded-xl text-sm font-bold col-span-2">🎉 Issue NOC</button>
              )}
            </div>

            {showQR && (
              <div className="p-4 border rounded-2xl flex flex-col items-center bg-white shadow-sm mb-4">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${lenderInfo.upi}&pn=${encodeURIComponent(lenderInfo.company)}&am=${Math.max(0, manageLoan.totalAmount - manageLoan.repaid)}`)}`} className="w-40 h-40 rounded-xl border p-2" alt="QR" />
                <p className="text-xs font-bold text-slate-400 mt-3">Scan to pay remaining balance</p>
              </div>
            )}

            {authRole === 'ADMIN' && (
              <button onClick={async () => {
                if(confirm("DANGER: Permanently delete this loan?")) {
                  await supabase.from('transactions').delete().eq('loan_id', manageLoan.id);
                  await supabase.from('loans').delete().eq('id', manageLoan.id);
                  setManageLoan(null); loadData();
                }
              }} className="w-full text-red-500 py-3 font-bold text-xs">🗑️ Delete Loan Permanently</button>
            )}
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 w-full max-w-2xl mx-auto bg-white/80 backdrop-blur-md border-t flex justify-around p-2 pb-safe shadow-2xl z-40">
        {[
          { id: 'DASHBOARD', icon: '📊', label: 'Home' },
          { id: 'BORROWERS', icon: '👥', label: 'Clients' },
          { id: 'ADD', icon: '➕', label: 'Disburse' },
          { id: 'ANALYTICS', icon: '📈', label: 'P&L' },
          { id: 'SETTINGS', icon: '⚙️', label: 'Config' }
        ].map(tab => (
          <button key={tab.id} onClick={()=>setActiveTab(tab.id)} className={`flex flex-col items-center p-2 rounded-xl w-16 transition-all ${activeTab===tab.id ? 'bg-blue-50 text-blue-600 scale-110' : 'text-slate-400 grayscale'}`}>
            <span className="text-lg mb-1">{tab.icon}</span>
            <span className="text-[9px] font-black tracking-wide">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
