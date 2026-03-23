import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useI18n } from './hooks/useI18n'
import { 
  Utensils, 
  ShoppingBag, 
  Car, 
  Heart, 
  MoreHorizontal, 
  Lock, 
  Languages
} from 'lucide-react'
import './App.css'

type Category = 'food' | 'daily' | 'transport' | 'entertainment' | 'others'

function App() {
  const { t, toggleLang } = useI18n()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [password, setPassword] = useState('')
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [category, setCategory] = useState<Category | null>(null)
  const [amount, setAmount] = useState('')
  const [stats, setStats] = useState({ income: 0, expense: 0 })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const familyPassword = import.meta.env.VITE_FAMILY_PASSWORD || 'family123'

  useEffect(() => {
    const savedAuth = localStorage.getItem('isLoggedIn')
    if (savedAuth === 'true') setIsLoggedIn(true)
  }, [])

  useEffect(() => {
    if (isLoggedIn) {
      fetchStats()
    }
  }, [isLoggedIn])

  const fetchStats = async () => {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('transactions')
      .select('amount, type')
      .gte('created_at', startOfMonth.toISOString())

    if (error) console.error(error)
    if (data) {
      const totals = data.reduce(
        (acc: { income: number; expense: number }, item: any) => {
          if (item.type === 'income') acc.income += Number(item.amount)
          else acc.expense += Number(item.amount)
          return acc
        },
        { income: 0, expense: 0 }
      )
      setStats(totals)
    }
  }

  const handleLogin = () => {
    if (password === familyPassword) {
      setIsLoggedIn(true)
      localStorage.setItem('isLoggedIn', 'true')
    } else {
      alert('Wrong password')
    }
  }

  const handleReset = () => {
    setCategory(null)
    setAmount('')
    setType('expense')
    setMessage('')
  }

  const handleSubmit = async () => {
    if (!amount || (type === 'expense' && !category)) return

    setIsSubmitting(true)
    const { error } = await supabase.from('transactions').insert([
      {
        type,
        category: type === 'expense' ? category : null,
        amount: Number(amount),
      },
    ])

    setIsSubmitting(false)
    if (error) {
      alert(error.message)
    } else {
      setMessage(t('success'))
      fetchStats()
      setTimeout(() => {
        handleReset()
      }, 1500)
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-icon">
          <Lock size={32} />
        </div>
        <h2 style={{ fontWeight: 400 }}>{t('login')}</h2>
        <input
          type="password"
          className="login-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••"
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />
        <button className="submit-btn" onClick={handleLogin}>
          {t('login_btn')}
        </button>
      </div>
    )
  }

  return (
    <div className="app-container">
      <header>
        <div className="stats-card">
          <div className="stats-label">{t('stats')}</div>
          <div className="stats-value">
            <span style={{ color: 'var(--income)' }}>+{stats.income.toLocaleString()}</span>
            <span style={{ margin: '0 8px', color: 'var(--text-muted)' }}>/</span>
            <span style={{ color: 'var(--expense)' }}>-{stats.expense.toLocaleString()}</span>
          </div>
          <div className="stats-label" style={{ marginTop: '4px' }}>
            {t('balance')}: <span style={{ color: stats.income - stats.expense >= 0 ? 'var(--income)' : 'var(--expense)' }}>
              {(stats.income - stats.expense).toLocaleString()}
            </span>
          </div>
        </div>
      </header>

      <main className="main-content">
        {!message ? (
          <>
            <div className="mode-selector">
              <button
                className={`mode-btn ${type === 'expense' ? 'active expense' : ''}`}
                onClick={() => setType('expense')}
              >
                {t('expense')}
              </button>
              <button
                className={`mode-btn ${type === 'income' ? 'active income' : ''}`}
                onClick={() => setType('income')}
              >
                {t('income')}
              </button>
            </div>

            {type === 'expense' && (
              <div className="category-grid">
                {[
                  { id: 'food', icon: <Utensils size={20} /> },
                  { id: 'daily', icon: <ShoppingBag size={20} /> },
                  { id: 'transport', icon: <Car size={20} /> },
                  { id: 'entertainment', icon: <Heart size={20} /> },
                  { id: 'others', icon: <MoreHorizontal size={20} /> }
                ].map((cat) => (
                  <button
                    key={cat.id}
                    className={`category-btn ${category === cat.id ? 'selected' : ''}`}
                    onClick={() => setCategory(cat.id as Category)}
                  >
                    {cat.icon}
                    <span>{t(cat.id as any)}</span>
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
              disabled={isSubmitting || !amount || (type === 'expense' && !category)}
              onClick={handleSubmit}
              style={{ 
                opacity: isSubmitting || !amount || (type === 'expense' && !category) ? 0.5 : 1,
                background: type === 'expense' ? 'var(--expense)' : 'var(--income)',
                color: 'white'
              }}
            >
              {isSubmitting ? '...' : t('submit')}
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', animation: 'fadeIn 0.5s' }}>
            <div style={{ fontSize: '3rem', marginBottom: '20px' }}>✅</div>
            <h2>{message}</h2>
          </div>
        )}
      </main>

      <div className="lang-toggle" onClick={toggleLang}>
        <Languages size={20} />
      </div>
    </div>
  )
}

export default App
