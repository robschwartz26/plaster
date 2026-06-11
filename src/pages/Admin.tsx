import { StaffScreen } from '@/pages/StaffScreen'

// /admin is the unified staff dashboard — the same component as /staff, so admins
// land on the identical experience from either URL (back-compat for old links).
// Role gating lives inside StaffScreen: non-staff see the "Plaster staff" wall;
// admins get the full admin panel set (Preview·Review·Ingester·Auto-Ingest·Venues·
// Tools·Team). Every former Admin.tsx section now mounts via the dashboard panels
// (see components/admin/AdminTools.tsx) — nothing in components/admin was deleted.
export function Admin() {
  return <StaffScreen />
}
