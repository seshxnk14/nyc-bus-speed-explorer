const region = document.getElementById('heat-scroll-region');
const controls = document.querySelector('.heat-scroll-controls');
const left = document.getElementById('heat-scroll-left');
const right = document.getElementById('heat-scroll-right');
let pending = false;
function update() {
  pending = false;
  const maximum = region.scrollWidth - region.clientWidth;
  controls.hidden = maximum <= 2;
  left.disabled = region.scrollLeft <= 2;
  right.disabled = region.scrollLeft >= maximum - 2;
}
function schedule() {
  if (!pending) { pending = true; requestAnimationFrame(update); }
}
const behavior = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
left.onclick = () => region.scrollBy({left: -region.clientWidth * 0.7, behavior: behavior()});
right.onclick = () => region.scrollBy({left: region.clientWidth * 0.7, behavior: behavior()});
region.addEventListener('scroll', schedule, {passive: true});
new ResizeObserver(schedule).observe(region);
new MutationObserver(schedule).observe(document.getElementById('heatmap'), {childList: true, subtree: true, attributes: true});
window.addEventListener('resize', schedule);
schedule();
