import { useState, useEffect } from 'react'
import { supabase, type Category, type Transaction } from './lib/supabase'
import { useI18n } from './hooks/useI18n'
import * as Icons from 'lucide-react'
import './App.css'

type View = 'start' | 'entry' | 'history'

import { useRegisterSW } from 'virtual:pwa-register/react'

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
  const [balance, setBalance] = useState(0)
  const [history, setHistory] = useState<Transaction[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [swipingId, setSwipingId] = useState<string | null>(null)
  const [swipeX, setSwipeX] = useState(0)
  const [startX, setStartX] = useState(0)
  const [baseX, setBaseX] = useState(0)

  const familyPassword = import.meta.env.VITE_FAMILY_PASSWORD || 'family123'

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
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('transactions')
      .select('amount, type')
      .gte('created_at', startOfMonth.toISOString())

    if (error) console.error(error)
    if (data) {
      const total = data.reduce((acc: number, item: any) => {
        return item.type === 'income' ? acc + Number(item.amount) : acc - Number(item.amount)
      }, 0)
      setBalance(total)
    }
  }

  // Global click/touch listener to reset swipe state when tapping elsewhere
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
      if (!swipingId) return

      // Find if we clicked inside a swipe-item-container
      const target = e.target as HTMLElement
      if (!target.closest('.swipe-item-container')) {
        setSwipeX(0)
        setTimeout(() => setSwipingId(null), 300)
      }
    }

    if (swipingId && swipeX !== 0) {
      window.addEventListener('mousedown', handleGlobalClick)
      window.addEventListener('touchstart', handleGlobalClick)
    }

    return () => {
      window.removeEventListener('mousedown', handleGlobalClick)
      window.removeEventListener('touchstart', handleGlobalClick)
    }
  }, [swipingId, swipeX])

  const fetchHistory = async (date: Date) => {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1)
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)

    const { data, error } = await supabase
      .from('transactions')
      .select('*, categories(*)')
      .gte('created_at', startOfMonth.toISOString())
      .lte('created_at', endOfMonth.toISOString())
      .order('created_at', { ascending: false })

    if (error) console.error(error)
    else setHistory(data as any || [])
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
      alert('Password incorrect')
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
  }

  const handleToggleLang = () => {
    toggleLang()
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }

  const toggleHistory = () => {
    if (view === 'history') {
      setView('start')
      setSwipingId(null)
      setSwipeX(0)
    } else {
      fetchHistory(selectedDate)
      setView('history')
    }
  }

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    setStartX(e.touches[0].clientX)
    if (swipingId === id) {
      setBaseX(swipeX)
    } else {
      setSwipingId(id)
      setSwipeX(0)
      setBaseX(0)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swipingId) return
    const currentX = e.touches[0].clientX
    const diff = currentX - startX
    const newX = baseX + diff
    setSwipeX(Math.min(0, Math.max(newX, -100)))
  }

  const handleTouchEnd = () => {
    if (swipeX <= -50) {
      setSwipeX(-100)
    } else {
      setSwipeX(0)
      setTimeout(() => setSwipingId(null), 300)
    }
  }

  // Mouse support for testing/PC
  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    setStartX(e.clientX)
    if (swipingId === id) {
      setBaseX(swipeX)
    } else {
      setSwipingId(id)
      setSwipeX(0)
      setBaseX(0)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!swipingId) return
    const diff = e.clientX - startX
    const newX = baseX + diff
    setSwipeX(Math.min(0, Math.max(newX, -100)))
  }

  const handleMouseUp = () => {
    handleTouchEnd()
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) {
      console.error(error)
    } else {
      setHistory(prev => prev.filter(item => item.id !== id))
      fetchBalance()
      setSwipingId(null)
      setSwipeX(0)
    }
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
    if (!amount || (type === 'expense' && !selectedCategory)) return

    setIsSubmitting(true)
    const rawAmount = Number(amount.replace(/,/g, ''))
    
    const { error } = await supabase.from('transactions').insert([
      {
        type,
        category_id: type === 'expense' ? selectedCategory : null,
        amount: rawAmount,
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

  const renderIcon = (iconName: string) => {
    const IconComponent = (Icons as any)[iconName] || Icons.HelpCircle
    return <IconComponent size={20} />
  }

  if (!isLoggedIn) {
    return (
      <div className="login-screen">
        <div className="login-card">
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
            <button className="login-btn" onClick={handleLogin}>
              {t('login_btn')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      {showToast && (
        <div className="toast">
          <Icons.CheckCircle size={18} />
          <span>{lang === 'ja' ? '日本語に切り替えました' : '已切换至简体中文'}</span>
        </div>
      )}
      <header className="app-header">
        <div className="balance-badge" onClick={toggleHistory}>
          <div className="balance-label">{t('balance')}</div>
          <div className={`balance-value ${balance >= 0 ? 'plus' : 'minus'}`}>
            {balance.toLocaleString()}
          </div>
          <Icons.ChevronRight size={14} className={`history-arrow ${view === 'history' ? 'open' : ''}`} />
        </div>
      </header>

      <main className="main-content">
        {showSuccess ? (
          <div className="success-screen">
            <div className="success-icon">
              <Icons.CheckCircle2 size={80} strokeWidth={1.5} color="#00ff88" />
            </div>
            <h2>{t('success')}</h2>
          </div>
        ) : view === 'start' ? (
          <div className="start-screen">
            <button className="big-btn expense" onClick={() => handleStart('expense')}>
              <Icons.TrendingDown size={40} />
              <span>{t('expense')}</span>
            </button>
            <button className="big-btn income" onClick={() => handleStart('income')}>
              <Icons.TrendingUp size={40} />
              <span>{t('income')}</span>
            </button>
          </div>
        ) : view === 'entry' ? (
          <div className="entry-screen">
            <div className="entry-header">
              <button className="icon-btn" onClick={handleBack}><Icons.ArrowLeft size={24} /></button>
              <h2>{type === 'expense' ? t('expense') : t('income')}</h2>
            </div>
            
            {type === 'expense' && (
              <>
                <div className="category-grid">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      className={`category-btn ${selectedCategory === cat.id ? 'selected' : ''}`}
                      onClick={() => setSelectedCategory(cat.id)}
                    >
                      {renderIcon(cat.icon)}
                      <span>{lang === 'ja' ? cat.name_ja : cat.name_zh}</span>
                    </button>
                  ))}
                </div>
                {!selectedCategory && (
                  <div className="validation-msg">
                    {lang === 'ja' ? 'カテゴリーを選択してください' : '请選択类别'}
                  </div>
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

            <button
              className="submit-btn"
              disabled={isSubmitting || !amount || (type === 'expense' && !selectedCategory)}
              onClick={handleSubmit}
              style={{ 
                background: type === 'expense' ? 'var(--expense)' : 'var(--income)',
                color: 'white'
              }}
            >
              {isSubmitting ? '...' : t('submit')}
            </button>
          </div>
        ) : (
          <div className="history-screen">
            <div className="history-header">
              <button className="icon-btn" onClick={() => setView('start')}><Icons.ArrowLeft size={24} /></button>
              <h2>{selectedDate.getFullYear()}{lang === 'ja' ? '年' : '.'}{selectedDate.getMonth() + 1}{lang === 'ja' ? '月の収支' : ' ' + t('month_stats')}</h2>
            </div>
            
            <div className="history-list">
              {history.length === 0 ? (
                <div className="empty-state">
                  <Icons.Inbox size={48} strokeWidth={1} />
                  <p>{t('no_data')}</p>
                </div>
              ) : (
                history.map((item) => (
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
                    <div 
                      className="history-item"
                      onTouchStart={(e) => handleTouchStart(e, item.id)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onMouseDown={(e) => handleMouseDown(e, item.id)}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      style={{ 
                        transform: swipingId === item.id ? `translateX(${swipeX}px)` : 'translateX(0)',
                        transition: swipeX === 0 || swipeX === -100 ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
                      }}
                    >
                      <div className="item-info">
                        <div className="item-date">{new Date(item.created_at).toLocaleDateString()}</div>
                        <div className="item-cat">
                          {item.type === 'income' ? t('income') : (item as any).categories?.name_ja || t('others')}
                        </div>
                      </div>
                      <div className={`item-amount ${item.type}`}>
                        {item.type === 'income' ? '+' : '-'}{item.amount.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="history-nav">
              <button className="nav-btn" onClick={() => changeMonth(-1)}>
                <Icons.ChevronLeft size={20} />
                {t('prev_month')}
              </button>
              <button className="nav-btn" onClick={() => changeMonth(1)}>
                {t('next_month')}
                <Icons.ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </main>

      <div className="lang-toggle" onClick={handleToggleLang}>
        <Icons.Languages size={20} />
      </div>
    </div>
  )
}

export default App
