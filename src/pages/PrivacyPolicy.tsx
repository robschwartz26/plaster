/**
 * Privacy Policy — public route, accessible without auth.
 * Linked from Apple App Store listing and from in-app Settings.
 *
 * Update both EFFECTIVE_DATE and any factual claims whenever data
 * practices or features change. Do NOT add features that don't exist.
 */

const EFFECTIVE_DATE = 'May 6, 2026'
const CONTACT_EMAIL = 'plasterpdx@gmail.com'

export function PrivacyPolicy() {
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
      <h1 style={{
        fontFamily: '"Playfair Display", serif',
        fontWeight: 900,
        fontSize: 32,
        margin: '0 0 8px 0',
      }}>plaster privacy policy</h1>

      <p style={{ color: 'var(--fg-55)', fontSize: 13, margin: '0 0 32px 0' }}>
        Effective {EFFECTIVE_DATE}
      </p>

      <p>
        Plaster is a community app for discovering live music and events
        in Portland, Oregon. We take your privacy seriously and aim to
        collect as little personal information as possible. This policy
        explains what we collect, how we use it, who we share it with,
        and the choices you have.
      </p>

      <h2 style={h2}>What we collect</h2>

      <h3 style={h3}>Information you give us</h3>
      <p>When you create an account, we collect:</p>
      <ul style={ul}>
        <li>Your email address and password (used for account access)</li>
        <li>A username you choose</li>
        <li>Optional profile content: a display name, a short bio, profile photos you upload</li>
        <li>Your interests (optional, used to personalize your experience)</li>
      </ul>

      <h3 style={h3}>Things you create in the app</h3>
      <p>When you use Plaster, we store:</p>
      <ul style={ul}>
        <li>Events you mark as attended or interested</li>
        <li>Wall posts you write on event pages</li>
        <li>Likes and reactions you give to posts and events</li>
        <li>Direct messages you send and the conversations you're part of</li>
        <li>People you follow and friend connections</li>
        <li>Notifications you receive (mentions, likes, friend requests)</li>
        <li>Your block, mute, and report records (used to enforce moderation)</li>
      </ul>

      <h3 style={h3}>Behavioral information</h3>
      <p>To make Plaster better, we record:</p>
      <ul style={ul}>
        <li>
          Which events you view in the app, deduplicated to one record per
          event per day. We use this for popularity rankings.
        </li>
        <li>
          When you last opened the app or read messages, so we can show you
          what's new.
        </li>
      </ul>

      <h3 style={h3}>Location</h3>
      <p>
        On the Map screen, Plaster requests permission to use your device's
        location to show you events near you. We <strong>do not store</strong>{' '}
        your location on our servers. Your location stays on your device and
        is used only to position the map. You can deny location permission
        and still use the rest of the app.
      </p>

      <h3 style={h3}>What we do not collect</h3>
      <p>Plaster does not collect:</p>
      <ul style={ul}>
        <li>Your phone number or real name</li>
        <li>Your date of birth or age</li>
        <li>Your contacts, photos library, or calendar</li>
        <li>
          Information from third-party advertising networks or analytics
          services (we don't use any)
        </li>
      </ul>

      <h2 style={h2}>How we use your information</h2>
      <p>We use what we collect to:</p>
      <ul style={ul}>
        <li>Provide the app's core features (showing you events, messages, posts, friends)</li>
        <li>Authenticate you so only you can access your account</li>
        <li>Show you content from people you follow and events you might like</li>
        <li>Notify you about activity that involves you (mentions, replies, likes)</li>
        <li>Rank events by popularity for the Wall</li>
        <li>Enforce blocks, mutes, and content moderation actions</li>
        <li>Detect and prevent abuse, spam, and security threats</li>
      </ul>

      <p>
        We do not sell or share your personal information with third parties
        for their own marketing or advertising purposes. We do not use your
        information for advertising.
      </p>

      <h2 style={h2}>Who we share information with</h2>

      <h3 style={h3}>Service providers</h3>
      <p>
        Plaster runs on infrastructure from trusted vendors who process data
        on our behalf:
      </p>
      <ul style={ul}>
        <li>
          <strong>Supabase</strong> — hosts our database and handles authentication.
          Your account, profile, and content are stored on Supabase servers.
        </li>
        <li>
          <strong>Vercel</strong> — hosts the Plaster web app and serverless functions.
          Vercel may automatically log standard request information (such as IP
          addresses) as part of its hosting infrastructure, governed by{' '}
          <a href="https://vercel.com/legal/privacy-policy" style={{ color: '#A855F7' }}>
            Vercel's privacy policy
          </a>.
        </li>
        <li>
          <strong>Mapbox</strong> — provides the map tiles you see on the Map screen.
          Mapbox receives general region requests but not your specific location.
        </li>
        <li>
          <strong>KLIPY</strong> — provides the GIF picker. When you search for or
          send a GIF, your search query and the GIF you choose are processed by KLIPY.
        </li>
      </ul>

      <h3 style={h3}>Other Plaster users</h3>
      <p>
        Some information you create in Plaster is, by design, visible to
        other users:
      </p>
      <ul style={ul}>
        <li>Your username, profile photo, bio, and interests are visible to anyone with an account</li>
        <li>Wall posts, replies, and likes are visible to others who can see the related event</li>
        <li>Direct messages are visible only to the people in that conversation</li>
        <li>You can choose whether your follower and following lists are public in your settings</li>
      </ul>
      <p>
        We do not notify other users when you mute, block, or report them.
      </p>

      <h3 style={h3}>Legal requests</h3>
      <p>
        We may share information when required by law, valid legal process,
        or to protect Plaster, our users, or the public from harm.
      </p>

      <h2 style={h2}>Your choices and rights</h2>

      <h3 style={h3}>Manage your account</h3>
      <p>
        You can edit your profile, change your privacy settings, or delete
        your account from the You tab in the app. Deleting your account
        permanently removes your profile, posts, messages, and other personal
        content from our active database within 30 days.
      </p>

      <h3 style={h3}>Block, mute, and report</h3>
      <p>
        You can block another user to prevent any further interaction —
        blocked users cannot see your profile, posts, or messages, and you
        cannot see theirs. You can mute a user to hide their content from your
        feeds while still allowing them to see yours. You can report any
        profile, post, or message that violates our community standards. We
        review reports and take appropriate action, including content removal
        and account suspension where warranted.
      </p>

      <h3 style={h3}>Location permission</h3>
      <p>
        You can deny or revoke Plaster's location permission at any time
        through your device's settings. The Map screen will still work but
        won't be able to center on your location.
      </p>

      <h3 style={h3}>Push notifications</h3>
      <p>
        You can disable push notifications from Plaster at any time through
        your device's settings.
      </p>

      <h2 style={h2}>U.S. state privacy rights</h2>
      <p>
        Depending on where you live, U.S. state privacy laws may give you
        certain rights over your personal information, including the right to:
      </p>
      <ul style={ul}>
        <li>Know what personal information we have about you</li>
        <li>Request a copy of your information</li>
        <li>Correct inaccurate information</li>
        <li>Delete your information</li>
        <li>Opt out of the "sale" or "sharing" of your personal information for cross-context behavioral advertising</li>
      </ul>
      <p>
        We do not sell or share personal information for cross-context
        behavioral advertising. To exercise any of these rights, contact us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#A855F7' }}>{CONTACT_EMAIL}</a>.
      </p>

      <h2 style={h2}>European users (GDPR)</h2>
      <p>
        If you are in the European Economic Area, the United Kingdom, or
        Switzerland, you have rights under the General Data Protection
        Regulation, including:
      </p>
      <ul style={ul}>
        <li>Access — request a copy of the personal information we hold about you</li>
        <li>Rectification — request that we correct inaccurate information</li>
        <li>Erasure — request that we delete your personal information</li>
        <li>Restriction — request that we limit how we process your information</li>
        <li>Objection — object to certain types of processing</li>
        <li>Portability — request your information in a portable format</li>
        <li>Withdraw consent — where processing is based on consent</li>
        <li>Lodge a complaint with your local data protection authority</li>
      </ul>
      <p>
        Our legal basis for processing your information is, depending on
        the activity: your consent (for optional features), the performance
        of a contract (to provide the app to you), our legitimate interest
        (for security, abuse prevention, and product improvement), or
        compliance with legal obligations.
      </p>
      <p>
        To exercise your rights, contact us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#A855F7' }}>{CONTACT_EMAIL}</a>.
      </p>

      <h2 style={h2}>Children</h2>
      <p>
        Plaster is not intended for children under 13. We do not knowingly
        collect personal information from children under 13. If we learn that
        we have done so, we will delete the information promptly. If you
        believe a child under 13 has provided us with personal information,
        please contact us.
      </p>

      <h2 style={h2}>Data security</h2>
      <p>
        We use commonly accepted practices to protect your data, including
        encryption in transit (HTTPS) and access controls on stored data.
        No system is perfectly secure, and we cannot guarantee absolute
        security.
      </p>

      <h2 style={h2}>Data retention</h2>
      <p>
        We keep your information for as long as your account is active. When
        you delete your account, we remove your personal information from
        our active database within 30 days. Some information may persist in
        encrypted backups for a limited time before being permanently erased.
      </p>

      <h2 style={h2}>International data transfers</h2>
      <p>
        Plaster is operated from the United States. By using Plaster, you
        understand that your information will be processed in the United
        States, which may have different data protection laws than your
        country. Where required, we rely on appropriate transfer mechanisms
        such as Standard Contractual Clauses to protect your information.
      </p>

      <h2 style={h2}>Changes to this policy</h2>
      <p>
        We may update this policy from time to time. When we make significant
        changes, we'll update the "Effective" date above and may notify you
        in the app. Your continued use of Plaster after changes take effect
        means you accept the updated policy.
      </p>

      <h2 style={h2}>Contact us</h2>
      <p>
        If you have questions about this privacy policy or your data,
        contact us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#A855F7' }}>
          {CONTACT_EMAIL}
        </a>.
      </p>

      <p style={{ marginTop: 48, color: 'var(--fg-55)', fontSize: 12 }}>
        © {new Date().getFullYear()} Plaster. All rights reserved.
      </p>
    </div>
  )
}

const h2: React.CSSProperties = {
  fontFamily: '"Playfair Display", serif',
  fontWeight: 900,
  fontSize: 22,
  margin: '36px 0 12px 0',
}

const h3: React.CSSProperties = {
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 700,
  fontSize: 15,
  margin: '20px 0 6px 0',
}

const ul: React.CSSProperties = {
  margin: '0 0 12px 0',
  paddingLeft: 20,
}
