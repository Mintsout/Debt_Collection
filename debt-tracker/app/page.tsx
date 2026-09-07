'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  
  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [dashFilter, setDashFilter] = useState('ACTIVE');
  
  // Data States
  const [lenderInfo, setLenderInfo] = useState({ name: 'Sandeep Kumar', company: 'SK Finserv', phone: '', address: '', upi: '' });
  const [loans, setLoans] = useState<any[]>([]);
  const [borrowers, setBorrowers] = useState<any[]>([]);
  
  // New Loan Form States
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [existingFriendId, setExistingFriendId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState('');
  const [interestRate, setInterestRate] = useState('0');
  const [interestType, setInterestType] = useState('SI');
  const [extraCharges, setExtraCharges] = useState('0');
  
  // Dashboard Analytics States
  const [totalLent, setTotalLent] = useState(0);
  const [totalRecovered, setTotalRecovered] = useState(0);
  const [totalInterestEarned, setTotalInterestEarned] = useState(0);
  const [totalChargesEarned, setTotalChargesEarned] = useState(0);

  // Modals & Action States
  const [manageLoan, setManageLoan] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [showQR, setShowQR] = useState(false);
  const [sanctionData, setSanctionData] = useState<any>(null);
  const [selectedBorrower, setSelectedBorrower] = useState<any>(null);
  
  // Edit Loan States
  const [isEditingLoan, setIsEditingLoan] = useState(false);
  const [editData, setEditData] = useState({ p: '', m: '', r: '', t: 'SI', c: '' });

  // 1. Data Fetching
  const loadData = async () => {
    const { data: lenderData } = await supabase.from('lender_profile').select('*').limit(1).maybeSingle();
    if (lenderData) {
      setLenderInfo({ name: lenderData.lender_name || '', company: lenderData.company_name || '', phone: lenderData.phone || '', address: lenderData.address || '', upi: lenderData.upi_id || '' });
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

    const { data: borrowersData } = await supabase.from('friends').select(`*, loans (*)`);
    if (borrowersData) setBorrowers(borrowersData);

    const { data: allLoans } = await supabase.from('loans').select('principal_amount, total_with_interest, extra_charges, total_repaid');
    if (allLoans) {
      let lent = 0, recovered = 0, interestTotal = 0, chargesTotal = 0;
      allLoans.forEach((l: any) => {
        const p = parseFloat(l.principal_amount);
        const t = parseFloat(l.total_with_interest || p);
        lent += p; recovered += parseFloat(l.total_repaid || 0);
        interestTotal += (t - p); chargesTotal += parseFloat(l.extra_charges || 0);
      });
      setTotalLent(lent); setTotalRecovered(recovered); setTotalInterestEarned(interestTotal); setTotalChargesEarned(chargesTotal);
    }
  };

  useEffect(() => { if (isAuthenticated) loadData(); }, [isAuthenticated]);

  // 2. Auth
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === '1305' || passcode === 'sandeep@123') setIsAuthenticated(true);
    else alert('❌ Incorrect Admin Passcode!');
  };

  // 3. Settings Save
  const saveLenderSettings = async () => {
    const { data: existing } = await supabase.from('lender_profile').select('id').limit(1).maybeSingle();
    if (existing) {
      await supabase.from('lender_profile').update({ lender_name: lenderInfo.name, company_name: lenderInfo.company, phone: lenderInfo.phone, address: lenderInfo.address, upi_id: lenderInfo.upi }).eq('id', existing.id);
    } else {
      await supabase.from('lender_profile').insert([{ lender_name: lenderInfo.name, company_name: lenderInfo.company, phone: lenderInfo.phone, address: lenderInfo.address, upi_id: lenderInfo.upi }]);
    }
    alert('Settings Saved Successfully! ✅');
    loadData();
  };

  // 4. Client Check & Sync
  const checkExistingCustomer = async (val: string, type: 'phone' | 'pan') => {
    if (!val || val.length < 4) return;
    const { data } = await supabase.from('friends').select('*').eq(type === 'phone' ? 'phone' : 'pan_number', val).maybeSingle();
    if (data) {
      setName(data.name); setPhone(data.phone); setPanNumber(data.pan_number || ''); setExistingFriendId(data.id);
      alert(`⚠️ Client '${data.name}' already exists.`);
    }
  };

  const syncContact = async () => {
    if ('contacts' in navigator && 'ContactsManager' in window) {
      try {
        const contacts = await (navigator as any).contacts.select(['name', 'tel'], { multiple: false });
        if (contacts.length > 0) {
          setName(contacts[0].name[0]);
          let num = contacts[0].tel[0].replace(/\D/g, '');
          if (num.length > 10) num = num.slice(-10);
          setPhone(num); checkExistingCustomer(num, 'phone');
        }
      } catch (ex) { alert('Contact sync cancelled.'); }
    } else { alert('Contact Sync not supported on this browser.'); }
  };

  // 5. Calculate Loan Logics
  const calculateLoanParams = (pAmt: number, mths: number, r: number, t: string, c: number) => {
    let total = pAmt;
    if (r > 0) {
      const timeInYears = mths / 12;
      total = t === 'SI' ? pAmt + ((pAmt * r * timeInYears) / 100) : pAmt * Math.pow((1 + r / 100), timeInYears);
    }
    total += c;
    return { totalPayable: total.toFixed(2), emi: (total / mths).toFixed(2) };
  };

  // 6. Create / Disburse Loan
  const saveLoan = async () => {
    if (!name || !phone || !amount || !months) return alert("Please fill mandatory details!");
    const p = parseFloat(amount), m = parseInt(months), r = parseFloat(interestRate || '0'), c = parseFloat(extraCharges || '0');
    
    const { totalPayable, emi } = calculateLoanParams(p, m, r, interestType, c);

    let fid = existingFriendId;
    if (!fid) {
      const { data: fData, error } = await supabase.from('friends').insert([{ name, phone, pan_number: panNumber }]).select().single();
      if (error) return alert("Error saving Client.");
      fid = fData.id;
    }

    const { data: loanData, error: loanError } = await supabase.from('loans').insert([{ 
      friend_id: fid, principal_amount: p, duration_months: m, interest_rate: r, interest_type: interestType, extra_charges: c, 
      total_with_interest: totalPayable, emi_amount: emi 
    }]).select().single();

    if (loanError) return alert(loanError.message);
    
    await supabase.from('transactions').insert([{ loan_id: loanData.id, amount_paid: p, type: 'DISBURSEMENT' }]);
    
    setSanctionData({ loanId: loanData.id, name, phone, pan: panNumber, p, m, r, t: interestType, c, totalPayable, emi, date: new Date() });
    setName(''); setPhone(''); setPanNumber(''); setExistingFriendId(null);
    setAmount(''); setMonths(''); setInterestRate('0'); setExtraCharges('0');
    loadData();
  };

  // 7. Edit Loan
  const handleEditLoanSave = async () => {
    const p = parseFloat(editData.p), m = parseInt(editData.m), r = parseFloat(editData.r), c = parseFloat(editData.c);
    const { totalPayable, emi } = calculateLoanParams(p, m, r, editData.t, c);

    await supabase.from('loans').update({
      principal_amount: p, duration_months: m, interest_rate: r, interest_type: editData.t, extra_charges: c,
      total_with_interest: totalPayable, emi_amount: emi
    }).eq('id', manageLoan.id);

    alert("Loan Updated Successfully! 🔄");
    setIsEditingLoan(false); setManageLoan(null); loadData();
  };

  // 8. Payments & Foreclosure
  const handleRecordPayment = async (isForeclose = false) => {
    let amtPaid = parseFloat(paymentAmount);
    const disc = parseFloat(discountAmount || '0');
    if (isForeclose) amtPaid = Math.max(0, (manageLoan.totalAmount - manageLoan.repaid) - disc);
    if (isNaN(amtPaid) || amtPaid <= 0) return alert("Invalid amount");

    await supabase.from('transactions').insert([{ loan_id: manageLoan.id, amount_paid: amtPaid, type: 'REPAYMENT' }]);
    const newRepaid = manageLoan.repaid + amtPaid + (isForeclose ? disc : 0);
    const newStatus = (newRepaid >= manageLoan.totalAmount || isForeclose) ? 'CLOSED' : 'ACTIVE';

    await supabase.from('loans').update({ total_repaid: newRepaid, status: newStatus }).eq('id', manageLoan.id);
    alert(isForeclose ? "Loan Foreclosed & Closed! 🤝" : "Payment Recorded Successfully! ✅");
    setManageLoan(null); setPaymentAmount(''); setDiscountAmount('0'); setShowQR(false);
    loadData();
  };

  // 9. Permanent Deletion
  const handleDeleteLoan = async () => {
    if(confirm("🚨 WARNING: Are you sure you want to PERMANENTLY delete this loan and all its payments? This cannot be undone.")) {
      await supabase.from('transactions').delete().eq('loan_id', manageLoan.id);
      await supabase.from('loans').delete().eq('id', manageLoan.id);
      alert("Loan Deleted. 🗑️");
      setManageLoan(null); loadData();
    }
  };

  // 10. REAL HINDI WhatsApp Templates
  const sendWhatsApp = (loan: any, type: string) => {
    if (!lenderInfo.upi && type !== 'STATEMENT' && type !== 'NOC') return alert("Please save your UPI ID in Settings first!");
    const bal = Math.max(0, loan.totalAmount - loan.repaid);
    const link = `upi://pay?pa=${lenderInfo.upi}&pn=${encodeURIComponent(lenderInfo.company)}&am=${type === 'EMI' ? loan.emi.toFixed(2) : bal.toFixed(2)}`;
    
    let msg = '';
    if (type === 'EMI') {
      msg = `🚨 *पेमेंट रिमाइंड* 🚨\n\nनमस्ते *${loan.friend?.name}* जी,\nआपकी *₹${loan.emi.toFixed(2)}* की किश्त (EMI) का समय हो गया है। कृपया समय पर भुगतान करें।\n\n⚡ *यहाँ क्लिक करके पेमेंट करें:*\n${link}\n\nधन्यवाद 🙏\n*${lenderInfo.company}*`;
    } else if (type === 'FULL') {
      msg = `🌟 *लोन सेटलमेंट* 🌟\n\nनमस्ते *${loan.friend?.name}* जी,\nआपके लोन का पूरा बकाया *₹${bal.toFixed(2)}* है। कृपया आज ही अपना खाता क्लियर करें।\n\n⚡ *यहाँ क्लिक करके पेमेंट करें:*\n${link}\n\nधन्यवाद 🙏`;
    } else if (type === 'STATEMENT') {
      msg = `🧾 *लोन स्टेटमेंट* 🧾\n\n*ग्राहक का नाम:* ${loan.friend?.name}\n*कुल लोन रकम:* ₹${loan.totalAmount.toFixed(2)}\n*अब तक जमा किया:* ₹${loan.repaid.toFixed(2)}\n*बाकी बकाया:* ₹${bal.toFixed(2)}\n\n_Thank you for doing business with ${lenderInfo.company}!_`;
    } else if (type === 'NOC') {
      msg = `🎉 *No Objection Certificate (NOC)* 🎉\n\nप्रमाणित किया जाता है कि *${loan.friend?.name}* जी ने अपने लोन (मूलधन ₹${loan.principal.toFixed(2)}) का पूरा भुगतान कर दिया है। \n\nअब हमारी तरफ से आपके ऊपर कोई बकाया (Dues) नहीं है। आपका खाता सफलतापूर्वक बंद कर दिया गया है।\n\nशुभकामनाओं सहित,\n*${lenderInfo.company}*`;
    }
    window.open(`https://wa.me/91${loan.friend?.phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Analytics Variables
  const totalPending = Math.max(0, totalLent - totalRecovered);
  const netProfit = totalInterestEarned + totalChargesEarned;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-blue-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-black text-gray-800">🔒 Admin Portal</h1>
            <p className="text-xs text-gray-500 mt-1">Authorized Access Only</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="password" placeholder="••••" value={passcode} onChange={e => setPasscode(e.target.value)} className="w-full border-2 border-gray-200 p-3 rounded-xl text-center text-2xl tracking-widest font-bold focus:border-blue-600 outline-none" autoFocus />
            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-blue-700">Login 🚀</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans text-gray-900 relative">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 shadow-md pt-8 flex justify-between items-center rounded-b-xl">
        <h1 className="text-xl font-black tracking-wide">{lenderInfo.company || 'Debt Tracker'}</h1>
        <button onClick={() => setIsAuthenticated(false)} className="bg-white/20 px-3 py-1.5 rounded-lg text-xs font-bold border border-white/30">🔒 Logout</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'DASHBOARD' && (
          <div className="space-y-4">
            <div className="flex bg-gray-200 p-1 rounded-lg">
              <button onClick={() => setDashFilter('ACTIVE')} className={`flex-1 py-2 text-sm rounded-md font-bold transition ${dashFilter === 'ACTIVE' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Active Loans</button>
              <button onClick={() => setDashFilter('CLOSED')} className={`flex-1 py-2 text-sm rounded-md font-bold transition ${dashFilter === 'CLOSED' ? 'bg-white shadow text-gray-700' : 'text-gray-500'}`}>History (Closed)</button>
            </div>

            {loans.filter(l => l.status === dashFilter).length === 0 ? <p className="text-center text-gray-400 mt-10">No loans found here.</p> : 
              loans.filter(l => l.status === dashFilter).map((loan) => {
              const progress = (loan.repaid / loan.totalAmount) * 100;
              const remaining = Math.max(0, loan.totalAmount - loan.repaid);
              return (
                <div key={loan.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <h3 className="font-bold text-lg text-gray-800">{loan.friend?.name}</h3>
                      <p className="text-xs text-gray-400">Total: ₹{loan.totalAmount.toFixed(2)} | EMI: ₹{loan.emi.toFixed(2)}</p>
                    </div>
                    <a href={`tel:${loan.friend?.phone}`} className="bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm">📞 Call</a>
                  </div>
                  <div className="mb-4">
                    <div className="flex justify-between text-[11px] font-bold text-gray-600 mb-1">
                      <span className="text-green-600">₹{loan.repaid.toFixed(2)} Paid</span>
                      <span className={remaining > 0 ? "text-red-500" : "text-gray-400"}>₹{remaining.toFixed(2)} Left</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${loan.status === 'CLOSED' ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(progress, 100)}%` }}></div>
                    </div>
                  </div>
                  <button onClick={() => { 
                    setManageLoan(loan); setPaymentAmount(loan.emi.toString()); 
                    setEditData({ p: loan.principal, m: loan.duration_months, r: loan.interest_rate, t: loan.interest_type, c: loan.extra_charges });
                  }} className="w-full bg-slate-50 text-slate-700 border border-slate-200 py-2.5 rounded-lg text-sm font-bold shadow-sm">
                    ⚙️ Manage Account
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 2: BORROWERS / CLIENT LIST */}
        {activeTab === 'BORROWERS' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold mb-2">Client Directory</h2>
            {borrowers.length === 0 ? <p className="text-gray-500 text-sm">No clients found.</p> : borrowers.map((b) => (
              <div key={b.id} onClick={() => setSelectedBorrower(b)} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition">
                <h3 className="font-bold text-lg text-gray-800">{b.name}</h3>
                <p className="text-xs text-gray-500 mt-1">📱 {b.phone} {b.pan_number ? `| 💳 PAN: ${b.pan_number}` : ''}</p>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: ADD NEW LOAN */}
        {activeTab === 'ADD' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border space-y-3">
            <h2 className="text-xl font-black mb-2">{existingFriendId ? 'Grant New Loan to Client' : 'New Loan Disbursal'}</h2>
            <button onClick={syncContact} className="w-full bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold py-2 rounded-lg mb-2 shadow-sm">📒 Sync from Contacts</button>
            
            <input type="text" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} className="w-full border p-3 rounded-lg bg-gray-50" />
            <input type="number" placeholder="Phone Number" value={phone} onChange={e => { setPhone(e.target.value); checkExistingCustomer(e.target.value, 'phone'); }} className="w-full border p-3 rounded-lg bg-gray-50" />
            <input type="text" placeholder="PAN Number (Optional)" value={panNumber} onChange={e => { setPanNumber(e.target.value.toUpperCase()); checkExistingCustomer(e.target.value.toUpperCase(), 'pan'); }} className="w-full border p-3 rounded-lg bg-gray-50 uppercase" />
            
            <div className="grid grid-cols-2 gap-2 mt-4">
              <input type="number" placeholder="Principal (₹)" value={amount} onChange={e => setAmount(e.target.value)} className="border p-3 rounded-lg bg-gray-50" />
              <input type="number" placeholder="Months" value={months} onChange={e => setMonths(e.target.value)} className="border p-3 rounded-lg bg-gray-50" />
              <input type="number" placeholder="Int. Rate (%)" value={interestRate} onChange={e => setInterestRate(e.target.value)} className="border p-3 rounded-lg bg-gray-50" />
              <select value={interestType} onChange={e => setInterestType(e.target.value)} className="border p-3 rounded-lg bg-gray-50">
                <option value="SI">Simple Int.</option><option value="CI">Compound Int.</option>
              </select>
            </div>
            <input type="number" placeholder="Extra Charges (₹)" value={extraCharges} onChange={e => setExtraCharges(e.target.value)} className="w-full border p-3 rounded-lg bg-gray-50" />
            
            <button onClick={saveLoan} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-lg mt-4 shadow-lg shadow-blue-200">Disburse & Print Letter</button>
          </div>
        )}

        {/* TAB 4: ANALYTICS (P&L) */}
        {activeTab === 'ANALYTICS' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl shadow-sm border">
              <h2 className="text-xl font-black mb-4">📊 Profit & Loss (P&L)</h2>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-green-50 p-3 rounded-lg"><p className="text-xs text-green-700 font-bold">Interest Earned</p><p className="text-lg font-black">+₹{totalInterestEarned.toFixed(2)}</p></div>
                <div className="bg-indigo-50 p-3 rounded-lg"><p className="text-xs text-indigo-700 font-bold">Extra Charges</p><p className="text-lg font-black">+₹{totalChargesEarned.toFixed(2)}</p></div>
              </div>
              <div className="bg-slate-900 text-white p-4 rounded-xl shadow-md"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Net Business Profit</p><p className="text-3xl font-black text-green-400">₹{netProfit.toFixed(2)}</p></div>
            </div>
            
            <div className="bg-white p-5 rounded-xl shadow-sm border">
              <h2 className="text-lg font-bold mb-4">Capital Analysis</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 border p-3 rounded-lg"><p className="text-[10px] text-gray-500 font-bold uppercase">Total Disbursed</p><p className="text-xl font-black text-gray-800">₹{totalLent.toFixed(2)}</p></div>
                <div className="bg-red-50 border border-red-100 p-3 rounded-lg"><p className="text-[10px] text-red-600 font-bold uppercase">Market Outstanding</p><p className="text-xl font-black text-red-600">₹{totalPending.toFixed(2)}</p></div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SETTINGS */}
        {activeTab === 'SETTINGS' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
            <h2 className="text-xl font-black mb-2">Lender Configuration</h2>
            <input type="text" placeholder="Your Name" value={lenderInfo.name} onChange={e => setLenderInfo({...lenderInfo, name: e.target.value})} className="w-full border p-3 rounded-lg bg-gray-50" />
            <input type="text" placeholder="Firm / Company Name" value={lenderInfo.company} onChange={e => setLenderInfo({...lenderInfo, company: e.target.value})} className="w-full border p-3 rounded-lg bg-gray-50" />
            <input type="number" placeholder="Support Phone" value={lenderInfo.phone} onChange={e => setLenderInfo({...lenderInfo, phone: e.target.value})} className="w-full border p-3 rounded-lg bg-gray-50" />
            <textarea placeholder="Office Address" value={lenderInfo.address} onChange={e => setLenderInfo({...lenderInfo, address: e.target.value})} className="w-full border p-3 rounded-lg bg-gray-50 h-20"></textarea>
            <input type="text" placeholder="UPI ID (for payments)" value={lenderInfo.upi} onChange={e => setLenderInfo({...lenderInfo, upi: e.target.value})} className="w-full border p-3 rounded-lg bg-gray-50" />
            <button onClick={saveLenderSettings} className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-lg mt-2 shadow-md">Save Settings</button>
          </div>
        )}
      </div>

      {/* --- MODALS --- */}

      {/* 1. Client Loan History Modal */}
      {selectedBorrower && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h3 className="font-black text-xl">{selectedBorrower.name}</h3>
              <button onClick={() => setSelectedBorrower(null)} className="bg-gray-100 p-2 rounded-full">✕</button>
            </div>
            <div className="text-sm bg-gray-50 p-3 rounded-lg mb-4 border">
              <p>📱 {selectedBorrower.phone}</p>
              {selectedBorrower.pan_number && <p>💳 {selectedBorrower.pan_number}</p>}
            </div>
            <h4 className="font-bold text-gray-700 mb-2">Past & Active Loans:</h4>
            <div className="space-y-2">
              {selectedBorrower.loans?.map((l: any) => (
                <div key={l.id} className="border p-3 rounded-lg text-sm bg-white flex justify-between">
                  <span>₹{parseFloat(l.principal_amount).toFixed(2)}</span>
                  <span className={`font-bold ${l.status==='CLOSED'?'text-green-600':'text-blue-600'}`}>{l.status}</span>
                </div>
              ))}
            </div>
            <button onClick={() => {
              setName(selectedBorrower.name); setPhone(selectedBorrower.phone); setPanNumber(selectedBorrower.pan_number || '');
              setExistingFriendId(selectedBorrower.id); setSelectedBorrower(null); setActiveTab('ADD');
            }} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg mt-4 shadow-md">Grant Another Loan</button>
          </div>
        </div>
      )}

      {/* 2. Sanction Letter / Print Modal (With Return Policy) */}
      {sanctionData && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto text-sm border-t-8 border-blue-600">
            <div className="text-center border-b pb-4 mb-4">
              <h2 className="text-2xl font-black text-gray-800">{lenderInfo.company || 'FINANCIAL SERVICES'}</h2>
              <p className="text-gray-500 text-xs mt-1">{lenderInfo.address} | Ph: {lenderInfo.phone}</p>
              <h3 className="font-bold text-md mt-3 bg-gray-100 py-1.5 uppercase tracking-widest border rounded">Sanction & Disbursal Letter</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg border mb-4">
              <p><span className="text-gray-500 text-xs block">Borrower Name</span><strong>{sanctionData.name}</strong></p>
              <p><span className="text-gray-500 text-xs block">Mobile Number</span><strong>{sanctionData.phone}</strong></p>
              <p><span className="text-gray-500 text-xs block">PAN Number</span><strong>{sanctionData.pan || 'N/A'}</strong></p>
              <p><span className="text-gray-500 text-xs block">Date</span><strong>{new Date(sanctionData.date).toLocaleDateString()}</strong></p>
            </div>
            <div className="space-y-2 border p-4 rounded-lg mb-6">
              <div className="flex justify-between"><span className="text-gray-600">Principal Amount:</span><strong className="text-lg">₹{sanctionData.p.toFixed(2)}</strong></div>
              <div className="flex justify-between"><span className="text-gray-600">Tenure:</span><strong>{sanctionData.m} Months</strong></div>
              <div className="flex justify-between"><span className="text-gray-600">Interest Details:</span><strong>{sanctionData.r}% ({sanctionData.t})</strong></div>
              <div className="flex justify-between border-t pt-2 mt-2"><span className="text-gray-600">Total Repayable:</span><strong>₹{parseFloat(sanctionData.totalPayable).toFixed(2)}</strong></div>
              <div className="flex justify-between bg-blue-50 p-2 rounded mt-2"><span className="font-bold text-blue-800">Monthly EMI:</span><strong className="text-blue-800 text-lg">₹{sanctionData.emi}</strong></div>
            </div>
            
            {/* Return Policy / T&C */}
            <div className="bg-red-50 p-3 rounded border border-red-100 text-xs text-red-800 mb-6">
              <p className="font-bold mb-1">नियम व शर्तें (Terms & Policy):</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>ऋण की किश्त (EMI) का भुगतान तय समय सीमा के भीतर करना अनिवार्य है।</li>
                <li>समय पर भुगतान न करने की स्थिति में नियमानुसार विलंब शुल्क (Late Fee) देय होगा।</li>
                <li>लगातार डिफॉल्ट होने पर लेंडर के पास कानूनी कार्रवाई करने का पूर्ण अधिकार सुरक्षित है।</li>
              </ol>
            </div>

            <div className="flex justify-between items-end pt-4 border-t">
              <div><p className="font-bold text-gray-800">Authorized Signatory</p><p className="text-gray-500 text-xs mt-1">{lenderInfo.name}</p></div>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-slate-900 text-white px-5 py-2.5 rounded-lg font-bold shadow">Print PDF</button>
                <button onClick={() => setSanctionData(null)} className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold shadow">Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Manage Loan / Edit / Share / Delete Modal */}
      {manageLoan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-5 w-full max-w-md max-h-[95vh] overflow-y-auto pb-10">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <div>
                <h3 className="font-black text-xl text-gray-800">{manageLoan.friend?.name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded font-black tracking-widest ${manageLoan.status === 'CLOSED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{manageLoan.status}</span>
              </div>
              <button onClick={() => { setManageLoan(null); setIsEditingLoan(false); }} className="bg-gray-100 p-2 rounded-full font-bold">✕</button>
            </div>

            {/* Toggle: Manage vs Edit */}
            <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
              <button onClick={() => setIsEditingLoan(false)} className={`flex-1 py-1.5 text-xs font-bold rounded ${!isEditingLoan ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>Actions & Pay</button>
              <button onClick={() => setIsEditingLoan(true)} className={`flex-1 py-1.5 text-xs font-bold rounded ${isEditingLoan ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>Edit Loan</button>
            </div>

            {!isEditingLoan ? (
              <>
                {manageLoan.status === 'ACTIVE' && (
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-5">
                    <p className="text-[10px] font-black text-blue-500 mb-2 tracking-widest uppercase">Record Payment</p>
                    <div className="flex gap-2 mb-3">
                      <input type="number" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)} className="flex-1 border p-2.5 rounded-lg font-bold" />
                      <button onClick={()=>handleRecordPayment(false)} className="bg-blue-600 text-white px-5 rounded-lg font-bold text-sm shadow">Save</button>
                    </div>
                    <div className="flex gap-2">
                      <input type="number" placeholder="Discount ₹ (Waiver)" value={discountAmount} onChange={e=>setDiscountAmount(e.target.value)} className="flex-1 border p-2.5 rounded-lg text-xs" />
                      <button onClick={()=>handleRecordPayment(true)} className="bg-red-500 text-white px-4 rounded-lg text-xs font-bold shadow">Foreclose</button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Share & Statements</p>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => sendWhatsApp(manageLoan, 'STATEMENT')} className="bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-bold shadow-sm">🧾 Statement</button>
                    {manageLoan.status === 'ACTIVE' ? (
                      <>
                        <button onClick={() => sendWhatsApp(manageLoan, 'EMI')} className="bg-indigo-50 text-indigo-700 border border-indigo-100 py-3 rounded-xl text-sm font-bold shadow-sm">📲 Ask EMI</button>
                        <button onClick={() => sendWhatsApp(manageLoan, 'FULL')} className="bg-blue-50 text-blue-700 border border-blue-100 py-3 rounded-xl text-sm font-bold shadow-sm">📲 Ask Full</button>
                        <button onClick={() => setShowQR(!showQR)} className="bg-purple-50 text-purple-700 border border-purple-100 py-3 rounded-xl text-sm font-bold shadow-sm">📷 {showQR?'Hide QR':'Show QR'}</button>
                      </>
                    ) : (
                      <button onClick={() => sendWhatsApp(manageLoan, 'NOC')} className="bg-green-100 text-green-700 border border-green-200 py-3 rounded-xl text-sm font-bold col-span-2 shadow-sm">🎉 Send NOC (WhatsApp)</button>
                    )}
                  </div>

                  {showQR && manageLoan.status === 'ACTIVE' && (
                    <div className="mt-4 p-4 border rounded-xl flex flex-col items-center bg-gray-50 shadow-inner">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${lenderInfo.upi}&pn=${encodeURIComponent(lenderInfo.company)}&am=${Math.max(0, manageLoan.totalAmount - manageLoan.repaid).toFixed(2)}`)}`} alt="QR" className="w-44 h-44 rounded border bg-white p-2" />
                      <p className="text-[10px] font-bold text-gray-400 mt-2">Scan to Pay via any UPI App</p>
                    </div>
                  )}

                  <hr className="my-5 border-gray-200" />
                  
                  {/* Delete Option */}
                  <button onClick={handleDeleteLoan} className="w-full bg-red-50 text-red-600 border border-red-100 py-3.5 rounded-xl font-bold text-sm shadow-sm">
                    🗑️ Delete Loan & All Records
                  </button>
                </div>
              </>
            ) : (
              /* Edit Loan Form */
              <div className="space-y-3 bg-gray-50 p-4 rounded-xl border">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Modify Loan Terms</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs font-bold text-gray-500">Principal</label><input type="number" value={editData.p} onChange={e=>setEditData({...editData, p:e.target.value})} className="w-full border p-2.5 rounded-lg text-sm" /></div>
                  <div><label className="text-xs font-bold text-gray-500">Months</label><input type="number" value={editData.m} onChange={e=>setEditData({...editData, m:e.target.value})} className="w-full border p-2.5 rounded-lg text-sm" /></div>
                  <div><label className="text-xs font-bold text-gray-500">Int Rate %</label><input type="number" value={editData.r} onChange={e=>setEditData({...editData, r:e.target.value})} className="w-full border p-2.5 rounded-lg text-sm" /></div>
                  <div><label className="text-xs font-bold text-gray-500">Type</label><select value={editData.t} onChange={e=>setEditData({...editData, t:e.target.value})} className="w-full border p-2.5 rounded-lg text-sm bg-white"><option value="SI">SI</option><option value="CI">CI</option></select></div>
                </div>
                <div><label className="text-xs font-bold text-gray-500">Extra Charges</label><input type="number" value={editData.c} onChange={e=>setEditData({...editData, c:e.target.value})} className="w-full border p-2.5 rounded-lg text-sm" /></div>
                <button onClick={handleEditLoanSave} className="w-full bg-slate-800 text-white font-bold py-3 rounded-lg mt-3 shadow-md">Save Changes & Recalculate</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- BOTTOM NAVIGATION BAR --- */}
      <div className="fixed bottom-0 w-full bg-white border-t flex justify-around p-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] text-[10px] font-bold z-40">
        {[
          { id: 'DASHBOARD', icon: '📊', label: 'Home' },
          { id: 'BORROWERS', icon: '👥', label: 'Clients' },
          { id: 'ADD', icon: '➕', label: 'Add Loan' },
          { id: 'ANALYTICS', icon: '📈', label: 'P&L' },
          { id: 'SETTINGS', icon: '⚙️', label: 'Settings' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center transition ${activeTab === tab.id ? 'text-blue-600 scale-110' : 'text-gray-400'}`}>
            <span className="text-lg mb-0.5">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}



