import { useState } from 'react'

const translations = {
  ja: {
    income: '収入',
    expense: '支出',
    amount: '金額を入力',
    category: 'カテゴリーを選択',
    submit: '保存',
    stats: '今月の収支',
    balance: '残高',
    food: '食費',
    daily: '日用品',
    transport: '交通費',
    entertainment: '交際費',
    others: 'その他',
    login: 'パスワードを入力',
    login_btn: 'ログイン',
    back: '戻る',
    success: '保存しました',
  },
  zh: {
    income: '收入',
    expense: '支出',
    amount: '输入金额',
    category: '选择类别',
    submit: '保存',
    stats: '本月收支',
    balance: '余额',
    food: '餐饮',
    daily: '日用',
    transport: '交通',
    entertainment: '娱乐',
    others: '其他',
    login: '请输入密码',
    login_btn: '登录',
    back: '返回',
    success: '已保存',
  }
}

export type Lang = 'ja' | 'zh'

export const useI18n = () => {
  const [lang, setLang] = useState<Lang>(() => {
    return (localStorage.getItem('lang') as Lang) || 'ja'
  })

  const t = (key: keyof typeof translations['ja']) => {
    return translations[lang][key] || key
  }

  const toggleLang = () => {
    const newLang = lang === 'ja' ? 'zh' : 'ja'
    setLang(newLang)
    localStorage.setItem('lang', newLang)
  }

  return { lang, t, toggleLang }
}
