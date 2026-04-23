# Admin Component Known Bugs

Do not fix these during the refactor — extract code only, no logic changes.

## AdminBottomNav — stale tab labels

The bottom nav inside AdminDashboard hard-codes tab labels that may not match the current navigation (e.g. "Tonight" → "LINE UP", "Venues" → "MSG"). Fix after refactor is complete.

## ImportForm — double venue fetch

ImportForm fetches the venues list from Supabase on its own mount. AdminDashboard also fetches venues at the top level. This means two identical queries run on every import form load. Consolidate into a single fetch with prop-drilling or shared context after refactor is complete.
