# T2 — Warehouse State Machine & Quick In-Table Status Switcher

**Parent:** #73
**GitHub Issue:** #75
**Status:** ready-for-agent
**Blocked by:** #74

## What to build
Provide the warehouse operational state machine (`NEW` -> `ACCEPTED` -> `PROCESSING` -> `READY_FOR_SHIPMENT`) with role permissions (`SELLER`, `WAREHOUSE`, `ADMIN`). Provide a real-time status switcher dropdown inside the Sales Orders list table so the warehouse manager can advance order statuses in 1 click without navigating inside each document.

## Acceptance criteria
- [ ] Backend PATCH/POST status transition endpoint supports `ACCEPTED`, `PROCESSING`, `READY_FOR_SHIPMENT`.
- [ ] Role guarding: `WAREHOUSE` / `ADMIN` roles can advance warehouse stages.
- [ ] Sales orders list table displays current status badge and interactive dropdown with next allowed transitions for warehouse operators.
- [ ] Optimistic or immediate UI update upon status change.
- [ ] Automated tests verify permitted and forbidden status transitions by role.
