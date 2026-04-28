import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Diamond } from '@/components/Diamond'

interface MentionUser {
  id: string
  username: string
  avatar_diamond_url: string | null
  avatar_url: string | null
  has_interacted: boolean
}

interface MentionInputProps {
  value: string
  onChange: (newValue: string) => void
  onSubmit?: () => void
  placeholder?: string
  maxLength?: number
  autoFocus?: boolean
  disabled?: boolean
  style?: React.CSSProperties
}

export function MentionInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  maxLength = 280,
  autoFocus = false,
  disabled = false,
  style,
}: MentionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [suggestions, setSuggestions] = useState<MentionUser[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeMentionStart, setActiveMentionStart] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Detect @-mention as user types: find the most recent '@' before the cursor
  // that isn't preceded by a non-whitespace char (so emails like 'a@b.com' don't trigger).
  const detectMention = useCallback((text: string, cursorPos: number) => {
    let i = cursorPos - 1
    while (i >= 0) {
      const ch = text[i]
      if (ch === '@') {
        const prev = i > 0 ? text[i - 1] : ' '
        if (i === 0 || /\s/.test(prev)) {
          const after = text.slice(i + 1, cursorPos)
          if (/^[A-Za-z0-9_]*$/.test(after)) {
            return { start: i, query: after }
          }
        }
        return null
      }
      if (/\s/.test(ch)) return null
      i--
    }
    return null
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value.slice(0, maxLength)
    onChange(newText)

    const cursorPos = e.target.selectionStart ?? newText.length
    const mention = detectMention(newText, cursorPos)

    if (mention && mention.query.length >= 2) {
      setActiveMentionStart(mention.start)
      setSearchQuery(mention.query)
      setShowDropdown(true)
    } else {
      setShowDropdown(false)
      setSuggestions([])
      setActiveMentionStart(null)
    }
  }

  useEffect(() => {
    if (!showDropdown || searchQuery.length < 2) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const fetchSuggestions = async () => {
      const { data, error } = await supabase.rpc('search_users', { p_query: searchQuery })
      if (cancelled) return
      if (!error && data) setSuggestions(data as MentionUser[])
    }
    fetchSuggestions()
    return () => { cancelled = true }
  }, [searchQuery, showDropdown])

  const commitMention = (user: MentionUser) => {
    if (activeMentionStart === null) return
    const before = value.slice(0, activeMentionStart)
    const cursorPos = textareaRef.current?.selectionStart ?? value.length
    const after = value.slice(cursorPos)
    const newText = `${before}@${user.username} ${after}`
    onChange(newText)
    setShowDropdown(false)
    setSuggestions([])
    setActiveMentionStart(null)
    setTimeout(() => {
      const ta = textareaRef.current
      if (ta) {
        const newCursor = activeMentionStart + user.username.length + 2
        ta.focus()
        ta.setSelectionRange(newCursor, newCursor)
      }
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && e.key === 'Escape') {
      e.preventDefault()
      setShowDropdown(false)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div style={{ position: 'relative', flex: 1, ...style }}>
      {showDropdown && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--bg)',
            border: '1px solid var(--fg-15)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            maxHeight: 280,
            overflowY: 'auto',
            zIndex: 100,
          }}
        >
          {suggestions.map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commitMention(u) }}
              style={{
                width: '100%',
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: '"Space Grotesk", sans-serif',
              }}
            >
              <Diamond diamondUrl={u.avatar_diamond_url} fallbackUrl={u.avatar_url} size={28} />
              <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 700 }}>@{u.username}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        rows={1}
        style={{
          width: '100%',
          resize: 'none',
          background: 'var(--fg-08)',
          border: '1px solid var(--fg-15)',
          borderRadius: 8,
          padding: '6px 8px',
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 13,
          color: 'var(--fg)',
          lineHeight: 1.4,
          outline: 'none',
          minHeight: 32,
          maxHeight: 96,
          overflowY: 'auto',
        }}
        onInput={(e) => {
          const el = e.currentTarget
          el.style.height = 'auto'
          el.style.height = Math.min(el.scrollHeight, 96) + 'px'
        }}
      />
    </div>
  )
}
