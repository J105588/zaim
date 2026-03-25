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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [historyViewMode, setHistoryViewMode] = useState<'list' | 'chart'>('list')
  const [memo, setMemo] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearchVisible, setIsSearchVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editConfirmId, setEditConfirmId] = useState<string | null>(null)
  const [lastTap, setLastTap] = useState(0)
  const [touchStartTime, setTouchStartTime] = useState(0)

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
      .select('*, category:categories(*)')
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

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    setTouchStartTime(Date.now())
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

  const handleTouchEnd = (item: Transaction) => {
    const duration = Date.now() - touchStartTime
    if (Math.abs(swipeX) < 5 && duration < 300) {
      handleEditRequest(item)
    }

    if (swipeX <= -50) {
      setSwipeX(-100)
    } else {
      setSwipeX(0)
      setTimeout(() => setSwipingId(null), 100)
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

  const handleMouseUp = (item: Transaction) => {
    const duration = Date.now() - touchStartTime
    if (Math.abs(swipeX) < 5 && duration < 300) {
      handleEditRequest(item)
    }
    handleTouchEnd(item)
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
      setSwipingId(null)
      setSwipeX(0)
    }
  }

  const cancelDelete = () => {
    setDeleteConfirmId(null)
    setSwipingId(null)
    setSwipeX(0)
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
    
    if (editingId) {
      const { error } = await supabase
        .from('transactions')
        .update({
          type,
          category_id: type === 'expense' ? selectedCategory : null,
          amount: rawAmount,
          memo: memo.trim() || null,
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
        {showToast && (
          <div className="toast">
            <Icons.CheckCircle size={18} />
            <span>{t('lang_switched')}</span>
          </div>
        )}
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
        <div className="lang-toggle" onClick={handleToggleLang}>
          <Icons.Languages size={20} />
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      {showToast && (
        <div className="toast">
          <Icons.CheckCircle size={18} />
          <span>{t('lang_switched')}</span>
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
              <h2>{editingId ? (type === 'expense' ? t('edit_expense') : t('edit_income')) : (type === 'expense' ? t('expense') : t('income'))}</h2>
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
                    {t('select_category')}
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

            <div className="memo-container">
              <Icons.FileText size={18} className="memo-icon" />
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder={t('memo_placeholder')}
              />
            </div>
            
            {amount !== '' && Number(amount.replace(/,/g, '')) === 0 && (
              <div className="validation-msg">
                {t('invalid_amount')}
              </div>
            )}

            <button
              className="submit-btn"
              disabled={isSubmitting || !amount || Number(amount.replace(/,/g, '')) === 0 || (type === 'expense' && !selectedCategory)}
              onClick={handleSubmit}
              style={{ 
                background: type === 'expense' ? 'var(--expense)' : 'var(--income)',
                color: 'white'
              }}
            >
              {isSubmitting ? '...' : (editingId ? t('save') : t('submit'))}
            </button>
          </div>
        ) : (
          <div className="history-screen">
            <div className="history-header">
              <button className="icon-btn" onClick={() => setView('start')}><Icons.ArrowLeft size={24} /></button>
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
                <div className={`search-container ${isSearchVisible ? 'visible' : 'hidden'}`}>
                  <Icons.Search size={18} className="search-icon" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t('search_placeholder')}
                  />
                  {searchTerm && (
                    <button className="clear-search" onClick={() => setSearchTerm('')}>
                      <Icons.X size={16} />
                    </button>
                  )}
                </div>
              {(() => {
                const filteredHistory = history.filter(item => {
                  if (!searchTerm) return true
                  const searchLower = searchTerm.toLowerCase()
                  const categoryName = lang === 'ja' ? item.category?.name_ja : item.category?.name_zh
                  const memoMatch = item.memo?.toLowerCase().includes(searchLower)
                  const categoryMatch = categoryName?.toLowerCase().includes(searchLower)
                  const typeMatch = (item.type === 'income' ? t('income') : t('expense')).toLowerCase().includes(searchLower)
                  return memoMatch || categoryMatch || typeMatch
                })

                if (filteredHistory.length === 0) {
                  return (
                    <div className="empty-state">
                      <Icons.Inbox size={48} strokeWidth={1} />
                      <p>{t('no_data')}</p>
                    </div>
                  )
                }

                return filteredHistory.map((item) => (
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
                        onTouchEnd={() => handleTouchEnd(item)}
                        onMouseDown={(e) => {
                          setTouchStartTime(Date.now())
                          handleMouseDown(e, item.id)
                        }}
                        onMouseMove={handleMouseMove}
                        onMouseUp={() => handleMouseUp(item)}
                        onMouseLeave={() => handleMouseUp(item)}
                        style={{ 
                          transform: swipingId === item.id ? `translateX(${swipeX}px)` : 'translateX(0)',
                          transition: swipeX === 0 || swipeX === -100 ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
                        }}
                      >
                      <div className="item-info">
                        <div className="item-date">{new Date(item.created_at).toLocaleDateString()}</div>
                        <div className="item-cat">
                          {item.type === 'income' ? t('income') : (lang === 'ja' ? item.category?.name_ja : item.category?.name_zh) || t('others')}
                        </div>
                        {item.memo && <div className="item-memo">{item.memo}</div>}
                      </div>
                      <div className={`item-amount ${item.type}`}>
                        {item.type === 'income' ? '+' : '-'}{item.amount.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              })()}
              </div>

              <div className="history-chart-view">
                {history.filter(item => item.type === 'expense').length === 0 ? (
                  <div className="empty-state">
                    <Icons.Inbox size={48} strokeWidth={1} />
                    <p>{t('no_data')}</p>
                  </div>
                ) : (
                  <div className="analytics-container">
                    <div className="chart-wrapper">
                      <svg viewBox="0 0 100 100" className="pie-chart">
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
                            
                            // Drawing sector
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
                              <path 
                                key={catId} 
                                d={pathData} 
                                fill={colors[index % colors.length]} 
                                stroke="var(--bg)" 
                                strokeWidth="2"
                              >
                                <title>{name}: {Number(amount).toLocaleString()}</title>
                              </path>
                            )
                          })
                        })()}
                      </svg>
                      <div className="chart-center">
                        <div className="center-label">{t('expense')}</div>
                        <div className="center-value">
                          {history.filter(item => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0).toLocaleString()}
                        </div>
                      </div>
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
                              <div key={catId} className="legend-item">
                                <div className="legend-dot" style={{ backgroundColor: colors[index % colors.length] }}></div>
                                <div className="legend-info">
                                  <span className="legend-name">{name}</span>
                                  <span className="legend-percent">{percentage}%</span>
                                </div>
                                <div className="legend-amount">{Number(amount).toLocaleString()}</div>
                              </div>
                            )
                          })
                      })()}
                    </div>
                  </div>
                )}
              </div>
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

      {deleteConfirmId && (
        <div className="modal-overlay">
          <div className="confirm-modal">
            <div className="modal-icon">
              <Icons.AlertTriangle size={36} color="var(--expense)" />
            </div>
            <h3>{t('delete_confirm_title')}</h3>
            <p>{t('delete_confirm_msg')}</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={cancelDelete}>
                {t('cancel')}
              </button>
              <button className="modal-btn delete" onClick={executeDelete}>
                {t('delete_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {editConfirmId && (
        <div className="modal-overlay">
          <div className="confirm-modal">
            <div className="modal-icon">
              <Icons.Edit3 size={36} color="var(--accent)" />
            </div>
            <h3>{t('edit_confirm_title')}</h3>
            <p>{t('edit_confirm_msg')}</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={cancelEdit}>
                {t('cancel')}
              </button>
              <button className="modal-btn edit" onClick={executeEdit} style={{ background: 'var(--accent)' }}>
                {t('edit_btn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
