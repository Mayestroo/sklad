# Ticket 1: UI: Migrate Select Component to React Portal with Floating Coordinates & Overflow Clipping Fix

## Parent

Part of #32

## What to build

Refactor `frontend/src/components/ui/Select.tsx` to render the floating dropdown menu via `createPortal(..., document.body)`:
- Compute trigger coordinates (`top`, `bottom`, `left`, `width`) on open and during scroll/resize.
- Use `position: fixed` and `z-index: 99999` to ensure the menu floats above all parent cards, tables, scroll containers (`overflow-x: auto`), and subsequent buttons (`+ Qator qo‘shish`).
- Implement Smart Flip to open upward if space below is < 260px and space above is greater.
- Maintain search input autofocus, keyboard shortcuts, click-outside dismissal, and pinned action buttons (`onCreateNew`).

## Acceptance criteria

- [ ] Select dropdown renders in `document.body` via React Portal without any clipping from table containers.
- [ ] Dropdown stays correctly anchored to the trigger button during window and container scroll.
- [ ] Smart flip opens upward when near the bottom of the viewport.
- [ ] Clicking outside or pressing `Escape` closes the dropdown cleanly.
- [ ] Preserves all existing features (search filter, custom action bar, icons, labels).

## Blocked by

- None — can start immediately.
