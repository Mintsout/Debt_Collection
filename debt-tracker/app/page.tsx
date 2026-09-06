'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  // Admin Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');

  const [activeTab, setActiveTab] = useState('DASHBOARD'); // DASHBOARD, BORROWERS, ANALYTICS, ADD, SETTINGS
  
  // Lender Profile States
  const [lenderInfo, setLenderInfo] = useState({ name: 'Sandeep Kumar', company: 'SK Finserv', phone: '', address: '', upi: '' });
  
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
  
  const [loans, setLoans] = useState<any[]>([]);
  const [borrowers, setBorrowers] = useState<any[]>([]);
  const [selectedBorrower, setSelectedBorrower] = useState<any>(null);
  
  // Analytics States
  const [totalLent, setTotalLent] = useState(0);
  const [totalRecovered, setTotalRecovered] = useState(0);
  const [totalInterestEarned, setTotalInterestEarned] = useState(0);
  const [totalChargesEarned, setTotalChargesEarned] = useState(0);
  const [txHistory, setTxHistory] = useState<any[]>([]);

  // Payment Modal States
  const [showModal, setShowModal] = useState(false);
  const [currentLoan, setCurrentLoan] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');

  // Sanction Letter Modal State
  const [sanctionData, setSanctionData] = useState<any>(null);

  const loadData = async () => {
    const { data: lenderData } = await supabase.from('lender_profile').select('*').limit(1).maybeSingle();
    if (lenderData) {
      setLenderInfo({ name: lenderData.lender_name || '', company: lenderData.company_name || '', phone: lenderData.phone || '', address: lenderData.address || '', upi: lenderData.upi_id || '' });
    }

    const { data: loansData } = await supabase
      .from('loans')
      .select(`id, principal_amount, interest_rate, interest_type, extra_charges, total_with_interest, emi_amount, total_repaid, status, created_at, friends ( id, name, phone, pan_number )`)
      .eq('status', 'ACTIVE');
    
    if (loansData) {
      setLoans(loansData.map((l: any) => ({
        id: l.id,
        friendId: l.friends?.id,
        name: l.friends?.name,
        phone: l.friends?.phone,
        pan: l.friends?.pan_number,
        principal: parseFloat(l.principal_amount),
        totalAmount: parseFloat(l.total_with_interest || l.principal_amount),
        repaid: parseFloat(l.total_repaid || 0),
        emi: parseFloat(l.emi_amount),
        createdAt: l.created_at
      })));
    }

    const { data: borrowersData } = await supabase.from('friends').select(`*, loans ( id, principal_amount, total_with_interest, total_repaid, status, created_at )`);
    if (borrowersData) {
      const uniqueMap = new Map();
      borrowersData.forEach((b: any) => {
        if (!uniqueMap.has(b.phone)) {
          uniqueMap.set(b.phone, b);
        } else {
          const existing = uniqueMap.get(b.phone);
          existing.loans = [...(existing.loans || []), ...(b.loans || [])];
        }
      });
      setBorrowers(Array.from(uniqueMap.values()));
    }

    const { data: allLoans } = await supabase.from('loans').select('principal_amount, total_with_interest, extra_charges, total_repaid');
    if (allLoans) {
      let lent = 0; let recovered = 0; let interestTotal = 0; let chargesTotal = 0;
      allLoans.forEach((l: any) => {
        const principal = parseFloat(l.principal_amount);
        const totalWithInt = parseFloat(l.total_with_interest || principal);
        lent += principal;
        recovered += parseFloat(l.total_repaid || 0);
        interestTotal += (totalWithInt - principal);
        chargesTotal += parseFloat(l.extra_charges || 0);
      });
      setTotalLent(lent);
      setTotalRecovered(recovered);
      setTotalInterestEarned(interestTotal);
      setTotalChargesEarned(chargesTotal);
    }

    const { data: txData } = await supabase
      .from('transactions')
      .select(`amount_paid, payment_date, type, loans ( friends ( name ) )`)
      .order('payment_date', { ascending: false })
      .limit(20);
    if (txData) setTxHistory(txData);
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  // Master Login Handler (Default Pin: 1305 or change as you like)
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Aap apna secret PIN yahan set kar sakte hain (e.g., 1998 ya jo aap chahein)
    if (passcode === '1305' || passcode === 'sandeep@123') {
      setIsAuthenticated(true);
    } else {
      alert('❌ Incorrect Admin Passcode! Access Denied.');
    }
  };

  const checkExistingCustomer = async (val: string, type: 'phone' | 'pan') => {
    if (!val || val.length < 4) return;
    const { data } = await supabase
      .from('friends')
      .select('*')
      .eq(type === 'phone' ? 'phone' : 'pan_number', val)
      .maybeSingle();

    if (data) {
      setName(data.name);
      setPhone(data.phone);
      setPanNumber(data.pan_number || '');
      setExistingFriendId(data.id);
      alert(`⚠️ DUPLICATE ENTRY NOTICE!\nCustomer '${data.name}' already exists with this ${type.toUpperCase()}.\nData loaded automatically from database.`);
    }
  };

  const saveLenderSettings = async () => {
    const { data: existing } = await supabase.from('lender_profile').select('id').limit(1).maybeSingle();
    if (existing) {
      await supabase.from('lender_profile').update({ lender_name: lenderInfo.name, company_name: lenderInfo.company, phone: lenderInfo.phone, address: lenderInfo.address, upi_id: lenderInfo.upi }).eq('id', existing.id);
    } else {
      await supabase.from('lender_profile').insert([{ lender_name: lenderInfo.name, company_name: lenderInfo.company, phone: lenderInfo.phone, address: lenderInfo.address, upi_id: lenderInfo.upi }]);
    }
    alert('Lender & UPI Settings Saved Successfully! 🚀');
    loadData();
  };

  const saveLoan = async () => {
    if (!name || !phone || !amount || !months) return alert("Please fill mandatory details!");
    
    const p = parseFloat(amount);
    const nMonths = parseInt(months);
    const rYearly = parseFloat(interestRate || '0');
    const charges = parseFloat(extraCharges || '0');

    let totalPayable = p;
    if (rYearly > 0) {
      const timeInYears = nMonths / 12;
      if (interestType === 'SI') {
        totalPayable = p + ((p * rYearly * timeInYears) / 100);
      } else {
        totalPayable = p * Math.pow((1 + rYearly / 100), timeInYears);
      }
    }
    totalPayable += charges;
    const calculatedEmi = (totalPayable / nMonths).toFixed(2);

    let friendId = existingFriendId;

    if (!friendId) {
      const { data: friendData, error: friendError } = await supabase
        .from('friends').insert([{ name, phone, pan_number: panNumber }]).select().single();
      if (friendError) return alert("Error saving Friend: " + friendError.message);
      friendId = friendData.id;
    }

    const { data: loanData, error: loanError } = await supabase
      .from('loans').insert([{ 
        friend_id: friendId, 
        principal_amount: p, 
        duration_months: nMonths, 
        interest_rate: rYearly,
        interest_type: interestType,
        extra_charges: charges,
        total_with_interest: totalPayable.toFixed(2),
        emi_amount: calculatedEmi 
      }]).select().single();

    if (loanError) {
      alert("Error saving Loan: " + loanError.message);
    } else {
      await supabase.from('transactions').insert([{ 
        loan_id: loanData.id, 
        amount_paid: p, 
        type: 'DISBURSEMENT' 
      }]);

      alert("Loan Disbursed Successfully! 🎉");
      
      setSanctionData({
        loanId: loanData.id,
        name, phone, pan: panNumber, p, nMonths, rYearly, interestType, charges, totalPayable, calculatedEmi, date: new Date()
      });

      setName(''); setPhone(''); setPanNumber(''); setExistingFriendId(null);
      setAmount(''); setMonths(''); setInterestRate('0'); setExtraCharges('0');
      loadData();
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
          setPhone(num);
          checkExistingCustomer(num, 'phone');
        }
      } catch (ex) { alert('Contact sync cancelled.'); }
    } else { alert('Contact Sync not supported.'); }
  };

  const sendWhatsApp = (friendPhone: string, friendName: string, sendAmount: number, type: string) => {
    if (!lenderInfo.upi) return alert("Please save your UPI ID in Settings first!");
    const upiLink = `upi://pay?pa=${lenderInfo.upi}&pn=${encodeURIComponent(lenderInfo.name)}&am=${sendAmount.toFixed(2)}`;
    
    const msg = type === 'EMI' 
      ? `🚨 *PAYMENT REMINDER* 🚨\n\nDear *${friendName}*,\nYour scheduled EMI of *₹${sendAmount.toFixed(2)}* is due towards your loan account with *${lenderInfo.company_name || lenderInfo.name}*.\n\n⚡ *Instant Pay via UPI:*\n${upiLink}\n\n_Please clear dues on time to maintain a healthy credit score. Ignore if already paid._ 🙏`
      : `🌟 *LOAN SETTLEMENT NOTICE* 🌟\n\nDear *${friendName}*,\nYour total outstanding balance is *₹${sendAmount.toFixed(2)}*. Clear your account today to close your loan.\n\n⚡ *Pay Full Amount via UPI:*\n${upiLink}\n\nThank you for banking with us! 🤝`;

    window.open(`https://wa.me/91${friendPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleRecordPayment = async (isForeclose = false) => {
    let amountPaid = parseFloat(paymentAmount);
    const discount = parseFloat(discountAmount || '0');

    if (isForeclose) {
      const remaining = currentLoan.totalAmount - currentLoan.repaid;
      amountPaid = Math.max(0, remaining - discount);
    }

    if (isNaN(amountPaid) || amountPaid <= 0) return alert("Invalid amount");

    await supabase.from('transactions').insert([{ 
      loan_id: currentLoan.id, 
      amount_paid: amountPaid, 
      type: 'REPAYMENT' 
    }]);

    const newRepaid = currentLoan.repaid + amountPaid + (isForeclose ? discount : 0);
    const newStatus = (newRepaid >= currentLoan.totalAmount || isForeclose) ? 'CLOSED' : 'ACTIVE';

    await supabase.from('loans').update({ total_repaid: newRepaid, status: newStatus }).eq('id', currentLoan.id);

    alert(isForeclose ? "Loan Foreclosed Successfully! 🤝" : "Payment Recorded Successfully! ✅");
    setShowModal(false); setPaymentAmount(''); setDiscountAmount('0');
    loadData();
  };

  const totalPending = Math.max(0, totalLent - totalRecovered);
  const recoveryRate = totalLent > 0 ? ((totalRecovered / totalLent) * 100).toFixed(2) : '0';
  const netProfit = totalInterestEarned + totalChargesEarned;

  // IF NOT LOGGED IN, SHOW ADMIN LOGIN SCREEN
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-blue-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-black text-gray-800">🔒 Admin Portal</h1>
            <p className="text-xs text-gray-500 mt-1">Authorized Access Only (Sandeep Kumar)</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-600">Enter Admin Passcode / PIN</label>
              <input 
                type="password" 
                placeholder="••••" 
                value={passcode} 
                onChange={e => setPasscode(e.target.value)} 
                className="w-full border-2 border-gray-200 p-3 rounded-xl mt-1 text-center text-xl tracking-widest font-bold focus:border-blue-600 outline-none"
                autoFocus
              />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-blue-700 transition">
              Login to Dashboard 🚀
            </button>
          </form>
          <p className="text-[10px] text-center text-gray-400">Secured Private Financial Ledger v2.0</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans text-gray-900 relative">
      <div className="bg-blue-600 text-white p-4 shadow-md pt-8 flex justify-between items-center">
        <h1 className="text-xl font-bold">{lenderInfo.company_name || 'Debt Tracker'}</h1>
        <button onClick={() => setIsAuthenticated(false)} className="bg-blue-700 text-xs px-3 py-1.5 rounded-lg font-bold border border-blue-500">🔒 Logout</button>
      </div>

      <div className="p-4">
        
        {/* DASHBOARD TAB */}
        {activeTab === 'DASHBOARD' && (
          <div className="space-y-4">
            {loans.length === 0 ? (
              <div className="text-center text-gray-500 mt-10"><p>No active loans.</p></div>
            ) : (
              loans.map((loan) => {
                const progress = (loan.repaid / loan.totalAmount) * 100;
                const remaining = Math.max(0, loan.totalAmount - loan.repaid);
                return (
                  <div key={loan.id} className="bg-white p-4 rounded-xl shadow border border-gray-100 relative">
                    <div className="flex justify-between items-center mb-2">
                      <div>
                        <h3 className="font-bold text-lg">{loan.name}</h3>
                        <p className="text-xs text-gray-400">Principal: ₹{loan.principal.toFixed(2)} | Total: ₹{loan.totalAmount.toFixed(2)} {loan.pan ? `| PAN: ${loan.pan}` : ''}</p>
                      </div>
                      <a href={`tel:${loan.phone}`} className="bg-green-100 text-green-700 p-2 rounded-full text-xs font-bold">📞 Call</a>
                    </div>
                    
                    <div className="mb-4">
                      <div className="flex justify-between text-xs font-bold text-gray-600 mb-1">
                        <span className="text-green-600">₹{loan.repaid.toFixed(2)} Paid</span>
                        <span className="text-red-500">₹{remaining.toFixed(2)} Left</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(progress, 100)}%` }}></div>
                      </div>
                    </div>

                    <div className="flex gap-2 mb-2">
                      <button onClick={() => sendWhatsApp(loan.phone, loan.name, loan.emi, 'EMI')} className="flex-1 bg-green-500 text-white py-2 rounded text-xs font-bold">
                        Wa EMI (₹{loan.emi.toFixed(2)})
                      </button>
                      <button onClick={() => sendWhatsApp(loan.phone, loan.name, remaining, 'FULL')} className="flex-1 bg-blue-600 text-white py-2 rounded text-xs font-bold">
                        Wa Full (₹{remaining.toFixed(2)})
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => { setCurrentLoan(loan); setPaymentAmount(loan.emi.toString()); setDiscountAmount('0'); setShowModal(true); }}
                      className="w-full bg-indigo-50 text-indigo-700 border border-indigo-200 py-2 rounded text-sm font-bold mt-1"
                    >
                      👇 Record Payment / Foreclose
                    </button>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* BORROWERS DIRECTORY TAB */}
        {activeTab === 'BORROWERS' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold mb-2">Unique Borrowers Directory</h2>
            {borrowers.length === 0 ? (
              <p className="text-gray-500 text-sm">No borrower profiles found.</p>
            ) : (
              borrowers.map((b) => (
                <div key={b.id} onClick={() => setSelectedBorrower(b)} className="bg-white p-4 rounded-xl shadow border border-gray-100 cursor-pointer active:bg-gray-50">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-lg text-gray-800">{b.name}</h3>
                      <p className="text-xs text-gray-500">📱 {b.phone} {b.pan_number ? `| 💳 PAN: ${b.pan_number}` : ''}</p>
                    </div>
                    <span className="text-blue-600 font-bold text-sm">View Profile ➔</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === 'ANALYTICS' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl shadow border border-gray-100">
              <h2 className="text-xl font-bold mb-4 text-gray-800">📊 Profit & Loss (P&L)</h2>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-xs text-green-700 font-bold">Interest Earnings</p>
                  <p className="text-lg font-black text-green-800">+₹{totalInterestEarned.toFixed(2)}</p>
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg">
                  <p className="text-xs text-indigo-700 font-bold">Charges Earnings</p>
                  <p className="text-lg font-black text-indigo-800">+₹{totalChargesEarned.toFixed(2)}</p>
                </div>
              </div>
              <div className="bg-blue-600 text-white p-4 rounded-xl shadow">
                <p className="text-xs font-bold uppercase tracking-wider opacity-80">Net Business Profit</p>
                <p className="text-3xl font-black">₹{netProfit.toFixed(2)}</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow border border-gray-100">
              <h2 className="text-lg font-bold mb-3 text-gray-800">Portfolio Metrics</h2>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 font-bold">Total Lent</p>
                  <p className="text-lg font-black">₹{totalLent.toFixed(2)}</p>
                </div>
                <div className="bg-red-50 p-3 rounded-lg">
                  <p className="text-xs text-red-600 font-bold">Total Pending</p>
                  <p className="text-lg font-black">₹{totalPending.toFixed(2)}</p>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <p className="text-xs text-gray-500 font-bold">Total Recovered</p>
                    <p className="text-xl font-black text-gray-800">₹{totalRecovered.toFixed(2)}</p>
                  </div>
                  <p className="text-lg font-bold text-blue-600">{recoveryRate}% Recovery</p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.min(parseFloat(recoveryRate), 100)}%` }}></div>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow border border-gray-100">
              <h2 className="text-lg font-bold mb-4 text-gray-800">Full Transaction Log</h2>
              {txHistory.length === 0 ? (
                <p className="text-sm text-gray-500">No transactions recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {txHistory.map((tx, idx) => (
                    <div key={idx} className="flex justify-between items-center border-b pb-2">
                      <div>
                        <p className="font-bold text-sm">{tx.loans?.friends?.name || 'Customer'} <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${tx.type === 'DISBURSEMENT' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>{tx.type || 'REPAYMENT'}</span></p>
                        <p className="text-xs text-gray-400">{new Date(tx.payment_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                      </div>
                      <p className={`font-bold ${tx.type === 'DISBURSEMENT' ? 'text-red-600' : 'text-green-600'}`}>
                        {tx.type === 'DISBURSEMENT' ? '-' : '+'}₹{tx.amount_paid.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ADD LOAN TAB */}
        {activeTab === 'ADD' && (
          <div className="bg-white p-6 rounded-xl shadow space-y-3">
            <h2 className="text-xl font-bold mb-2">{existingFriendId ? 'Grant New Loan to Existing Customer' : 'New Loan Profile'}</h2>
            <button onClick={syncContact} className="w-full bg-indigo-100 text-indigo-700 font-bold py-2 rounded">📒 Sync Contacts</button>
            
            <input type="text" placeholder="Friend Name" value={name} onChange={e => setName(e.target.value)} className="w-full border p-3 rounded" />
            <input type="number" placeholder="Phone Number" value={phone} onChange={e => { setPhone(e.target.value); checkExistingCustomer(e.target.value, 'phone'); }} className="w-full border p-3 rounded" />
            <input type="text" placeholder="PAN Number (Optional)" value={panNumber} onChange={e => { setPanNumber(e.target.value.toUpperCase()); checkExistingCustomer(e.target.value.toUpperCase(), 'pan'); }} className="w-full border p-3 rounded uppercase" />
            
            <input type="number" placeholder="Principal Amount (₹)" value={amount} onChange={e => setAmount(e.target.value)} className="w-full border p-3 rounded" />
            <input type="number" placeholder="Duration (Months)" value={months} onChange={e => setMonths(e.target.value)} className="w-full border p-3 rounded" />
            
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Interest Rate (% Yearly)" value={interestRate} onChange={e => setInterestRate(e.target.value)} className="border p-3 rounded" />
              <select value={interestType} onChange={e => setInterestType(e.target.value)} className="border p-3 rounded bg-white">
                <option value="SI">Simple Interest (SI)</option>
                <option value="CI">Compound Interest (CI)</option>
              </select>
            </div>

            <input type="number" placeholder="Extra Charge / Processing Fee (₹)" value={extraCharges} onChange={e => setExtraCharges(e.target.value)} className="w-full border p-3 rounded" />

            <button onClick={saveLoan} className="w-full bg-blue-600 text-white font-bold py-3 rounded mt-2">Disburse Loan & Generate Sanction Letter</button>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'SETTINGS' && (
          <div className="bg-white p-6 rounded-xl shadow space-y-3">
            <h2 className="text-xl font-bold mb-4">Lender & Business Settings</h2>
            
            <label className="text-xs font-bold text-gray-500">Lender Name</label>
            <input type="text" placeholder="Lender Name" value={lenderInfo.name} onChange={e => setLenderInfo({...lenderInfo, name: e.target.value})} className="w-full border p-3 rounded" />
            
            <label className="text-xs font-bold text-gray-500">Company / Firm Name</label>
            <input type="text" placeholder="Company Name" value={lenderInfo.company} onChange={e => setLenderInfo({...lenderInfo, company: e.target.value})} className="w-full border p-3 rounded" />
            
            <label className="text-xs font-bold text-gray-500">Business Phone</label>
            <input type="number" placeholder="Phone" value={lenderInfo.phone} onChange={e => setLenderInfo({...lenderInfo, phone: e.target.value})} className="w-full border p-3 rounded" />
            
            <label className="text-xs font-bold text-gray-500">Business Address</label>
            <textarea placeholder="Address" value={lenderInfo.address} onChange={e => setLenderInfo({...lenderInfo, address: e.target.value})} className="w-full border p-3 rounded"></textarea>
            
            <label className="text-xs font-bold text-gray-500">Receiving UPI ID</label>
            <input type="text" placeholder="e.g. upi@ybl" value={lenderInfo.upi} onChange={e => setLenderInfo({...lenderInfo, upi: e.target.value})} className="w-full border p-3 rounded" />
            
            <button onClick={saveLenderSettings} className="w-full bg-black text-white font-bold py-3 rounded mt-2">Save Settings</button>
          </div>
        )}
      </div>

      {/* SANCTION LETTER PRINT MODAL */}
      {sanctionData && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4 text-xs">
            <div className="text-center border-b pb-3">
              <h2 className="text-lg font-black">{lenderInfo.company_name || 'FINANCIAL SERVICES'}</h2>
              <p className="text-gray-500">{lenderInfo.address || 'Registered Office, India'} | Ph: {lenderInfo.phone || 'N/A'}</p>
              <h3 className="font-bold text-md mt-2 uppercase tracking-wide bg-gray-100 py-1">Loan Sanction & Disbursal Letter</h3>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded">
              <p><strong>Borrower Name:</strong> {sanctionData.name}</p>
              <p><strong>Mobile:</strong> {sanctionData.phone}</p>
              <p><strong>PAN Number:</strong> {sanctionData.pan || 'N/A'}</p>
              <p><strong>Sanction Date:</strong> {new Date(sanctionData.date).toLocaleString('en-IN')}</p>
            </div>

            <div className="space-y-1.5 border-t border-b py-2">
              <p><strong>Principal Amount:</strong> ₹{sanctionData.p.toFixed(2)}</p>
              <p><strong>Loan Tenure:</strong> {sanctionData.nMonths} Months</p>
              <p><strong>Rate of Interest:</strong> {sanctionData.rYearly}% per annum ({sanctionData.interestType})</p>
              <p><strong>Processing / Charges:</strong> ₹{sanctionData.charges.toFixed(2)}</p>
              <p><strong>Total Repayable Amount:</strong> ₹{sanctionData.totalPayable.toFixed(2)}</p>
              <p className="text-blue-600 font-bold"><strong>Monthly EMI Amount:</strong> ₹{sanctionData.calculatedEmi}</p>
            </div>

            <div>
              <p className="font-bold mb-1 text-gray-700">DECLARATION & RETURN POLICIES:</p>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                1. The borrower declares that all information provided is true and correct.<br/>
                2. <strong>Mandatory Return Policy:</strong> The borrower agrees to repay the monthly EMI on or before the due date. Failure to do so will attract late penalty fees as per lender policies.<br/>
                3. The lender reserves the right to recall the entire loan amount in case of default or breach of terms.<br/>
                4. Pre-closure / Foreclosure is permitted as per the active terms agreed upon sanctioning.
              </p>
            </div>

            <div className="flex justify-between items-end pt-4 border-t">
              <div>
                <p className="font-bold">Authorized Signatory</p>
                <p className="text-gray-400">{lenderInfo.name}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-gray-800 text-white px-4 py-2 rounded font-bold">🖨️ Print Letter</button>
                <button onClick={() => setSanctionData(null)} className="bg-blue-600 text-white px-4 py-2 rounded font-bold">Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BORROWER PROFILE MODAL */}
      {selectedBorrower && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-xl">{selectedBorrower.name}</h3>
              <button onClick={() => setSelectedBorrower(null)} className="text-gray-500 font-bold text-lg">✕</button>
            </div>
            
            <div className="text-sm space-y-1 bg-gray-50 p-3 rounded-lg">
              <p><strong>Phone:</strong> {selectedBorrower.phone}</p>
              <p><strong>PAN Number:</strong> {selectedBorrower.pan_number || 'N/A'}</p>
              <p><strong>Joined:</strong> {new Date(selectedBorrower.created_at).toLocaleDateString('en-IN')}</p>
            </div>

            <h4 className="font-bold text-md text-gray-700">Loan History & Status:</h4>
            {selectedBorrower.loans && selectedBorrower.loans.length > 0 ? (
              <div className="space-y-2">
                {selectedBorrower.loans.map((l: any) => (
                  <div key={l.id} className="border p-3 rounded-lg text-xs space-y-1 bg-white">
                    <p><strong>Principal:</strong> ₹{parseFloat(l.principal_amount).toFixed(2)}</p>
                    <p><strong>Total (with Int):</strong> ₹{parseFloat(l.total_with_interest || l.principal_amount).toFixed(2)}</p>
                    <p><strong>Paid:</strong> ₹{parseFloat(l.total_repaid || 0).toFixed(2)}</p>
                    <p><strong>Status:</strong> <span className={l.status === 'ACTIVE' ? 'text-blue-600 font-bold' : 'text-green-600 font-bold'}>{l.status}</span></p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No loans recorded for this borrower.</p>
            )}

            <button 
              onClick={() => {
                setName(selectedBorrower.name);
                setPhone(selectedBorrower.phone);
                setPanNumber(selectedBorrower.pan_number || '');
                setExistingFriendId(selectedBorrower.id);
                setSelectedBorrower(null);
                setActiveTab('ADD');
              }}
              className="w-full bg-blue-600 text-white font-bold py-2 rounded mt-2"
            >
              ➕ Grant New Loan to this Customer
            </button>
          </div>
        </div>
      )}

      {/* PAYMENT & FORECLOSE MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-lg">Manage Payment: {currentLoan?.name}</h3>
            
            <div>
              <label className="text-xs font-bold text-gray-500">Record Regular EMI / Part Payment</label>
              <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full border p-3 rounded font-bold mt-1" />
              <button onClick={() => handleRecordPayment(false)} className="w-full bg-green-600 text-white font-bold py-2 rounded mt-2">Save EMI Payment</button>
            </div>

            <hr />

            <div>
              <label className="text-xs font-bold text-red-500">Foreclose Loan (Settlement with Discount)</label>
              <input type="number" placeholder="Discount Given (₹)" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} className="w-full border p-3 rounded font-bold mt-1" />
              <button onClick={() => handleRecordPayment(true)} className="w-full bg-red-600 text-white font-bold py-2 rounded mt-2">Foreclose & Close Loan</button>
            </div>

            <button onClick={() => setShowModal(false)} className="w-full bg-gray-200 text-gray-800 py-2 rounded font-bold">Cancel</button>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <div className="fixed bottom-0 w-full bg-white border-t flex justify-around p-3 shadow-lg text-[10px] font-bold z-40">
        <button onClick={() => setActiveTab('DASHBOARD')} className={`flex flex-col items-center ${activeTab === 'DASHBOARD' ? 'text-blue-600' : 'text-gray-400'}`}>
          <span className="text-base mb-0.5">📊</span> Home
        </button>
        <button onClick={() => setActiveTab('BORROWERS')} className={`flex flex-col items-center ${activeTab === 'BORROWERS' ? 'text-blue-600' : 'text-gray-400'}`}>
          <span className="text-base mb-0.5">👥</span> Borrowers
        </button>
        <button onClick={() => Analytics Tab} onClick={() => setActiveTab('ANALYTICS')} className={`flex flex-col items-center ${activeTab === 'ANALYTICS' ? 'text-blue-600' : 'text-gray-400'}`}>
          <span className="text-base mb-0.5">📈</span> P&L
        </button>
        <button onClick={() => setActiveTab('ADD')} className={`flex flex-col items-center ${activeTab === 'ADD' ? 'text-blue-600' : 'text-gray-400'}`}>
          <span className="text-base mb-0.5">➕</span> Add
        </button>
        <button onClick={() => setActiveTab('SETTINGS')} className={`flex flex-col items-center ${activeTab === 'SETTINGS' ? 'text-blue-600' : 'text-gray-400'}`}>
          <span className="text-base mb-0.5">⚙️</span> Settings
        </button>
      </div>
    </div>
  );
}
