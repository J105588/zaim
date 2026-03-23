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
    food: '食',
    daily: '日用品',
    transport: '交通',
    entertainment: '娯楽',
    others: 'その他',
    login: 'ログイン',
    login_desc: '家族のための家計簿システム',
    login_btn: 'ログイン',
    back: '戻る',
    success: '保存しました',
    no_data: '情報がありません',
    prev_month: '前月',
    next_month: '次月',
    month_stats: '収支一覧',
    delete_confirm_title: '削除の確認',
    delete_confirm_msg: 'この項目を削除してもよろしいですか？',
    cancel: 'キャンセル',
    delete_btn: '削除する',
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
    login: '登录',
    login_desc: '家庭财务收支管理系统',
    login_btn: '登录',
    back: '返回',
    success: '已保存',
    no_data: '暂无数据',
    prev_month: '上个月',
    next_month: '下个月',
    month_stats: '月收支概览',
    delete_confirm_title: '确认删除',
    delete_confirm_msg: '您确定要删除这一条目吗？',
    cancel: '取消',
    delete_btn: '确认删除',
  },
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
