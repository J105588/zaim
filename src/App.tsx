import { useState, useEffect } from 'react'
import { supabase, type Category, type Transaction } from './lib/supabase'
import { useI18n } from './hooks/useI18n'
import * as Icons from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import './App.css'

type View = 'start' | 'entry' | 'history'

import { useRegisterSW } from 'virtual:pwa-register/react'

// --- JST Utilities ---
// 日本時間の現在日時文字列 (YYYY-MM-DDThh:mm) を取得
const getJSTDateTimeString = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value;
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}`;
};

// YYYY-MM-DDThh:mm を JST として解釈して Date オブジェクトにする
const parseJSTDateTime = (dateTimeStr: string): Date => {
  return new Date(`${dateTimeStr}:00+09:00`);
};

// 表示用 JST フォーマット
const formatJSTDate = (isoString: string) => {
  const date = new Date(isoString);
  return date.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const formatJSTTime = (isoString: string) => {
  const date = new Date(isoString);
  return date.toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

// JSTの現在の年と月を取得するヘルパー
const getJSTYearMonth = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find(p => p.type === 'year')?.value);
  const month = Number(parts.find(p => p.type === 'month')?.value) - 1; // Month index 0-11
  return { year, month };
};
// ---------------------

function App() {
  useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      // Periodic update check (once every 10 minutes)
      r && setInterval(() => {
        r.update()
      }, 10 * 60 * 1000)
    },
  })

  const { lang, t, toggleLang } = useI18n()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [password, setPassword] = useState('')
  const [view, setView] = useState<View>('start')
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [balance, setBalance] = useState<number>(() => {
    const saved = localStorage.getItem('lastBalance')
    return saved ? Number(saved) : 0
  })
  const [isFetchingBalance, setIsFetchingBalance] = useState(false)
  const [isFetchingHistory, setIsFetchingHistory] = useState(false)
  const [history, setHistory] = useState<Transaction[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => {
    const currentJST = getJSTYearMonth(new Date());
    return new Date(currentJST.year, currentJST.month, 1);
  })
  const [activeSwipeId, setActiveSwipeId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [historyViewMode, setHistoryViewMode] = useState<'list' | 'chart'>('list')
  const [isChartTabLoading, setIsChartTabLoading] = useState(false)
  const [drilldownCategoryId, setDrilldownCategoryId] = useState<string | null>(null)
  const [memo, setMemo] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearchVisible, setIsSearchVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editConfirmId, setEditConfirmId] = useState<string | null>(null)
  const [transactionDate, setTransactionDate] = useState<string>(getJSTDateTimeString(new Date()))
  const [lastTap, setLastTap] = useState(0)

  const familyPassword = import.meta.env.VITE_FAMILY_PASSWORD || 'family123'

  useEffect(() => {
    if (historyViewMode === 'chart') {
      setIsChartTabLoading(true)
      const timer = setTimeout(() => setIsChartTabLoading(false), 500)
      return () => clearTimeout(timer)
    }
  }, [historyViewMode])

  useEffect(() => {
    const savedAuth = localStorage.getItem('isLoggedIn')
    if (savedAuth === 'true') setIsLoggedIn(true)
  }, [])

  useEffect(() => {
    if (isLoggedIn) {
      fetchCategories()
      fetchBalance()
    }
  }, [isLoggedIn])

  // Real-time & Periodic Updates
  useEffect(() => {
    if (!isLoggedIn) return

    // Subscribe to real-time changes
    const channel = supabase
      .channel('transactions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => {
          fetchBalance()
          fetchHistory(selectedDate)
        }
      )
      .subscribe()

    // Fallback polling (60s)
    const pollId = setInterval(() => {
      fetchBalance()
      fetchHistory(selectedDate)
    }, 60000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollId)
    }
  }, [isLoggedIn, selectedDate])

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) console.error(error)
    else setCategories(data || [])
  }

  const fetchBalance = async () => {
    setIsFetchingBalance(true)
    try {
      // Try RPC first for server-side aggregation (high performance)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_total_balance')

      if (!rpcError && rpcData !== null) {
        const total = Number(rpcData)
        setBalance(total)
        localStorage.setItem('lastBalance', String(total))
        return
      }

      // Fallback to client-side calculation if RPC fails/not found
      const { data, error } = await supabase
        .from('transactions')
        .select('amount, type')

      if (error) throw error
      if (data) {
        const total = data.reduce((acc: number, item: any) => {
          return item.type === 'income' ? acc + Number(item.amount) : acc - Number(item.amount)
        }, 0)
        setBalance(total)
        localStorage.setItem('lastBalance', String(total))
      }
    } catch (error) {
      console.error('Error fetching balance:', error)
    } finally {
      setIsFetchingBalance(false)
    }
  }

  // Global click/touch listener to reset swipe state when tapping elsewhere
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
      if (!activeSwipeId) return

      const target = e.target as HTMLElement
      if (!target.closest('.swipe-item-container')) {
        setActiveSwipeId(null)
      }
    }

    if (activeSwipeId) {
      window.addEventListener('mousedown', handleGlobalClick)
      window.addEventListener('touchstart', handleGlobalClick)
    }

    return () => {
      window.removeEventListener('mousedown', handleGlobalClick)
      window.removeEventListener('touchstart', handleGlobalClick)
    }
  }, [activeSwipeId])

  const fetchHistory = async (date: Date) => {
    setIsFetchingHistory(true)
    try {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      const monthStr = String(month).padStart(2, '0');
      const lastDayStr = String(lastDay).padStart(2, '0');

      const startOfMonthStr = `${year}-${monthStr}-01T00:00:00+09:00`;
      const endOfMonthStr = `${year}-${monthStr}-${lastDayStr}T23:59:59.999+09:00`;

      const { data, error } = await supabase
        .from('transactions')
        .select('*, category:categories(*)')
        .gte('created_at', new Date(startOfMonthStr).toISOString())
        .lte('created_at', new Date(endOfMonthStr).toISOString())
        .order('created_at', { ascending: false })

      if (error) console.error(error)
      else setHistory(data as any || [])
    } finally {
      setIsFetchingHistory(false)
    }
  }

  const changeMonth = (offset: number) => {
    const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + offset, 1)
    setSelectedDate(newDate)
    fetchHistory(newDate)
  }

  const handleLogin = () => {
    if (password === familyPassword) {
      setIsLoggedIn(true)
      localStorage.setItem('isLoggedIn', 'true')
    } else {
      alert(t('login_error'))
    }
  }

  const handleStart = (selectedType: 'income' | 'expense') => {
    setType(selectedType)
    setView('entry')
  }

  const handleBack = () => {
    setView('start')
    setAmount('')
    setSelectedCategory(null)
    setMemo('')
    setEditingId(null)
    setTransactionDate(getJSTDateTimeString(new Date()))
  }

  const handleToggleLang = () => {
    toggleLang()
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }

  const toggleHistory = () => {
    if (view === 'history') {
      setView('start')
      setActiveSwipeId(null)
      setDeleteConfirmId(null)
      setHistoryViewMode('list')
      setEditingId(null)
    } else {
      fetchHistory(selectedDate)
      setView('history')
    }
  }

  const handleEdit = (item: Transaction) => {
    setEditingId(item.id)
    setType(item.type)
    setSelectedCategory(item.category_id)
    setAmount(item.amount.toLocaleString())
    setMemo(item.memo || '')
    setTransactionDate(getJSTDateTimeString(new Date(item.created_at)))
    setView('entry')
  }

  const handleEditRequest = (item: Transaction) => {
    const now = Date.now()
    if (now - lastTap < 400) {
      // Double tap detected
      setEditConfirmId(item.id)
    }
    setLastTap(now)
  }

  const executeEdit = () => {
    if (!editConfirmId) return
    const item = history.find(h => h.id === editConfirmId)
    if (item) handleEdit(item as Transaction)
    setEditConfirmId(null)
  }

  const cancelEdit = () => {
    setEditConfirmId(null)
  }


  const handleDelete = (id: string) => {
    setDeleteConfirmId(id)
  }

  const executeDelete = async () => {
    if (!deleteConfirmId) return
    const { error } = await supabase.from('transactions').delete().eq('id', deleteConfirmId)
    if (error) {
      console.error(error)
    } else {
      setHistory(prev => prev.filter(item => item.id !== deleteConfirmId))
      fetchBalance()
      setDeleteConfirmId(null)
      setActiveSwipeId(null)
    }
  }

  const cancelDelete = () => {
    setDeleteConfirmId(null)
    setActiveSwipeId(null)
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollY = e.currentTarget.scrollTop
    const diff = currentScrollY - lastScrollY

    if (currentScrollY < 10) {
      setIsSearchVisible(true)
    } else if (Math.abs(diff) > 10) { // Threshold to avoid jitter
      if (diff > 0) {
        setIsSearchVisible(false) // Scrolling Down
      } else {
        setIsSearchVisible(true) // Scrolling Up
      }
    }
    setLastScrollY(currentScrollY)
  }

  const handleAmountChange = (val: string) => {
    // Remove all non-numeric characters except for the decimal point
    const cleanVal = val.replace(/[^\d.]/g, '')
    const parts = cleanVal.split('.')
    let formatted = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    if (parts.length > 1) {
      formatted += '.' + parts[1]
    }
    setAmount(formatted)
  }

  const handleSubmit = async () => {
    const rawAmount = Number(amount.replace(/,/g, ''))
    if (!amount || rawAmount === 0 || (type === 'expense' && !selectedCategory)) return

    setIsSubmitting(true)

    // Convert the user-selected datetime in input format to UTC ISO string, interpreting input as JST
    const finalTimestamp = parseJSTDateTime(transactionDate).toISOString();

    if (editingId) {
      const { error } = await supabase
        .from('transactions')
        .update({
          type,
          category_id: type === 'expense' ? selectedCategory : null,
          amount: rawAmount,
          memo: memo.trim() || null,
          created_at: finalTimestamp,
        })
        .eq('id', editingId)

      setIsSubmitting(false)
      if (error) {
        alert(error.message)
      } else {
        setShowSuccess(true)
        fetchBalance()
        fetchHistory(selectedDate)
        setTimeout(() => {
          setShowSuccess(false)
          handleBack()
        }, 1500)
      }
    } else {
      const { error } = await supabase.from('transactions').insert([
        {
          type,
          category_id: type === 'expense' ? selectedCategory : null,
          amount: rawAmount,
          memo: memo.trim() || null,
          created_at: finalTimestamp,
        },
      ])

      setIsSubmitting(false)
      if (error) {
        alert(error.message)
      } else {
        setShowSuccess(true)
        fetchBalance()
        setTimeout(() => {
          setShowSuccess(false)
          handleBack()
        }, 1500)
      }
    }
  }

  const renderIcon = (iconName: string) => {
    const IconComponent = (Icons as any)[iconName] || Icons.HelpCircle
    return <IconComponent size={20} />
  }

  if (!isLoggedIn) {
    return (
      <div className="login-screen">
        <AnimatePresence>
          {showToast && (
            <motion.div
              className="toast"
              initial={{ opacity: 0, y: -20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: -20, x: "-50%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <Icons.CheckCircle size={18} />
              <span>{t('lang_switched')}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          className="login-card"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
        >
          <div className="login-header">
            <div className="login-logo">
              <Icons.ShieldCheck size={40} strokeWidth={1.5} />
            </div>
            <h1>{t('login')}</h1>
            <p>{t('login_desc') || 'Family Financial System'}</p>
          </div>

          <div className="login-body">
            <div className="input-group">
              <Icons.Lock size={18} className="input-icon" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                autoFocus
              />
            </div>
            <motion.button
              className="login-btn"
              onClick={handleLogin}
              whileTap={{ scale: 0.98 }}
            >
              {t('login_btn')}
            </motion.button>
          </div>
        </motion.div>
        <motion.div
          className="lang-toggle"
          onClick={handleToggleLang}
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.1 }}
        >
          <Icons.Languages size={20} />
        </motion.div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <AnimatePresence>
        {showToast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <Icons.CheckCircle size={18} />
            <span>{t('lang_switched')}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <header className="app-header">
        <motion.div
          className={`balance-badge ${isFetchingBalance ? 'loading' : ''}`}
          onClick={toggleHistory}
          whileTap={{ scale: 0.95 }}
        >
          <div className="balance-label">{t('balance')}</div>
          <div className={`balance-value ${balance >= 0 ? 'plus' : 'minus'}`}>
            {isFetchingBalance && balance === 0 ? (
              <span className="calculating-text">計算中...</span>
            ) : (
              <>
                {balance.toLocaleString()}
                {isFetchingBalance && <span className="refreshing-dot"></span>}
              </>
            )}
          </div>
          <Icons.ChevronRight size={14} className={`history-arrow ${view === 'history' ? 'open' : ''}`} />
        </motion.div>
      </header>

      <main className="main-content">
        <AnimatePresence mode="wait">
          {showSuccess ? (
            <motion.div
              key="success"
              className="success-screen"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              <motion.div
                className="success-icon"
                initial={{ scale: 0.5, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
              >
                <Icons.CheckCircle2 size={80} strokeWidth={1.5} color="#00ff88" />
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {t('success')}
              </motion.h2>
            </motion.div>
          ) : view === 'start' ? (
            <motion.div
              key="start"
              className="start-screen"
              initial={{ opacity: 0, x: -20, filter: "blur(4px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0)" }}
              exit={{ opacity: 0, x: 20, filter: "blur(4px)" }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              <motion.button
                className="big-btn expense"
                onClick={() => handleStart('expense')}
                whileTap={{ scale: 0.96 }}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                <Icons.TrendingDown size={40} />
                <span>{t('expense')}</span>
              </motion.button>
              <motion.button
                className="big-btn income"
                onClick={() => handleStart('income')}
                whileTap={{ scale: 0.96 }}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.1 }}
              >
                <Icons.TrendingUp size={40} />
                <span>{t('income')}</span>
              </motion.button>
            </motion.div>
          ) : view === 'entry' ? (
            <motion.div
              key="entry"
              className="entry-screen"
              initial={{ opacity: 0, x: 20, filter: "blur(4px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0)" }}
              exit={{ opacity: 0, x: -20, filter: "blur(4px)" }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              <div className="entry-header">
                <motion.button
                  className="icon-btn"
                  onClick={handleBack}
                  whileTap={{ scale: 0.9 }}
                >
                  <Icons.ArrowLeft size={24} />
                </motion.button>
                <h2>{editingId ? (type === 'expense' ? t('edit_expense') : t('edit_income')) : (type === 'expense' ? t('expense') : t('income'))}</h2>
              </div>

              {type === 'expense' && (
                <>
                  <motion.div className="category-grid" layout>
                    {categories.map((cat) => (
                      <motion.button
                        key={cat.id}
                        layout
                        whileTap={{ scale: 0.95 }}
                        className={`category-btn ${selectedCategory === cat.id ? 'selected' : ''}`}
                        onClick={() => setSelectedCategory(cat.id)}
                      >
                        {renderIcon(cat.icon)}
                        <span>{lang === 'ja' ? cat.name_ja : cat.name_zh}</span>
                      </motion.button>
                    ))}
                  </motion.div>
                  {!selectedCategory && (
                    <motion.div
                      className="validation-msg"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      {t('select_category')}
                    </motion.div>
                  )}
                </>
              )}

              <div className="input-container">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </div>

              <div className="memo-container">
                <Icons.FileText size={18} className="memo-icon" />
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={t('memo_placeholder')}
                />
              </div>

              <div className="date-container">
                <Icons.CalendarClock size={18} className="date-icon" />
                <input
                  type="datetime-local"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                />
              </div>

              {amount !== '' && Number(amount.replace(/,/g, '')) === 0 && (
                <div className="validation-msg">
                  {t('invalid_amount')}
                </div>
              )}

              <motion.button
                className="submit-btn"
                disabled={isSubmitting || !amount || Number(amount.replace(/,/g, '')) === 0 || (type === 'expense' && !selectedCategory)}
                onClick={handleSubmit}
                whileTap={{ scale: 0.98 }}
                style={{
                  background: type === 'expense' ? 'var(--expense)' : 'var(--income)',
                  color: 'white'
                }}
              >
                {isSubmitting ? '...' : (editingId ? t('save') : t('submit'))}
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="history"
              className="history-screen"
              initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0)" }}
              exit={{ opacity: 0, y: 20, filter: "blur(4px)" }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div className="history-header">
                <motion.button
                  className="icon-btn"
                  onClick={() => setView('start')}
                  whileTap={{ scale: 0.9 }}
                >
                  <Icons.ArrowLeft size={24} />
                </motion.button>
                <h2>
                  {selectedDate.getFullYear()}{lang === 'ja' || lang === 'zh' ? (lang === 'ja' ? '年' : '年') : '.'}
                  {selectedDate.getMonth() + 1}{lang === 'ja' || lang === 'zh' ? (lang === 'ja' ? '月の収支' : '月收支概览') : ' ' + t('month_stats')}
                </h2>
                <div className="view-toggle">
                  <button
                    className={`toggle-btn ${historyViewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setHistoryViewMode('list')}
                  >
                    <Icons.List size={18} />
                    <span>{t('list_view')}</span>
                  </button>
                  <button
                    className={`toggle-btn ${historyViewMode === 'chart' ? 'active' : ''}`}
                    onClick={() => setHistoryViewMode('chart')}
                  >
                    <Icons.PieChart size={18} />
                    <span>{t('chart_view')}</span>
                  </button>
                </div>
              </div>

              <div className={`history-content-wrapper ${historyViewMode}`}>
                <div className="history-list-view" onScroll={handleScroll}>
                  <AnimatePresence>
                    {isSearchVisible && (
                      <motion.div
                        className="search-container"
                        initial={{ height: 0, opacity: 0, marginBottom: 0, scaleY: 0.8 }}
                        animate={{ height: "auto", opacity: 1, marginBottom: 20, scaleY: 1 }}
                        exit={{ height: 0, opacity: 0, marginBottom: 0, scaleY: 0.8 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                      >
                        <Icons.Search size={18} className="search-icon" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder={t('search_placeholder')}
                        />
                        {searchTerm && (
                          <motion.button
                            className="clear-search"
                            onClick={() => setSearchTerm('')}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                          >
                            <Icons.X size={16} />
                          </motion.button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {(() => {
                    const filteredHistory = history.filter(item => {
                      if (!searchTerm) return true
                      const searchLower = searchTerm.toLowerCase()
                      const categoryName = lang === 'ja' ? item.category?.name_ja : item.category?.name_zh
                      const memoMatch = item.memo?.toLowerCase().includes(searchLower)
                      const categoryMatch = categoryName?.toLowerCase().includes(searchLower)
                      const typeMatch = (item.type === 'income' ? t('income') : t('expense')).toLowerCase().includes(searchLower)
                      
                      // Amount matching (absolute, plain string, and formatted locale strings)
                      const amountStr = String(item.amount)
                      const amountLocaleStr = item.amount.toLocaleString()
                      const normalizedSearch = searchLower.replace(/,/g, '')
                      const amountMatch = amountStr.includes(normalizedSearch) || amountLocaleStr.includes(searchLower)

                      return memoMatch || categoryMatch || typeMatch || amountMatch
                    })

                    if (filteredHistory.length === 0) {
                      return (
                        <div className="empty-state">
                          <Icons.Inbox size={48} strokeWidth={1} />
                          <p>{t('no_data')}</p>
                        </div>
                      )
                    }

                    return (
                      <motion.div layout>
                        {filteredHistory.map((item) => {
                          const isOpen = activeSwipeId === item.id;
                          return (
                            <div
                              key={item.id}
                              className="swipe-item-container"
                            >
                              <button
                                className="delete-action"
                                onClick={() => handleDelete(item.id)}
                              >
                                <Icons.Trash2 size={20} />
                              </button>
                              <motion.div
                                className="history-item"
                                drag="x"
                                dragConstraints={{ left: -100, right: 0 }}
                                dragElastic={{ left: 0.1, right: 0.02 }}
                                animate={{ x: isOpen ? -100 : 0 }}
                                transition={{ type: 'spring', stiffness: 350, damping: 35 }}
                                onDragStart={() => {
                                  setActiveSwipeId(item.id);
                                }}
                                onDragEnd={(_, info) => {
                                  if (info.offset.x < -40 || info.velocity.x < -50) {
                                    setActiveSwipeId(item.id);
                                  } else {
                                    setActiveSwipeId(null);
                                  }
                                }}
                                onClick={() => {
                                  if (isOpen) {
                                    setActiveSwipeId(null);
                                  } else {
                                    handleEditRequest(item);
                                  }
                                }}
                              >
                                <div className="item-info">
                                  <div className="item-date">
                                    {formatJSTDate(item.created_at)} {formatJSTTime(item.created_at)}
                                  </div>
                                  <div className="item-cat">
                                    {item.type === 'income' ? t('income') : (lang === 'ja' ? item.category?.name_ja : item.category?.name_zh) || t('others')}
                                  </div>
                                  {item.memo && <div className="item-memo">{item.memo}</div>}
                                </div>
                                <div className={`item-amount ${item.type}`}>
                                  {item.type === 'income' ? '+' : '-'}{item.amount.toLocaleString()}
                                </div>
                              </motion.div>
                            </div>
                          );
                        })}
                      </motion.div>
                    )
                  })()}
                </div>

                <div className="history-chart-view">
                  {historyViewMode === 'chart' && (
                    <AnimatePresence mode="wait">
                      {(isFetchingHistory || isChartTabLoading) ? (
                        <motion.div
                          key="loading-chart"
                          className="history-loading-container"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="history-loading-spinner" />
                          <span style={{ letterSpacing: '1px', fontSize: '0.8rem', opacity: 0.8 }}>Loading...</span>
                        </motion.div>
                      ) : history.filter(item => item.type === 'expense').length === 0 ? (
                        <motion.div
                          key="empty"
                          className="empty-state"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <Icons.Inbox size={48} strokeWidth={1} />
                          <p>{t('no_data')}</p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key={selectedDate.toISOString()}
                          className="analytics-container"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <div className="chart-wrapper">
                            <motion.svg
                              viewBox="0 0 100 100"
                              className="pie-chart"
                              initial={{ rotate: -270, scale: 0.6, opacity: 0 }}
                              animate={{ rotate: -90, scale: 1, opacity: 1 }}
                              transition={{
                                type: "spring",
                                damping: 20,
                                stiffness: 90,
                                mass: 1,
                                delay: 0.1
                              }}
                            >
                              {(() => {
                                const expenses = history.filter(item => item.type === 'expense')
                                const totals = expenses.reduce((acc: any, item: any) => {
                                  const catId = item.category_id || 'others'
                                  const amount = Number(item.amount)
                                  acc[catId] = (acc[catId] || 0) + amount
                                  return acc
                                }, {})

                                const total = Object.values(totals).reduce((a: any, b: any) => a + b, 0) as number
                                let startAngle = 0
                                const colors = ['#00d2ff', '#00ff88', '#ff4d4d', '#ff9f43', '#a29bfe', '#fab1a0', '#00cec9', '#ffeaa7']

                                return Object.entries(totals).map(([catId, amount], index) => {
                                  const percentage = (amount as number) / total
                                  const angle = percentage * 360
                                  const endAngle = startAngle + angle

                                  const x1 = 50 + 40 * Math.cos(Math.PI * (startAngle - 90) / 180)
                                  const y1 = 50 + 40 * Math.sin(Math.PI * (startAngle - 90) / 180)
                                  const x2 = 50 + 40 * Math.cos(Math.PI * (endAngle - 90) / 180)
                                  const y2 = 50 + 40 * Math.sin(Math.PI * (endAngle - 90) / 180)

                                  const largeArcFlag = angle > 180 ? 1 : 0
                                  const pathData = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`

                                  startAngle += angle

                                  const category = categories.find(c => c.id === catId)
                                  const name = lang === 'ja' ? category?.name_ja : category?.name_zh

                                  return (
                                    <motion.path
                                      key={catId}
                                      d={pathData}
                                      fill={colors[index % colors.length]}
                                      stroke="var(--bg)"
                                      strokeWidth="2"
                                      initial={{ pathLength: 0, opacity: 0 }}
                                      animate={{ pathLength: 1, opacity: 1 }}
                                      transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 + (index * 0.05) }}
                                    >
                                      <title>{name}: {Number(amount).toLocaleString()}</title>
                                    </motion.path>
                                  )
                                })
                              })()}
                            </motion.svg>
                            <motion.div
                              className="chart-center"
                              initial={{ scale: 0, opacity: 0, x: "-50%", y: "-50%" }}
                              animate={{ scale: 1, opacity: 1, x: "-50%", y: "-50%" }}
                              transition={{
                                type: "spring",
                                damping: 15,
                                stiffness: 120,
                                delay: 0.3
                              }}
                            >
                              <div className="center-label">{t('expense')}</div>
                              <div className="center-value">
                                {history.filter(item => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0).toLocaleString()}
                              </div>
                            </motion.div>
                          </div>

                          <div className="chart-legend">
                            {(() => {
                              const expenses = history.filter(item => item.type === 'expense')
                              const totals = expenses.reduce((acc: any, item: any) => {
                                const catId = item.category_id || 'others'
                                const amount = Number(item.amount)
                                acc[catId] = (acc[catId] || 0) + amount
                                return acc
                              }, {})
                              const total = Object.values(totals).reduce((a: any, b: any) => a + b, 0) as number
                              const colors = ['#00d2ff', '#00ff88', '#ff4d4d', '#ff9f43', '#a29bfe', '#fab1a0', '#00cec9', '#ffeaa7']

                              return Object.entries(totals)
                                .sort(([, a], [, b]) => (b as number) - (a as number))
                                .map(([catId, amount], index) => {
                                  const category = categories.find(c => c.id === catId)
                                  const name = (lang === 'ja' ? category?.name_ja : category?.name_zh) || t('others')
                                  const percentage = Math.round(((amount as number) / total) * 100)

                                  return (
                                    <motion.div
                                      key={catId}
                                      className="legend-item clickable"
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: index * 0.05 }}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={() => setDrilldownCategoryId(catId)}
                                    >
                                      <div className="legend-dot" style={{ backgroundColor: colors[index % colors.length] }}></div>
                                      <div className="legend-info">
                                        <span className="legend-name">{name}</span>
                                        <span className="legend-percent">{percentage}%</span>
                                      </div>
                                      <div className="legend-amount">{Number(amount).toLocaleString()}</div>
                                    </motion.div>
                                  )
                                })
                            })()}
                          </div>

                          <motion.div
                            className="income-summary clickable"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3, type: "spring" }}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setDrilldownCategoryId('__income__')}
                          >
                            <div className="summary-label">
                              <Icons.TrendingUp size={18} />
                              <span>{t('total_income')}</span>
                            </div>
                            <div className="summary-amount">
                              {history
                                .filter(item => item.type === 'income')
                                .reduce((sum, item) => sum + Number(item.amount), 0)
                                .toLocaleString()}
                            </div>
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                </div>
              </div>

              <div className="history-nav">
                <motion.button className="nav-btn" onClick={() => changeMonth(-1)} whileTap={{ scale: 0.95 }}>
                  <Icons.ChevronLeft size={20} />
                  {t('prev_month')}
                </motion.button>
                {(() => {
                  const currentJST = getJSTYearMonth(new Date());
                  const isCurrentMonth = selectedDate.getMonth() === currentJST.month && selectedDate.getFullYear() === currentJST.year;
                  if (isCurrentMonth) return null;
                  return (
                    <motion.button
                      className="nav-btn today-btn"
                      whileTap={{ scale: 0.95 }}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring" }}
                      onClick={() => {
                        const target = new Date(currentJST.year, currentJST.month, 1);
                        setSelectedDate(target);
                        fetchHistory(target);
                      }}
                    >
                      <Icons.CalendarClock size={20} />
                      <span>{t('today')}</span>
                    </motion.button>
                  );
                })()}
                <motion.button className="nav-btn" onClick={() => changeMonth(1)} whileTap={{ scale: 0.95 }}>
                  {t('next_month')}
                  <Icons.ChevronRight size={20} />
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <motion.div
        className="lang-toggle"
        onClick={handleToggleLang}
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.1 }}
      >
        <Icons.Languages size={20} />
      </motion.div>

      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="confirm-modal"
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
            >
              <div className="modal-icon">
                <Icons.AlertTriangle size={36} color="var(--expense)" />
              </div>
              <h3>{t('delete_confirm_title')}</h3>
              <p>{t('delete_confirm_msg')}</p>
              <div className="modal-actions">
                <motion.button className="modal-btn cancel" onClick={cancelDelete} whileTap={{ scale: 0.96 }}>
                  {t('cancel')}
                </motion.button>
                <motion.button className="modal-btn delete" onClick={executeDelete} whileTap={{ scale: 0.96 }}>
                  {t('delete_btn')}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editConfirmId && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="confirm-modal"
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
            >
              <div className="modal-icon">
                <Icons.Edit3 size={36} color="var(--accent)" />
              </div>
              <h3>{t('edit_confirm_title')}</h3>
              <p>{t('edit_confirm_msg')}</p>
              <div className="modal-actions">
                <motion.button className="modal-btn cancel" onClick={cancelEdit} whileTap={{ scale: 0.96 }}>
                  {t('cancel')}
                </motion.button>
                <motion.button className="modal-btn edit" onClick={executeEdit} whileTap={{ scale: 0.96 }}>
                  {t('edit_btn')}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drilldownCategoryId && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDrilldownCategoryId(null)}
          >
            <motion.div
              className="drilldown-modal"
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="drilldown-header">
                <div className="drilldown-title">
                  <h3>
                    {(() => {
                      if (drilldownCategoryId === '__income__') return t('total_income')
                      if (drilldownCategoryId === 'others') return t('others')
                      const cat = categories.find(c => c.id === drilldownCategoryId)
                      return lang === 'ja' ? cat?.name_ja : cat?.name_zh
                    })()}
                  </h3>
                  <span className={`drilldown-subtitle ${drilldownCategoryId === '__income__' ? 'income' : 'expense'}`}>
                    {drilldownCategoryId === '__income__' ? t('income') : t('expense')}
                  </span>
                </div>
                <motion.button 
                  className="drilldown-close-btn" 
                  onClick={() => setDrilldownCategoryId(null)}
                  whileTap={{ scale: 0.9 }}
                >
                  <Icons.X size={20} />
                </motion.button>
              </div>
              
              <div className="drilldown-list">
                {(() => {
                  const isIncomeMode = drilldownCategoryId === '__income__'
                  const filtered = history.filter(item => {
                    if (isIncomeMode) return item.type === 'income'
                    return item.type === 'expense' && 
                      (item.category_id === drilldownCategoryId || (drilldownCategoryId === 'others' && !item.category_id))
                  })
                  
                  if (filtered.length === 0) return <p className="drilldown-empty">No details found</p>
                  
                  return filtered.map(item => (
                    <div key={item.id} className="drilldown-item">
                      <div className="drilldown-item-left">
                        <span className="drilldown-item-date">{formatJSTDate(item.created_at)} {formatJSTTime(item.created_at)}</span>
                        {item.memo && <span className="drilldown-item-memo">{item.memo}</span>}
                      </div>
                      <div className="drilldown-item-right">
                        <span className={`drilldown-item-amount ${item.type}`}>
                          {item.type === 'income' ? '+' : '-'}{item.amount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
