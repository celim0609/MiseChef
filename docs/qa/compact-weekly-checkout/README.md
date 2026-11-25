# Compact Weekly Menu checkout (Beta QA refinement)

UI-only refinement on deployed Beta 01902e8. The time reducer, propagation, explicit override confirmation, reset semantics, backend validation and all delivery pricing Functions remain unchanged.

One general selector precedes five compact daily rows. Each row always shows date, meal name, resolved clock time and address readiness; time/address overrides are labelled. Edit exposes only that day's controls with aria-expanded/aria-controls; Done collapses them. Changing the general time still clears per-date times, and preserving old overrides still requires the existing explicit confirmation. The daily editor initially displays the resolved time; Reset to general clears the same optional day value as before. Closing/reopening checkout or changing service week collapses editors. Outstanding address selections are invalidated when an editor unmounts.

The daily rows themselves remain the final schedule before payment, removing the duplicate five-line summary. Single-date checkout retains its final summary. Payment footer now uses normal document flow and safe-area padding, rather than floating over Friday's controls. All controls remain inside the existing payment-preparation disabled fieldset.

Validation: TypeScript, all 905 frontend/model tests, protected Beta build. Existing time integrity regressions remain unchanged. New presentation tests cover five resolved times, collapsed controls, meal names, overrides, missing addresses and non-overlay footer. Browser fixture used actual shared components at 390x844 and 1280x900: Friday Edit/Done, keyboard Enter, general propagation, explicit override preservation, no horizontal overflow and measured Friday/footer clearance. Synthetic fixtures made no payments, orders or provider bookings.

Release only through protected full-resource Beta Release CI. No Production deployment or settings/data changes.
