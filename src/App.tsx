import { useState, useEffect } from 'react'
import { supabase, type Category, type Transaction } from './lib/supabase'
import { useI18n } from './hooks/useI18n'
import * as Icons from 'lucide-react'
import './App.css'

type View = 'start' | 'entry' | 'history'

function App() {
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

  const fetchCategories = async () => {
    const { data, error } = await supabase.from('categories').select('*').order('name_ja')
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

  const fetchHistory = async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, categories(*)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) console.error(error)
    else setHistory(data as any || [])
  }

  const handleLogin = () => {
    if (password === familyPassword) {
      setIsLoggedIn(true)
      localStorage.setItem('isLoggedIn', 'true')
    } else {
      alert('Wrong password')
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

  const toggleHistory = () => {
    if (view === 'history') {
      setView('start')
    } else {
      fetchHistory()
      setView('history')
    }
  }

  const handleSubmit = async () => {
    if (!amount || (type === 'expense' && !selectedCategory)) return

    setIsSubmitting(true)
    const { error } = await supabase.from('transactions').insert([
      {
        type,
        category_id: type === 'expense' ? selectedCategory : null,
        amount: Number(amount),
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
      <div className="login-container">
        <div className="login-icon"><Icons.Lock size={32} /></div>
        <h2 style={{ fontWeight: 400 }}>{t('login')}</h2>
        <input
          type="password"
          className="login-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••"
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />
        <button className="submit-btn" onClick={handleLogin}>{t('login_btn')}</button>
      </div>
    )
  }

  return (
    <div className="app-container">
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
            <div className="success-icon">✅</div>
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
            )}

            <div className="input-container">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
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
              <h2>{t('stats')}</h2>
            </div>
            <div className="history-list">
              {history.map((item) => (
                <div key={item.id} className="history-item">
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
              ))}
            </div>
          </div>
        )}
      </main>

      <div className="lang-toggle" onClick={toggleLang}>
        <Icons.Languages size={20} />
      </div>
    </div>
  )
}

export default App
