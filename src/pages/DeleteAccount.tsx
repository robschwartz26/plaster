/**
 * Delete Account — public route, accessible without auth.
 * Required by Google Play's Data Safety form (the "Delete account URL"): it must
 * name the app, show the exact steps to delete, and state what's removed/kept.
 * URL: https://plasterthewall.com/delete-account
 */

import { useNavigate } from 'react-router-dom'

const CONTACT_EMAIL = 'support@plasterthewall.com'

export function DeleteAccount() {
  const navigate = useNavigate()
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--fg)',
      padding: 'max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom))',
      maxWidth: 720,
      margin: '0 auto',
      fontFamily: '"Space Grotesk", sans-serif',
      fontSize: 14,
      lineHeight: 1.6,
    }}>
      <button
        onClick={() => navigate(-1)}
        style={{
          background: 'none', border: 'none', padding: '0 0 20px', cursor: 'pointer',
          color: 'var(--fg-55)', fontFamily: '"Barlow Condensed", sans-serif',
          fontWeight: 700, fontSize: 14, letterSpacing: '0.1em',
        }}
      >← BACK</button>

      <h1 style={{
        fontFamily: '"Playfair Display", serif',
        fontWeight: 900,
        fontSize: 32,
        margin: '0 0 8px 0',
      }}>Delete your Plaster account</h1>

      <p style={{ color: 'var(--fg-55)', fontSize: 13, margin: '0 0 32px 0' }}>
        Plaster · Plaster LLC
      </p>

      <p>
        You can delete your Plaster account and its associated data at any time.
        This page explains how, and what happens to your data.
      </p>

      <h2 style={h2}>Delete from within the app</h2>
      <ol style={ol}>
        <li>Open the <strong>Plaster</strong> app and sign in.</li>
        <li>Go to the <strong>YOU</strong> tab and tap the <strong>settings</strong> (gear) icon.</li>
        <li>Scroll to <strong>Delete account</strong>.</li>
        <li>Type <strong>DELETE</strong> to confirm.</li>
      </ol>
      <p>
        Your account is deleted immediately and you are signed out. This action
        cannot be undone.
      </p>

      <h2 style={h2}>Request deletion by email</h2>
      <p>
        If you can’t access the app, email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={link}>{CONTACT_EMAIL}</a>{' '}
        from the address on your account and ask us to delete it. We’ll verify
        ownership and remove your account within 30 days.
      </p>

      <h2 style={h2}>What is deleted</h2>
      <p>When you delete your account, we remove or anonymize your personal information, including:</p>
      <ul style={ul}>
        <li>Your email address, username, bio, and profile photos</li>
        <li>Your phone/email match data used for finding friends</li>
        <li>Your messages, wall posts, RSVPs, likes, and follows</li>
        <li>Your device push-notification tokens</li>
      </ul>

      <h2 style={h2}>What may be kept, and for how long</h2>
      <p>
        Some content may be <strong>anonymized</strong> rather than fully removed
        (for example, a post detached from your identity so a conversation still
        reads coherently for others). Residual copies in encrypted backups are
        purged within <strong>90 days</strong>. We may retain limited records
        where required by law.
      </p>

      <h2 style={h2}>Contact</h2>
      <p>
        Questions about deletion:{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={link}>{CONTACT_EMAIL}</a>.
      </p>
    </div>
  )
}

const h2: React.CSSProperties = {
  fontFamily: '"Barlow Condensed", sans-serif',
  fontWeight: 700, fontSize: 20, letterSpacing: '0.02em',
  margin: '28px 0 8px 0',
}
const ol: React.CSSProperties = { paddingLeft: 20, margin: '0 0 12px 0' }
const ul: React.CSSProperties = { paddingLeft: 20, margin: '0 0 12px 0' }
const link: React.CSSProperties = { color: 'var(--fg)', textDecoration: 'underline' }
