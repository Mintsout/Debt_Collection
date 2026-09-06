'use client';
import { useState } from 'react';

export default function Home() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [interest, setInterest] = useState('');
  const [months, setMonths] = useState('');
  const [emi, setEmi] = useState<number | null>(null);

  // EMI Calculate करने का लॉजिक
  const calculateEMI = () => {
    const P = parseFloat(amount);
    const R = parseFloat(interest) / 12 / 100; // Monthly interest rate
    const N = parseFloat(months);

    if (P && R && N) {
      const emiValue = (P * R * Math.pow(1 + R, N)) / (Math.pow(1 + R, N) - 1);
      setEmi(Math.round(emiValue));
    } else if (P && N && !R) {
      // 0% interest case
      setEmi(Math.round(P / N));
    }
  };

  // WhatsApp पर मैसेज और UPI लिंक भेजने का लॉजिक
  const sendWhatsAppReminder = () => {
    // यहाँ अपना UPI ID डालें
    const myUPI = "yourname@bank"; 
    const upiLink = `upi://pay?pa=${myUPI}&pn=Sandeep&am=${emi}`;
    
    const message = `नमस्ते ${name},\n\nआपकी इस महीने की EMI (₹${emi}) देय (due) है। कृपया नीचे दिए गए लिंक से भुगतान करें:\n\n${upiLink}\n\nधन्यवाद!`;
    const whatsappUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center font-sans">
      <h1 className="text-3xl font-bold text-gray-800 mb-8 mt-10">Personal Debt Tracker</h1>
      
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Add New Loan & EMI</h2>
        
        <div className="space-y-4 text-black">
          <input type="text" placeholder="Friend's Name" className="w-full border p-3 rounded-lg" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="number" placeholder="Phone Number (Without +91)" className="w-full border p-3 rounded-lg" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input type="number" placeholder="Principal Amount (₹)" className="w-full border p-3 rounded-lg" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input type="number" placeholder="Interest Rate (% Yearly) - Optional" className="w-full border p-3 rounded-lg" value={interest} onChange={(e) => setInterest(e.target.value)} />
          <input type="number" placeholder="Duration (Months)" className="w-full border p-3 rounded-lg" value={months} onChange={(e) => setMonths(e.target.value)} />
          
          <button 
            onClick={calculateEMI}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition"
          >
            Calculate EMI
          </button>
        </div>

        {emi !== null && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg text-center">
            <p className="text-sm text-gray-600">Monthly EMI</p>
            <p className="text-3xl font-bold text-green-700 mb-4">₹{emi}</p>
            
            <button 
              onClick={sendWhatsAppReminder}
              className="w-full bg-green-500 text-white font-bold py-3 rounded-lg hover:bg-green-600 transition flex justify-center items-center gap-2"
            >
              <span>Send WhatsApp Reminder</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

