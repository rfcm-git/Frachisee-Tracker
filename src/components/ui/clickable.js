/* Makes a non-button element (row, card) clickable with the mouse and the keyboard. */

/** Props for a clickable element: role, tabIndex, click and Enter / Space. */
export const clickableProps = (onActivate) => ({
  role: "button",
  tabIndex: 0,
  onClick: onActivate,
  onKeyDown: (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActivate(event); }
  },
});
