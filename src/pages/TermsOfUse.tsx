/**
 * Terms of Use — public route at /terms.
 *
 * Linked from signup checkbox and from the privacy policy.
 * Reviewed by Apple App Store reviewers.
 *
 * Content satisfies Apple Guideline 1.2: app contains an EULA
 * with explicit prohibition of objectionable content and a
 * mechanism for users to acknowledge agreement before using.
 */

const EFFECTIVE_DATE = 'June 16, 2026'
const CONTACT_EMAIL = 'support@plasterthewall.com'

export function TermsOfUse() {
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
      }}>plaster terms of use</h1>

      <p style={{ color: 'var(--fg-55)', fontSize: 13, margin: '0 0 32px 0' }}>
        Effective {EFFECTIVE_DATE}
      </p>

      <p>
        Welcome to Plaster, a community app for discovering live music and
        events in Portland, Oregon. By creating an account or using Plaster,
        you agree to these Terms of Use. If you don't agree, please don't
        use the app.
      </p>

      <h2 style={h2}>Who can use Plaster</h2>
      <p>
        You must be at least 13 years old to use Plaster. By using the app,
        you confirm you meet this requirement. If you are between 13 and 18,
        you confirm you have permission from a parent or guardian.
      </p>
      <p>
        You agree to provide accurate information when creating your account
        and to keep your login credentials secure. You're responsible for
        anything that happens under your account.
      </p>

      <h2 style={h2}>Acceptable use</h2>
      <p>
        Plaster is a community space. To keep it that way, you agree
        <strong> not</strong> to post, share, send, or otherwise distribute content that:
      </p>
      <ul style={ul}>
        <li>Is harassing, threatening, or abusive toward another person</li>
        <li>Promotes hatred or discrimination based on race, ethnicity,
            religion, gender, sexual orientation, disability, or any other
            protected characteristic</li>
        <li>Is sexually explicit, lewd, or pornographic</li>
        <li>Depicts or glorifies violence, self-harm, or dangerous activities</li>
        <li>Promotes illegal activity or violates any applicable law</li>
        <li>Infringes someone else's intellectual property, privacy, or other rights</li>
        <li>Is spam, deceptive, or designed to mislead other users</li>
        <li>Impersonates another person or misrepresents your identity</li>
        <li>Contains malware, exploits, or attempts to compromise the service or its users</li>
      </ul>
      <p>
        We reserve the right to remove any content that violates these terms,
        suspend or terminate accounts of users who violate these terms, and
        cooperate with law enforcement when we receive valid legal requests.
      </p>

      <h2 style={h2}>Reporting and moderation</h2>
      <p>
        If you encounter content or behavior that violates these terms, you
        can report it from inside the app. We review every report and take
        appropriate action, which may include removing content, warning users,
        or terminating accounts. Reports are reviewed by humans and are not
        anonymous to us, but we don't share reporter identity with the user
        being reported.
      </p>
      <p>
        You can also block other users to prevent them from interacting with
        you. Blocked users cannot see your profile, posts, or messages.
      </p>

      <h2 style={h2}>Your content</h2>
      <p>
        You keep ownership of the content you create on Plaster. By posting
        content, you grant us a non-exclusive, worldwide license to host,
        display, and distribute that content within the app and to other
        users as part of the normal operation of the service. This license
        ends when you delete your content or your account, except where
        the content has been re-shared by other users (those copies persist
        until those users delete them).
      </p>
      <p>
        You are responsible for the content you post. Don't post anything
        you don't have the right to share.
      </p>

      <h2 style={h2}>Copyright (DMCA)</h2>
      <p>
        If you believe content on Plaster infringes your copyright, send a
        notice to{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#A855F7' }}>{CONTACT_EMAIL}</a>{' '}
        with: (1) identification of the copyrighted work, (2) identification
        of the infringing material and where it appears in Plaster, (3) your
        contact information, (4) a statement that you have a good faith
        belief the use is not authorized, (5) a statement under penalty of
        perjury that the information is accurate and you are the rights
        holder or authorized to act on their behalf, and (6) your physical
        or electronic signature. Submitting false claims may have legal
        consequences.
      </p>

      <h2 style={h2}>Termination</h2>
      <p>
        You can delete your account at any time from the You tab in the app.
        We may suspend or terminate your access to Plaster at our discretion
        if you violate these terms or engage in conduct that harms the
        community or the service.
      </p>

      <h2 style={h2}>Event listings and third-party content</h2>
      <p>
        Event listings on Plaster are compiled from venue websites, public
        announcements, and submissions by our staff and users. We work to keep
        them accurate, but details — dates, times, prices, and availability —
        can change or be canceled at any time. Always confirm with the venue
        before making plans; Plaster does not guarantee the accuracy of any
        listing.
      </p>
      <p>
        Event poster artwork and promotional images belong to their respective
        venues, artists, and promoters. We display them to inform users about
        events, not to claim any ownership of them. Listing an event does not
        imply affiliation with, or endorsement by, the venue or artist.
      </p>
      <p>
        If you are a venue, artist, or rights holder and would like a listing or
        image corrected or removed, contact us at the address in the Contact
        section below (<a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#A855F7' }}>{CONTACT_EMAIL}</a>)
        and we will respond promptly.
      </p>

      <h2 style={h2}>Community posts and neighborhood content</h2>
      <p>
        The community wall lets you post neighborhood content — items for sale,
        yard sales, local notices, lost-pet alerts, and the like. These posts are
        user-generated: the person who posts is solely responsible for their
        content and its accuracy.
      </p>
      <p>
        Don't post any of the following. We may remove any post and suspend
        accounts at our discretion:
      </p>
      <ul style={ul}>
        <li>Illegal goods or services, weapons, drugs, or alcohol/tobacco sales</li>
        <li>Recalled or stolen items</li>
        <li>Hate, harassment, spam, scams, or adult content</li>
        <li>Anything else unlawful or unsafe</li>
      </ul>
      <p>
        Plaster is <strong>not</strong> a party to any sale, trade, or transaction
        between users, and is not responsible for goods, payments, item condition,
        delivery, or in-person meetups. Arrange any exchange safely and at your own
        risk, and meet in public places.
      </p>
      <p>
        Lost-pet alerts and other neighbor-help posts are a community courtesy —
        Plaster doesn't guarantee any response or outcome.
      </p>
      <p>
        By posting, you grant Plaster a non-exclusive license to display your
        content within the app. You keep ownership of what you post, and you can
        request removal via the Contact section below.
      </p>

      <h2 style={h2}>Disclaimers</h2>
      <p>
        Plaster is provided "as is" without warranties of any kind. We don't
        guarantee the app will be uninterrupted, error-free, or available
        at all times. Event listings come from various sources and we
        don't guarantee accuracy. Always confirm event details with the
        venue or organizer before attending.
      </p>

      <h2 style={h2}>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Plaster and its operators
        are not liable for indirect, incidental, special, consequential, or
        punitive damages arising from your use of the app. Total liability
        for any claim is limited to $50.
      </p>

      <h2 style={h2}>Changes to these terms</h2>
      <p>
        We may update these terms from time to time. When we make significant
        changes, we'll update the Effective date and may notify you in the
        app. Continued use after changes take effect means you accept the
        updated terms.
      </p>

      <h2 style={h2}>Governing law</h2>
      <p>
        These terms are governed by the laws of the State of Oregon, United
        States, without regard to its conflict-of-laws principles.
      </p>

      <h2 style={h2}>Contact</h2>
      <p>
        Questions about these terms? Email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#A855F7' }}>{CONTACT_EMAIL}</a>.
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

const ul: React.CSSProperties = {
  margin: '0 0 12px 0',
  paddingLeft: 20,
}
