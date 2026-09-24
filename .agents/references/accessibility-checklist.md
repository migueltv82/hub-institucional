# Accessibility Checklist

Use this checklist for UI work and browser verification.

## Semantics

- Use semantic HTML for headings, landmarks, buttons, links, forms, tables, and lists.
- Interactive elements must have accessible names.
- Do not use non-interactive elements as controls unless keyboard behavior and roles are correctly implemented.

## Keyboard and Focus

- All interactive controls are reachable by keyboard.
- Focus order follows the visual and logical order.
- Focus is visible.
- Modals, menus, dialogs, and popovers manage focus correctly.
- Escape, Enter, Space, and arrow-key behavior match user expectations for the component type.

## Forms

- Inputs have labels.
- Required state and validation errors are available to assistive technologies.
- Error messages identify the field and explain the correction.
- Disabled and loading states are perceivable.

## Visual

- Text contrast is sufficient.
- UI does not rely on color alone to communicate state.
- Content remains usable at common zoom levels and responsive breakpoints.
- Loading, empty, and error states are visible and understandable.

## Motion

- Avoid unnecessary motion.
- Respect reduced-motion preferences when using animation that can distract or disorient.

## Verification

- Inspect keyboard navigation manually for changed flows.
- Check the browser console for runtime errors.
- Use automated accessibility tooling when available, but do not treat it as a complete substitute for manual keyboard and screen-reader-oriented review.
