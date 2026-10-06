# Responsive UI Design Standards (PC, iPad, Mobile)

This rule defines the core standards for responsive, modern, compact, and maintainable UI design across the IAL Systems accounting & warehouse codebase.

## 1. 12-Column Responsive Grid Architecture
Never use rigid `grid-cols-5` or `grid-cols-6` without multi-span rules, as it crushes vital inputs like Barcode into ~160px widths on tablet/mobile screens.

Always use the **12-Column Fluid Grid Pattern**:
```tsx
<div className="grid grid-cols-2 sm:grid-cols-6 lg:grid-cols-12 gap-2 sm:gap-2.5 items-end">
  {/* Selector / Combobox: 2 cols on PC, 2 on iPad, full on mobile */}
  <div className="col-span-2 sm:col-span-2 lg:col-span-2">...</div>

  {/* Hero Field (Barcode / Search / Primary Input): Generous width! */}
  <div className="col-span-2 sm:col-span-3 lg:col-span-3">...</div>

  {/* Compact Fields (Date / Zone / COD / Shelf): 1-2 cols */}
  <div className="col-span-1 sm:col-span-1 lg:col-span-1">...</div>

  {/* Action / Submit Button: 2 cols on PC, 2 on iPad */}
  <div className="col-span-1 sm:col-span-2 lg:col-span-2">...</div>
</div>
```

### Breakpoint Matrix:
- **PC / Ultra-Wide (`lg:` or `xl:`):** 12 columns layout. All elements align on a single clean row or 2 balanced rows.
- **iPad / Tablet (`sm:` to `md:`, 640px - 1024px):** Naturally folds into two balanced 6-column rows (Row 1: Selectors; Row 2: Hero Barcode + Date + Action).
- **Mobile (`<640px`):** 2 columns. Hero input and long comboboxes take full width (`col-span-2`), compact fields pair 1-to-1 (`col-span-1`).

---

## 2. Micro-Cramming Prevention in Labels
- **Golden Rule:** Form `<label>` tags must contain ONLY the field title and mandatory indicator (e.g. `លេខ Barcode / Tracking *`).
- **Never jam:**
  - ❌ Do NOT put long warning texts (e.g. `🔒 ត្រូវរើស Driver & Truck មុន`) inside the label row. Put lock notices in the **Input Placeholder** or a guidance banner above the form.
  - ❌ Do NOT put multiple toggles and badges in a single label `<div className="flex justify-between">`.
  - ✔️ Keep toggles as compact micro-pills (`text-[9.5px] font-bold px-2 py-0.5 rounded-lg`).
  - ✔️ Use `whitespace-nowrap` on labels so Khmer font renders clearly without truncating into `...`.

---

## 3. Responsive Header & Action Toolbars
- Use uniform heights (`h-8`) and border-radius (`rounded-xl`).
- On small screens (Mobile/Tablet), collapse text labels into clean icons with tooltips (`<span className="hidden sm:inline">...</span>` or `<span className="hidden md:inline">...</span>`).
- Ensure toolbar containers have `flex-wrap` and `overflow-x-auto no-scrollbar` to prevent horizontal viewport breakout.

---

## 4. Modern Aesthetic Guidelines
- **Palette:** Curated semantic colors (Emerald for Inbound, Amber for Outbound, Blue for Delivery, Purple for Hold, Cyan for Actions).
- **Shadows:** Use ultra-subtle shadows (`shadow-2xs`, `shadow-xs`) with micro-borders (`border-slate-200/90 dark:border-slate-800/80`).
- **Input Styling:** Rounded-xl inputs with `h-8` or `h-9`, mono font for codes, subtle focus rings (`focus:ring-2 focus:ring-cyan-500`).
