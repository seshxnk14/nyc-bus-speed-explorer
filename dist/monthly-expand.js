const panel = document.querySelector('.month-panel');
const dialog = document.getElementById('monthly-dialog');
const content = document.getElementById('monthly-dialog-content');
const expand = document.getElementById('expand-monthly');
const close = document.getElementById('close-monthly');
const tooltip = document.getElementById('tooltip');
const panelAnchor = document.createComment('Monthly chart position');
const tooltipAnchor = document.createComment('Tooltip position');
panel.before(panelAnchor);
tooltip.before(tooltipAnchor);

function closeChart() {
  if (dialog.open) dialog.close();
}

expand.addEventListener('click', () => {
  if (dialog.open) return;
  document.getElementById('monthly-dialog-context').textContent =
    document.getElementById('context')?.textContent || 'Monthly road speed';
  tooltip.hidden = true;
  content.append(panel);
  dialog.append(tooltip);
  document.body.classList.add('monthly-dialog-open');
  dialog.showModal();
  close.focus();
});

close.addEventListener('click', closeChart);

dialog.addEventListener('close', () => {
  tooltip.hidden = true;
  panelAnchor.after(panel);
  tooltipAnchor.after(tooltip);
  document.body.classList.remove('monthly-dialog-open');
  expand.focus();
});

// Native dialog supplies Escape handling, focus containment, and an inert background.
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) closeChart();
});
