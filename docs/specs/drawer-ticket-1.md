# Ticket 1: Core Slide-Over Drawer UI Component & Accessibility Framework

## Parent

Part of #19

## What to build

Build a universal, reusable `Drawer` component (`frontend/src/components/ui/Drawer.tsx`) supporting right-anchored slide-over panels with backdrop blur, sticky headers, sticky footers, and accessible keyboard hotkeys.

## Acceptance criteria

- [ ] `Drawer` supports customizable width variants (`sm`: 420px, `md`: 560px, `lg`: 720px, `xl`: 900px, `full`: 100%).
- [ ] Smooth slide transition with backdrop overlay and `backdrop-filter: blur(4px)`.
- [ ] Sticky header with title, subtitle, icon, and dismiss button (`✕`).
- [ ] Scrollable content body with isolated overflow.
- [ ] Sticky footer with configurable action buttons (e.g. `Saqlash` and `Bekor qilish`).
- [ ] `Escape` key closes the drawer; `Ctrl+Enter` / `Cmd+Enter` submits the form.
- [ ] Body scrolling is locked when the drawer is open.
- [ ] Mobile responsive: full-width on screens below 640px.

## Blocked by

- None — can start immediately.
