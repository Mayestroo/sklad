# Ticket 1: Universal Select Pinned Action Bar Enhancement

## Parent

Part of #25

## What to build

Enhance `frontend/src/components/ui/Select.tsx` with `onCreateNew?: (searchQuery?: string) => void` and `createNewLabel?: string` props. Render a sticky, prominent top action bar above the dropdown options that stays visible even during search filtering.

## Acceptance criteria

- [ ] `CustomSelectProps` accepts `onCreateNew` callback and optional `createNewLabel`.
- [ ] Dropdown menu renders a top pinned action bar with a `Plus` icon and clear accent styling.
- [ ] The pinned action bar remains visible and clickable when filtering via search input.
- [ ] Clicking the action bar passes the current `searchQuery` to `onCreateNew()` and closes the dropdown menu.
- [ ] Maintains full keyboard accessibility and theme consistency.

## Blocked by

- None — can start immediately.
