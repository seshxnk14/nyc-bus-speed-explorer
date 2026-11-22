const styleLink = document.createElement('link');
styleLink.rel = 'stylesheet';
styleLink.href = new URL('./heatmap-dialog.css', import.meta.url).href;
const styleReady = new Promise((resolve, reject) => {
  styleLink.addEventListener('load', resolve, {once: true});
  styleLink.addEventListener('error', () => reject(new Error('Could not load heatmap-dialog.css')), {once: true});
});
document.head.append(styleLink);
styleReady.catch(() => {});
const panel = document.querySelector('.heat-panel');
const dialog = document.getElementById('heatmap-dialog');
const content = document.getElementById('heatmap-dialog-content');
const expand = document.getElementById('expand-heatmap');
const close = document.getElementById('close-heatmap');
const tooltip = document.getElementById('tooltip');
const panelAnchor = document.createComment('Heatmap chart position');
const tooltipAnchor = document.createComment('Tooltip position');
panel.before(panelAnchor);
tooltip.before(tooltipAnchor);

function closeChart() {
  if (dialog.open) dialog.close();
}

expand.addEventListener('click', async () => {
  try { await styleReady; } catch {
    alert('The heatmap stylesheet could not load. Place heatmap-dialog.css in dist and refresh.');
    return;
  }
  if (dialog.open) return;
  document.getElementById('heatmap-dialog-context').textContent =
    document.getElementById('context')?.textContent || 'Hourly speed vs. usual';
  tooltip.hidden = true;
  content.append(panel);
  dialog.append(tooltip);
  document.body.classList.add('heatmap-dialog-open');
  dialog.showModal();
  document.getElementById('heatmap').dispatchEvent(new Event('heatmap-layout'));
  close.focus();
});

close.addEventListener('click', closeChart);

dialog.addEventListener('close', () => {
  tooltip.hidden = true;
  panelAnchor.after(panel);
  document.getElementById('heatmap').dispatchEvent(new Event('heatmap-layout'));
  tooltipAnchor.after(tooltip);
  document.body.classList.remove('heatmap-dialog-open');
  expand.focus();
});

// Native dialog supplies Escape handling, focus containment, and an inert background.
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) closeChart();
});
