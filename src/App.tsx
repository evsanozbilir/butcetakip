import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Calendar, 
  User as UserIcon,
  ChevronDown,
  PieChart as PieChartIcon,
  CreditCard,
  Banknote,
  Loader2,
  ArrowRight,
  RefreshCw,
  Trophy,
  Heart,
  Home
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachWeekOfInterval, 
  isSameWeek, 
  parse, 
  isWithinInterval,
  getWeekOfMonth,
  startOfWeek,
  endOfWeek,
  differenceInDays,
  addDays
} from 'date-fns';
import { tr } from 'date-fns/locale';
import { cn, formatCurrency } from './lib/utils';
import { fetchEntries, fetchRates, saveEntry, Transaction, ExchangeRates, Filter } from './services/api';

// --- CONFIG ---
const USERS = ["Evşan", "Mahmut"] as const;
const ENTRY_TYPES = ["Gelir", "Gider", "Yatırım"] as const;
const PAYMENT_METHODS = ["Kredi Kartı", "Nakit"] as const;
const PAYMENT_TYPES = ["Tek Çekim", "Taksit", "Kredi Kartı Borç Ödemesi"] as const;

const CATEGORIES: Record<string, string[]> = {
  Gelir: ["Maaş", "Diğer"],
  Gider: [
    "Market", "Faturalar", "Kira/Aidat", "Dışarıda Yemek", "Ulaşım", 
    "Giyim", "Abonelikler", "Sağlık", "Kozmetik", 
    "Kişisel Bakım", "Ev Eşyaları", "Düğün Süreci Giderleri", 
    "Eğlence", "Hediye", "Dışarıda Kahve", "Akaryakıt", "Kredi Kartı Ödemesi", "Diğer"
  ],
  Yatırım: ["Altın Gram", "Gümüş Gram", "TL", "USD", "Euro"]
};

const CURRENCIES: Record<string, string> = {
  "Altın Gram": "XAU",
  "Gram Altın": "XAU",
  "Gümüş Gram": "XAG",
  "Gram Gümüş": "XAG",
  "TL": "TRY",
  "USD": "USD",
  "Euro": "EUR",
  "Default": "TRY"
};

const COLORS = ['#6366f1', '#14b8a6', '#f43f5e', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#fbbf24', '#2dd4bf'];

// --- UTILS ---
// Flexible date parsing for DD/MM/YYYY or YYYY-MM-DD
const parseEntryDate = (dateStr: string) => {
  if (!dateStr) return null;
  
  // 1. Try strict ISO format (YYYY-MM-DD) - Most reliable
  if (dateStr.includes('-')) {
    const [y, m, d] = dateStr.split('-').map(Number);
    // Use local time construction to avoid UTC shift
    const date = new Date(y, m - 1, d);
    if (!isNaN(date.getTime())) return date;
  }

  // 2. Try Turkish format DD/MM/YYYY
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) return date;
    }
  }

  // 3. Last resort fallback
  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? null : fallback;
};

// Helper for case-insensitive name matching
const isUserMatch = (name: string, target: string) => 
  (name || "").toLowerCase().trim() === (target || "").toLowerCase().trim();

const parseAmount = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).replace(/\s/g, '');
  // Turkish format check: 1.234,56
  if (str.includes(',') && str.includes('.')) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // Decimal comma: 1234,56
  if (str.includes(',')) {
    return parseFloat(str.replace(',', '.')) || 0;
  }
  return parseFloat(str) || 0;
};

// --- COMPONENTS ---

const Card = ({ children, title, className, icon: Icon, span = "col-span-12 lg:col-span-3" }: any) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={cn(
      "bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col gap-3 transition-all hover:shadow-md h-full",
      span,
      className
    )}
  >
    <div className="flex items-center justify-between">
      <h3 className="bento-title-caps flex items-center gap-2">
        {Icon && <Icon size={14} className="text-slate-400" />}
        {title}
      </h3>
    </div>
    {children}
  </motion.div>
);

const WeeklyView = ({ user, entries, currentMonth, weeklyLimit = 5000 }: any) => {
  // Logic to calculate custom blocks (Monday-Sunday aligned)
  const generateBlocks = (month: Date) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const blocks: { start: Date; end: Date; days: number }[] = [];
    
    let current = monthStart;
    while (current <= monthEnd) {
      // End of this block is the next Sunday, or end of month
      let blockEnd = endOfWeek(current, { weekStartsOn: 1 }); // Sunday
      if (blockEnd > monthEnd) blockEnd = monthEnd;
      
      const dayDiff = differenceInDays(blockEnd, current) + 1;
      blocks.push({ start: current, end: blockEnd, days: dayDiff });
      current = addDays(blockEnd, 1);
    }
    return blocks;
  };

  const blocks = generateBlocks(currentMonth);
  const [activeWeekIdx, setActiveWeekIdx] = useState(() => {
    const today = new Date();
    if (today.getMonth() !== currentMonth.getMonth() || today.getFullYear() !== currentMonth.getFullYear()) return 0;
    const idx = blocks.findIndex(b => today >= b.start && today <= b.end);
    return idx === -1 ? 0 : idx;
  });

  // --- INSTALLMENT BURDEN CALCULATION ---
  // Sum of all installments for this specific user in the specific currentMonth
  const monthlyInstallments = entries.filter((e: Transaction) => {
    const d = parseEntryDate(e.date);
    return (
      d && 
      d.getMonth() === currentMonth.getMonth() && 
      d.getFullYear() === currentMonth.getFullYear() &&
      isUserMatch(e.user, user) &&
      e.paymentType === 'Taksit' &&
      e.type === 'Gider'
    );
  }).reduce((sum: number, e: Transaction) => sum + parseAmount(e.amount), 0);

  const weeklyInstallmentBurden = monthlyInstallments / blocks.length;
  const baseWeeklyLimit = weeklyLimit - weeklyInstallmentBurden;
  const dailyRate = baseWeeklyLimit / 7;

  // Pre-calculate all blocks data with proportional limits and rollover
  let cumulativeRollover = 0;
  const processedWeeks = blocks.map((block, idx) => {
    // Proportional Limit: DailyRate * Days in this specific block
    const proportionalBaseLimit = dailyRate * block.days;
    
    // Strict Filtering: User segregation + Exclude "Kredi Kartı Ödemesi" category + Exclude Taksit (they are the burden)
    const weekEntries = entries.filter((e: Transaction) => {
      const d = parseEntryDate(e.date);
      if (!d) return false;
      return (
        isUserMatch(e.user, user) && 
        (e.type === 'Gider' || e.type === 'Sabit Gider') &&
        e.category !== 'Kredi Kartı Ödemesi' &&
        e.paymentType !== 'Taksit' && // Exclude installments from weekly spending as they are pre-deducted
        d >= block.start && d <= block.end
      );
    });

    const spentCash = weekEntries.filter((e: Transaction) => e.paymentMethod === 'Nakit').reduce((sum: number, e: Transaction) => sum + parseAmount(e.amount), 0);
    const spentCard = weekEntries.filter((e: Transaction) => e.paymentMethod === 'Kredi Kartı').reduce((sum: number, e: Transaction) => sum + parseAmount(e.amount), 0);
    const totalSpent = spentCash + spentCard;

    const rolloverForThisWeek = cumulativeRollover;
    const totalLimitForThisWeek = proportionalBaseLimit + rolloverForThisWeek;
    const remaining = totalLimitForThisWeek - totalSpent;

    // Update rollover for NEXT week - Negative carryover allowed as "debt"
    cumulativeRollover = remaining;

    const catData: Record<string, number> = weekEntries.reduce((acc: Record<string, number>, e: Transaction) => {
      acc[e.category] = (acc[e.category] || 0) + parseAmount(e.amount);
      return acc;
    }, {});

    const chartData = Object.entries(catData)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      weekNum: idx + 1,
      spent: totalSpent,
      spentCash,
      spentCard,
      limit: totalLimitForThisWeek,
      proportionalBase: proportionalBaseLimit,
      rollover: rolloverForThisWeek,
      chartData,
      weekRange: `${format(block.start, 'd MMM', { locale: tr })} - ${format(block.end, 'd MMM', { locale: tr })}`,
      days: block.days
    };
  });

  const activeData = processedWeeks[activeWeekIdx] || processedWeeks[0];
  const progress = activeData.limit <= 0 
    ? (activeData.spent >= 0 ? 100 : 0) 
    : Math.min(100, (activeData.spent / activeData.limit) * 100);
  const userColor = user === 'Mahmut' ? '#3b82f6' : '#c026d3';

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Week Tabs Navigation */}
      <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
        {processedWeeks.map((w, idx) => (
          <button
            key={idx}
            onClick={() => setActiveWeekIdx(idx)}
            className={cn(
              "flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all",
              activeWeekIdx === idx 
                ? "bg-white text-indigo-600 shadow-sm border border-slate-200" 
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            {w.weekNum}. HAFTA
          </button>
        ))}
      </div>

      <div className="flex justify-between items-center h-6">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {activeData.weekRange}
        </div>
        <div className={cn(
          "badge px-2.5 py-1 rounded-full text-[10px] font-black border transition-colors",
          activeData.rollover >= 0 
            ? "bg-indigo-50 text-indigo-700 border-indigo-100" 
            : "bg-red-50 text-red-700 border-red-100"
        )}>
          DEVREDEN: {activeData.rollover >= 0 ? '+' : '-'}{formatCurrency(Math.abs(activeData.rollover)).split(',')[0]} ₺
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 items-center flex-1">
        <div className="w-full sm:w-32 h-32 flex-shrink-0 relative">
          {activeData.chartData.length > 0 ? (
            <div className="w-full h-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={activeData.chartData}
                    innerRadius="65%"
                    outerRadius="90%"
                    paddingAngle={5}
                    dataKey="value"
                    animationDuration={1000}
                    stroke="none"
                  >
                    {activeData.chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }}
                    formatter={(value: number) => [`${formatCurrency(value).split(',')[0]} ₺`, 'Tutar']}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Empty Center as requested */}
            </div>
          ) : (
            <div className="w-full h-full rounded-full border-4 border-slate-100 bg-white flex flex-col items-center justify-center text-center p-2 relative">
              <div className="absolute inset-0 rounded-full border-4 border-dashed border-slate-50 opacity-50" />
              <span className="text-[9px] font-bold text-slate-400 uppercase leading-none relative z-10">Harcanan</span>
              <span className="text-sm font-black text-slate-300 relative z-10">₺0</span>
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3">
          <div>
            <div className="flex justify-between items-center mb-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Harcama / Orantılı Limit</p>
              <span className="text-[9px] font-medium text-indigo-400 bg-indigo-50 px-1.5 py-0.5 rounded">
                {activeData.days} Günlük
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-800 tracking-tight">
                {formatCurrency(activeData.spent).split(',')[0]}
              </span>
              <span className="text-sm font-bold text-slate-400">
                / {formatCurrency(activeData.limit).split(',')[0]} ₺
              </span>
            </div>
            {weeklyInstallmentBurden > 0 && (
              <p className="text-[9px] font-bold text-rose-500 mt-0.5">
                Taksitlerden düşüldü: -{formatCurrency(weeklyInstallmentBurden).split(',')[0]} ₺
              </p>
            )}
          </div>
          
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full rounded-full"
              style={{ 
                backgroundColor: progress > 90 ? '#ef4444' : userColor,
                boxShadow: `0 0 10px ${progress > 90 ? '#ef4444' : userColor}40`
              }}
            />
          </div>

          {/* Payment Method Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase mb-0.5">
                <Banknote size={10} className="text-emerald-500" /> Nakit
              </div>
              <p className="text-xs font-bold text-slate-700">{formatCurrency(activeData.spentCash).split(',')[0]} ₺</p>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase mb-0.5">
                <CreditCard size={10} className="text-blue-500" /> Kart
              </div>
              <p className="text-xs font-bold text-slate-700">{formatCurrency(activeData.spentCard).split(',')[0]} ₺</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap pt-3 border-t border-slate-50 mt-auto overflow-hidden">
        {activeData.chartData.length > 0 ? (
          activeData.chartData.slice(0, 6).map((d, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100/50 animate-in fade-in slide-in-from-bottom-1" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-[10px] font-bold text-slate-600 truncate max-w-[80px]">{d.name}</span>
              <span className="text-[9px] font-medium text-slate-400">%{activeData.spent > 0 ? Math.round((d.value / activeData.spent) * 100) : 0}</span>
            </div>
          ))
        ) : (
          <div className="text-[10px] font-medium text-slate-400 italic">Kategori dağılımı için harcama yapın.</div>
        )}
      </div>
    </div>
  );
};

const EntryForm = ({ onComplete }: { onComplete: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    currency: 'TRY',
    type: 'Gider' as Transaction['type'],
    user: 'Mahmut' as Transaction['user'],
    paymentMethod: 'Kredi Kartı' as Transaction['paymentMethod'],
    paymentType: 'Tek Çekim' as Transaction['paymentType'],
    category: CATEGORIES['Gider'][0],
    description: '',
    bank: '',
    installments: '1'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || parseFloat(formData.amount) <= 0) return alert("Lütfen geçerli bir tutar girin");
    
    setLoading(true);
    try {
      let finalCurrency = 'TRY';
      let finalPaymentMethod = formData.paymentMethod;
      let finalPaymentType = formData.paymentType;
      
      if (formData.type === 'Gelir') {
        finalCurrency = 'TRY';
        finalPaymentMethod = 'Nakit';
        finalPaymentType = 'Tek Çekim';
      } else if (formData.type === 'Yatırım') {
        finalCurrency = CURRENCIES[formData.category] || 'TRY';
        finalPaymentMethod = 'Nakit';
        finalPaymentType = 'Tek Çekim';
      }

      // Send strictly as YYYY-MM-DD (ISO 8601)
      const finalDate = formData.date; // Use the value from <input type="date"> directly

      const payload = {
        ...formData,
        date: finalDate,
        amount: parseFloat(formData.amount),
        currency: finalCurrency,
        paymentMethod: finalPaymentMethod,
        paymentType: finalPaymentType,
        installments: parseInt(formData.installments) || 1
      };

      await saveEntry(payload as any);
      onComplete();
    } catch (err) {
      alert("Hata oluştu, lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="col-span-full space-y-2">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">İşlem Tarihi</label>
        <input
          type="date"
          required
          value={formData.date}
          onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
          className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kullanıcı</label>
        <div className="flex gap-2">
          {USERS.map(u => (
            <button
              key={u}
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, user: u }))}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl border text-sm font-semibold transition-all active:scale-95",
                formData.user === u 
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100" 
                  : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
              )}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Giriş Türü</label>
        <select
          value={formData.type}
          onChange={(e) => {
            const newType = e.target.value as any;
            setFormData(prev => ({ 
              ...prev, 
              type: newType, 
              category: CATEGORIES[newType][0],
              paymentType: 'Tek Çekim',
              installments: '1'
            }));
          }}
          className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          {ENTRY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kategori</label>
        <select
          value={formData.category}
          onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
          className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          {CATEGORIES[formData.type].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tutar</label>
        <div className="relative">
          <input
            type="number"
            step="any"
            required
            value={formData.amount}
            onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="0.00"
          />
          <span className="absolute right-4 top-2.5 text-slate-400 text-sm font-bold">
            {formData.type === 'Yatırım' ? CURRENCIES[formData.category] || 'TRY' : 'TRY'}
          </span>
        </div>
      </div>

      {formData.type === 'Gider' && (
        <>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ödeme Yöntemi</label>
            <select
              value={formData.paymentMethod}
              onChange={(e) => setFormData(prev => ({ ...prev, paymentMethod: e.target.value as any }))}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-medium"
            >
              <option value="Kredi Kartı">Kredi Kartı</option>
              <option value="Nakit">Nakit</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ödeme Türü</label>
            <select
              value={formData.paymentType}
              onChange={(e) => setFormData(prev => ({ ...prev, paymentType: e.target.value as any }))}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-medium"
            >
              <option value="Tek Çekim">Tek Çekim</option>
              <option value="Taksit">Taksit</option>
            </select>
          </div>

          {formData.paymentType === 'Taksit' && (
            <div className="space-y-2 animate-in slide-in-from-top-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Taksit Sayısı</label>
              <input
                type="number"
                min="2"
                max="36"
                value={formData.installments}
                onChange={(e) => setFormData(prev => ({ ...prev, installments: e.target.value }))}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-bold"
              />
            </div>
          )}
        </>
      )}

      {formData.type === 'Yatırım' && (
        <div className="space-y-2 animate-in slide-in-from-top-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Banka Adı</label>
          <input
            type="text"
            required
            value={formData.bank}
            onChange={(e) => setFormData(prev => ({ ...prev, bank: e.target.value }))}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-medium placeholder:text-slate-300"
            placeholder="Örn: Garanti, Binance..."
          />
        </div>
      )}

      <div className="col-span-full space-y-2">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Açıklama (Opsiyonel)</label>
        <input
          type="text"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          className="w-full py-3 px-4 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
          placeholder="İşlem detayı yazın..."
        />
      </div>

      <div className="col-span-full">
        <button
          disabled={loading}
          className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 disabled:bg-indigo-300 active:scale-95"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
          İşlemi Tabloya Kaydet
        </button>
      </div>
    </form>
  );
};

export default function App() {
  const [entries, setEntries] = useState<Transaction[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [rates, setRates] = useState<ExchangeRates>({});
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [configMissing, setConfigMissing] = useState(false);
  const [currentMonth] = useState(new Date());

  const loadData = async (refresh = false) => {
    if (refresh) setIsSyncing(true);
    else setLoading(true);
    
    try {
      const [res, r] = await Promise.all([fetchEntries(refresh), fetchRates()]);
      const fetchedEntries = res.entries || [];
      const fetchedFilters = res.filters || [];
      
      console.log(`Total rows fetched from Dataset: ${fetchedEntries.length}`);
      console.log(`Total rows fetched from Filters: ${fetchedFilters.length}`);
      
      setEntries(fetchedEntries);
      setFilters(fetchedFilters);
      setConfigMissing(res.configMissing);
      setRates(r);
    } catch (err) {
      console.error("loadData Error:", err);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 size={48} className="text-indigo-600 animate-spin" />
        <p className="text-slate-400 font-medium animate-pulse">Veriler yükleniyor...</p>
      </div>
    </div>
  );

  // --- LOGIC CALCULATIONS ---
  const currentMonthEntries = entries.filter(e => {
    const d = parseEntryDate(e.date);
    if (!d) return false;
    return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
  });

  console.log(`Entries matching current month/year: ${currentMonthEntries.length}`);

  // 1. Total Income: Base Salary (Filters) + Manual Gelir (Entries)
  const baseSalaryTotal = filters
    .filter(f => f.name === 'MonthlySalary')
    .reduce((sum, f) => sum + parseAmount(f.value), 0);

  const manualIncome = currentMonthEntries
    .filter(e => e.type === 'Gelir')
    .reduce((sum, e) => sum + parseAmount(e.amount), 0);

  const totalIncome = baseSalaryTotal + manualIncome;

  // 2. Total Fixed: Sum of all FixedExpense from Filters
  const totalFixed = filters
    .filter(f => f.name === 'FixedExpense')
    .reduce((sum, f) => sum + parseAmount(f.value), 0);

  // 3. Variable Expenses Breakdown
  const totalCashVariable = currentMonthEntries
    .filter(e => (e.type === 'Gider' || e.type === 'Sabit Gider') && e.category !== 'Kredi Kartı Ödemesi' && e.paymentMethod === 'Nakit')
    .reduce((sum, e) => sum + parseAmount(e.amount), 0);

  const currentCCSpending = currentMonthEntries
    .filter(e => (e.type === 'Gider' || e.type === 'Sabit Gider') && e.category !== 'Kredi Kartı Ödemesi' && e.paymentMethod === 'Kredi Kartı')
    .reduce((sum, e) => sum + parseAmount(e.amount), 0);

  // CC Debt logic
  const totalCCDebtPayment = currentMonthEntries
    .filter(e => e.category === 'Kredi Kartı Ödemesi')
    .reduce((sum, e) => sum + parseAmount(e.amount), 0);

  const remainingBalance = totalIncome - totalFixed - totalCashVariable - totalCCDebtPayment;

  // Future Outlook logic
  const monthEnd = endOfMonth(currentMonth);
  const futureLiabilities = entries
    .filter(e => {
      const d = parseEntryDate(e.date);
      return d && d > monthEnd;
    })
    .reduce((sum, e) => sum + parseAmount(e.amount), 0);

  // Dynamic Projection Logic
  const getWeeklyLimitValue = (user: string) => {
    const lim = filters.find(f => f.name === 'WeeklyLimit' && isUserMatch(f.user, user))?.value;
    return parseAmount(lim);
  };
  const totalWL = getWeeklyLimitValue("Evşan") + getWeeklyLimitValue("Mahmut");
  
  const today = new Date();
  const currentMonthStart = startOfMonth(currentMonth);
  const currentMonthEnd = endOfMonth(currentMonth);
  const daysInMonth = differenceInDays(currentMonthEnd, currentMonthStart) + 1;
  const currentDay = today.getDate();
  
  let daysRemaining = 0;
  if (today.getMonth() === currentMonth.getMonth() && today.getFullYear() === currentMonth.getFullYear()) {
    daysRemaining = Math.max(0, (daysInMonth - currentDay) + 1);
  } else if (today < currentMonthStart) {
    daysRemaining = daysInMonth;
  } else {
    daysRemaining = 0;
  }

  const projectedSpendingRemaining = (totalWL / 7) * daysRemaining;
  const actualVarSpent = totalCashVariable + currentCCSpending;
  
  // Revised Projection Logic based on User Feedback
  const estimatedTotalLoad = totalFixed + actualVarSpent + projectedSpendingRemaining + futureLiabilities;
  const projectedSavings = baseSalaryTotal - estimatedTotalLoad;

  const getUserMonthlyStats = (user: string) => {
    // Salary components for user
    const userBaseSalary = filters
      .filter(f => f.name === 'MonthlySalary' && isUserMatch(f.user, user))
      .reduce((sum, f) => sum + parseAmount(f.value), 0);
    
    const userManualIncome = currentMonthEntries
      .filter(e => isUserMatch(e.user, user) && e.type === 'Gelir')
      .reduce((sum, e) => sum + parseAmount(e.amount), 0);

    const incomeTotal = userBaseSalary + userManualIncome;

    const userEntries = currentMonthEntries.filter(e => 
      isUserMatch(e.user, user) && 
      (e.type === 'Gider' || e.type === 'Sabit Gider') &&
      e.category !== 'Kredi Kartı Ödemesi'
    );
    const totalSpent = userEntries.reduce((sum, e) => sum + parseAmount(e.amount), 0);
    
    const userFixed = filters
      .filter(f => f.name === 'FixedExpense' && isUserMatch(f.user, user))
      .reduce((sum, f) => sum + parseAmount(f.value), 0);

    const cc = userEntries.filter(e => e.paymentMethod === 'Kredi Kartı').reduce((sum, e) => sum + parseAmount(e.amount), 0);
    const cash = userEntries.filter(e => e.paymentMethod === 'Nakit').reduce((sum, e) => sum + parseAmount(e.amount), 0);
    
    const investmentEq = currentMonthEntries
      .filter(e => isUserMatch(e.user, user) && e.type === 'Yatırım')
      .reduce((sum, e) => {
        const currencyKey = CURRENCIES[e.category] || e.currency;
        const rate = rates[currencyKey] || 1;
        return sum + (parseAmount(e.amount) * rate);
      }, 0);

    console.log(`Rows for ${user}: Manual Income=${currentMonthEntries.filter(e => isUserMatch(e.user, user) && e.type === 'Gelir').length}, Expenses=${userEntries.length}`);

    return { totalSpent, userFixed, incomeTotal, cc, cash, investmentEq };
  };

  const mahmutStats = getUserMonthlyStats("Mahmut");
  const evsanStats = getUserMonthlyStats("Evşan");

  // --- NEW INCOME AGGREGATION LOGIC ---
  const getAggregatedIncomes = () => {
    const incomeMap = new Map<string, { user: string; category: string; amount: number }>();

    // 1. From Filters (MonthlySalary)
    filters
      .filter(f => f.name === 'MonthlySalary')
      .forEach(f => {
        const category = 'Maaş';
        const key = `${f.user}-${category}`;
        const existing = incomeMap.get(key) || { user: f.user, category, amount: 0 };
        existing.amount += parseAmount(f.value);
        incomeMap.set(key, existing);
      });

    // 2. From Dataset (Gelir)
    currentMonthEntries
      .filter(e => e.type === 'Gelir')
      .forEach(e => {
        const key = `${e.user}-${e.category}`;
        const existing = incomeMap.get(key) || { user: e.user, category: e.category, amount: 0 };
        existing.amount += parseAmount(e.amount);
        incomeMap.set(key, existing);
      });

    return Array.from(incomeMap.values())
      .filter(inc => inc.amount > 0)
      .sort((a, b) => {
        // Sort by user (Evşan first, then Mahmut)
        if (a.user !== b.user) {
          return a.user === "Evşan" ? -1 : 1;
        }
        // Then by category
        return a.category.localeCompare(b.category);
      });
  };

  const aggregatedIncomes = getAggregatedIncomes();

  // Helper to get weekly limit from filters
  const getWeeklyLimit = (user: string) => {
    return filters.find(f => f.name === 'WeeklyLimit' && isUserMatch(f.user, user))?.value || 5000;
  };

  // --- STRATEGIC EXPENSE METRICS ---
  const categoryTotals: Record<string, number> = entries
    .filter(e => (e.type === 'Gider' || e.type === 'Sabit Gider') && e.category !== 'Kredi Kartı Ödemesi' && e.type !== 'Yatırım')
    .reduce((acc: Record<string, number>, e: Transaction) => {
      acc[e.category] = (acc[e.category] || 0) + parseAmount(e.amount);
      return acc;
    }, {});

  const topCategoryEntry = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])[0] || ["—", 0];
  
  const weddingSpent = entries
    .filter(e => e.category === 'Düğün Süreci Giderleri')
    .reduce((sum, e) => sum + parseAmount(e.amount), 0);

  const homeSpent = entries
    .filter(e => e.category === 'Ev Eşyaları')
    .reduce((sum, e) => sum + parseAmount(e.amount), 0);

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-slate-900 pb-12 p-2 md:p-6">
      {/* SETUP WARNING */}
      {configMissing && (
        <div className="max-w-[1280px] mx-auto mb-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-800 shadow-sm">
            <h3 className="font-bold flex items-center gap-2 mb-2">
              <span className="bg-amber-100 p-1 rounded">⚠️</span> Kurulum Gerekli
            </h3>
            <p className="text-sm opacity-90 mb-4">Google Sheets entegrasyonu henüz tamamlanmadı. Lütfen aşağıdaki adımları takip edin:</p>
            <ol className="text-sm space-y-2 list-decimal list-inside opacity-80">
              <li>Google Cloud Console'dan bir <b>Service Account</b> oluşturun ve JSON anahtarını indirin.</li>
              <li>Secrets paneline şunları ekleyin: <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_EMAIL</code>, <code className="bg-amber-100 px-1 rounded">GOOGLE_PRIVATE_KEY</code>, <code className="bg-amber-100 px-1 rounded">SPREADSHEET_ID</code></li>
              <li>Spreadsheet'inizi servis hesabının e-posta adresiyle paylaşın.</li>
            </ol>
          </div>
        </div>
      )}

      {/* BENTO HEADER */}
      <div className="max-w-[1280px] mx-auto grid grid-cols-12 gap-4 mb-4">
        <div className="col-span-12 bg-white rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between border border-slate-200 shadow-sm gap-4">
          <div>
            <h1 className="text-xl font-extrabold flex items-center gap-3">
              <span className="text-indigo-600 flex items-center gap-1">
                <Wallet size={24} /> DualFinance
              </span>
              <span className="text-slate-400 font-normal">/ {format(currentMonth, 'MMMM yyyy', { locale: tr })}</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => loadData(true)}
              disabled={isSyncing}
              className="p-2.5 bg-slate-50 text-slate-400 rounded-xl border border-slate-200 hover:bg-white hover:text-indigo-600 hover:border-indigo-200 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              title="Verileri Yenile"
            >
              <RefreshCw size={18} className={cn(isSyncing && "animate-spin")} />
              {isSyncing && <span className="text-[10px] font-bold uppercase tracking-tight hidden md:inline">Eşitleniyor</span>}
            </button>
            <button 
              onClick={() => setShowAdd(!showAdd)}
              className="bg-indigo-600 text-white flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-100 transition-transform active:scale-95"
            >
              <Plus size={18} className={cn("transition-transform", showAdd && "rotate-45")} />
              <span className="hidden sm:inline">Yeni Kayıt</span>
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-[1280px] mx-auto grid grid-cols-12 gap-4">
        
        {/* ADD ENTRY PANEL */}
        <AnimatePresence>
          {showAdd && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="col-span-12 overflow-hidden"
            >
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 mb-4">
                <h2 className="text-lg font-bold mb-6 flex items-center gap-2">Yeni İşlem Ekle</h2>
                <EntryForm onComplete={() => { setShowAdd(false); loadData(true); }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* BOX 1: INCOME */}
        <Card title="Aylık Toplam Gelir" className="lg:row-span-1 flex flex-col justify-center py-4">
          <p className="bento-amount-lg mt-0">
            {formatCurrency(totalIncome).split(',')[0]} <span className="text-sm font-medium text-slate-400">₺</span>
          </p>
        </Card>

        {/* BOX 3: MAIN BALANCE */}
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="col-span-12 lg:col-span-6 lg:row-span-1 bg-[#0f172a] rounded-3xl p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-4 relative overflow-hidden group min-h-[100px]"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] -mr-32 -mt-32 transition-all group-hover:bg-indigo-500/20" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 blur-[100px] -ml-32 -mb-32 transition-all group-hover:bg-emerald-500/20" />
          
          <div className="text-left relative z-10">
            <p className="bento-title-caps text-slate-500 mb-1">Güncel Kalan Nakit Akışı</p>
            <h2 className="text-4xl font-black tracking-tighter leading-none flex items-baseline gap-2">
              {formatCurrency(remainingBalance).split(',')[0]} 
              <span className="text-lg text-slate-600 font-bold">₺</span>
            </h2>
          </div>

          <div className="flex gap-2 relative z-10 shrink-0">
            <span className={cn(
              "badge px-3 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider backdrop-blur-md",
              remainingBalance >= 0 
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                : "bg-red-500/10 text-red-400 border-red-500/20"
            )}>
              {remainingBalance >= 0 ? "● Likidite Pozitif" : "● Bütçe Açığı"}
            </span>
          </div>
        </motion.div>

        {/* BOX 2: FIXED EXPENSES */}
        <Card title="Toplam Sabit Giderler" className="lg:row-span-1 flex flex-col justify-center py-4">
          <p className="bento-amount-lg mt-0">
            {formatCurrency(totalFixed).split(',')[0]} <span className="text-sm font-medium text-slate-400">₺</span>
          </p>
        </Card>

        {/* BOX 4 & 6: WEEKLY VIEWS */}
        <Card title="Mahmut - Haftalık Görünüm" className="col-span-12 lg:col-span-6 lg:row-span-2" icon={Calendar}>
          <WeeklyView user="Mahmut" entries={entries} currentMonth={currentMonth} rates={rates} weeklyLimit={getWeeklyLimit("Mahmut")} />
        </Card>
 
        <Card title="Evşan - Haftalık Görünüm" className="col-span-12 lg:col-span-6 lg:row-span-2" icon={Calendar}>
          <WeeklyView user="Evşan" entries={entries} currentMonth={currentMonth} rates={rates} weeklyLimit={getWeeklyLimit("Evşan")} />
        </Card>
 
        {/* BOX 5 & 7: SUMMARIES */}
        <Card title="Mahmut - Aylık Özet" className="col-span-12 lg:col-span-6 lg:row-span-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 h-full items-center py-2">
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-indigo-600">
                <CreditCard size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Kredi Kartı Harcaması</span>
              </div>
              <p className="text-2xl font-black text-slate-800">
                {formatCurrency(mahmutStats.cc).split(',')[0]} <span className="text-sm font-bold text-slate-400">₺</span>
              </p>
            </div>
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-emerald-600">
                <Banknote size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nakit Harcama</span>
              </div>
              <p className="text-2xl font-black text-slate-800">
                {formatCurrency(mahmutStats.cash).split(',')[0]} <span className="text-sm font-bold text-slate-400">₺</span>
              </p>
            </div>
          </div>
        </Card>
 
        <Card title="Evşan - Aylık Özet" className="col-span-12 lg:col-span-6 lg:row-span-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 h-full items-center py-2">
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-indigo-600">
                <CreditCard size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Kredi Kartı Harcaması</span>
              </div>
              <p className="text-2xl font-black text-slate-800">
                {formatCurrency(evsanStats.cc).split(',')[0]} <span className="text-sm font-bold text-slate-400">₺</span>
              </p>
            </div>
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-emerald-600">
                <Banknote size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nakit Harcama</span>
              </div>
              <p className="text-2xl font-black text-slate-800">
                {formatCurrency(evsanStats.cash).split(',')[0]} <span className="text-sm font-bold text-slate-400">₺</span>
              </p>
            </div>
          </div>
        </Card>

        {/* BOX 8: FUTURE OUTLOOK (Moved to bottom) */}
        <Card title="Gelecek Ay Yükümlülükleri (Projeksiyon)" className="lg:col-span-12 lg:row-span-1 bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none shadow-xl" icon={TrendingDown}>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 py-2">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aylık Sabit Gelir</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-emerald-400">{formatCurrency(baseSalaryTotal).split(',')[0]}</span>
                <span className="text-sm font-bold text-slate-500">₺</span>
              </div>
              <p className="text-[9px] font-medium text-slate-500">Sadece Maaşlar</p>
            </div>
            
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sabit Giderler</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-300">{formatCurrency(totalFixed).split(',')[0]}</span>
                <span className="text-sm font-bold text-slate-500">₺</span>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Kalan Günler Planlanan Harcama</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-orange-400">{formatCurrency(projectedSpendingRemaining).split(',')[0]}</span>
                <span className="text-sm font-bold text-slate-500">₺</span>
              </div>
              <p className="text-[9px] font-medium text-slate-500">{daysRemaining} Gün Kaldı</p>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Mevcut Kart Harcaması</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-indigo-400">{formatCurrency(currentCCSpending).split(',')[0]}</span>
                <span className="text-sm font-bold text-slate-500">₺</span>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Gelecek Taksitler</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-rose-400">{formatCurrency(futureLiabilities).split(',')[0]}</span>
                <span className="text-sm font-bold text-slate-500">₺</span>
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-700/50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-rose-500/10 rounded-lg">
                <TrendingDown size={16} className="text-rose-400" />
              </div>
              <div className="flex flex-col">
                <p className="text-[10px] font-black text-slate-400 uppercase leading-none">Toplam Tahmini Yük</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-black text-rose-400 leading-tight">
                    {formatCurrency(estimatedTotalLoad).split(',')[0]} ₺
                  </p>
                  <span className="text-[9px] font-bold text-slate-500 lowercase">(sabit + harcanan + planlanan + taksit)</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase leading-none">Öngörülen Tasarruf</p>
                <p className="text-lg font-black text-emerald-400 leading-tight">
                  {formatCurrency(projectedSavings).split(',')[0]} ₺
                </p>
              </div>
              <ArrowRight size={20} className="text-slate-600" />
            </div>
          </div>
        </Card>

        {/* BOX: STRATEGIC EXPENSE SUMMARY */}
        <div className="col-span-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="En Yüksek Harcama Kategorisi" className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none shadow-xl" icon={Trophy}>
            <div className="flex items-center gap-4 py-2">
              <div className="p-3 bg-indigo-500/10 rounded-2xl">
                <Trophy size={24} className="text-indigo-400" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{topCategoryEntry[0]}</p>
                <p className="text-2xl font-black text-white leading-none">
                  {formatCurrency(topCategoryEntry[1]).split(',')[0]} <span className="text-sm font-bold text-slate-500">₺</span>
                </p>
              </div>
            </div>
          </Card>

          <Card title="Düğün Süreci Giderleri" className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none shadow-xl" icon={Heart}>
            <div className="flex items-center gap-4 py-2">
              <div className="p-3 bg-rose-500/10 rounded-2xl">
                <Heart size={24} className="text-rose-400" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Toplam Harcanan</p>
                <p className="text-2xl font-black text-white leading-none">
                  {formatCurrency(weddingSpent).split(',')[0]} <span className="text-sm font-bold text-slate-500">₺</span>
                </p>
              </div>
            </div>
          </Card>

          <Card title="Ev Eşyaları Giderleri" className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none shadow-xl" icon={Home}>
            <div className="flex items-center gap-4 py-2">
              <div className="p-3 bg-emerald-500/10 rounded-2xl">
                <Home size={24} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Mobilya & Beyaz Eşya</p>
                <p className="text-2xl font-black text-white leading-none">
                  {formatCurrency(homeSpent).split(',')[0]} <span className="text-sm font-bold text-slate-500">₺</span>
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* BOX: INVESTMENT DASHBOARD */}
        <Card title="Yatırım Portföyü" className="col-span-12 lg:col-span-12 lg:row-span-1 bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none shadow-xl" icon={TrendingUp}>
          {rates.error && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-400 text-xs font-bold">
              <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
              {rates.error}
            </div>
          )}
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 py-2">
            {CATEGORIES.Yatırım.map((cat) => {
              const currency = CURRENCIES[cat] || "TRY";
              const rate = rates[currency] || (currency === 'TRY' ? 1 : 0);
              const totalAmount = entries
                .filter(e => e.type === "Yatırım" && e.category === cat)
                .reduce((sum, e) => sum + parseAmount(e.amount), 0);
              const valueInTry = totalAmount * rate;
              
              return (
                <div key={cat} className="bg-white/5 p-4 rounded-2xl border border-white/10 flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{cat}</span>
                  <p className="text-xl font-black text-white">
                    {totalAmount.toLocaleString('tr-TR')} <span className="text-[10px] font-bold text-slate-500">{currency === "TRY" ? "₺" : currency}</span>
                  </p>
                  <p className="text-[11px] font-bold text-indigo-400">
                    ≈ {formatCurrency(valueInTry).split(',')[0]} ₺
                  </p>
                  {currency !== "TRY" && rate > 0 && (
                    <p className="text-[9px] font-medium text-slate-500 mt-1">
                      Güncel Kur: {rate.toFixed(2)} ₺
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-700/50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 leading-none">Toplam Yatırım Değeri (TL)</span>
              {rates.lastUpdated && (
                <span className="text-[9px] font-medium text-slate-500 lowercase">
                  Son Güncelleme: {format(new Date(rates.lastUpdated), 'HH:mm:ss', { locale: tr })}
                </span>
              )}
            </div>
            <span className="text-2xl font-black text-emerald-400">
              {formatCurrency(entries
                .filter(e => e.type === "Yatırım")
                .reduce((sum, e) => sum + (parseAmount(e.amount) * (rates[CURRENCIES[e.category] || e.currency] || 0)), 0)
              ).split(',')[0]} ₺
            </span>
          </div>
        </Card>


      </main>
    </div>
  );
}
