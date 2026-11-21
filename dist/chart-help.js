document.querySelectorAll('.chart-help-toggle').forEach(button => {
  const guide = document.getElementById(button.getAttribute('aria-controls'));
  const setOpen = open => {
    guide.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => setOpen(guide.hidden));
  button.closest('section').addEventListener('keydown', event => {
    if (event.key === 'Escape' && !guide.hidden) {
      setOpen(false);
      button.focus();
      event.preventDefault();
      event.stopPropagation();
    }
  });
});
