# Unrestricted internal POS scheduling

Owner and active Manager scheduling exceptions are derived from workspace records by `assertOperator` and rechecked in the write transaction. Client role flags never grant access. Other operators keep existing restrictions.

Manual and catalog POS paths accept valid past, current and future calendar dates and exact 24-hour times, ignoring Store hours, day availability, blackout dates, advance windows and weekly cutoff rules for privileged operators. Weekly plans retain their actual catalog menu, valid Monday and five component allocations; missing menus are not synthesized. Historical fulfilment dates remain separate from the current creation timestamp. No migration or changes to existing orders, payment records, totals, payment confirmation or dispatch behavior are made.

Public date generation on both client and server requires at least the next Store-local calendar day. Public delivery already enforces the same minimum. Public callers never receive the internal scheduling exception.

Validation: TypeScript; all Store model/component tests; all Functions tests. New regression cases cover Owner and Manager historical custom orders for Pickup and Delivery, preserved timestamps and dates, historical and distant catalog orders, historical dated weekly plans and Sets, canonical prices, invalid schedule rejection, and public zero-day/spoofed-role date rejection. Protected Beta CI and live Beta QA must pass before Production.
