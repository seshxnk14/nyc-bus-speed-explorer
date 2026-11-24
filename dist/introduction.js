const dialog = document.getElementById('intro-dialog');
const openButton = document.getElementById('intro-open');
const closeButton = document.getElementById('intro-close');
const seenKey = 'nyc-bus-speed-explorer:introduction:v1';
let returnFocus = openButton;

function openIntro(automatic = false) {
  if (dialog.open || document.querySelector('dialog[open]')) return;
  returnFocus = automatic ? document.getElementById('borough') : openButton;
  dialog.showModal();
  document.body.classList.add('introduction-open');
  closeButton.focus();
}
openButton.addEventListener('click', () => openIntro());
closeButton.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  document.body.classList.remove('introduction-open');
  try { localStorage.setItem(seenKey, 'seen'); } catch {}
  if (returnFocus && !returnFocus.disabled) returnFocus.focus();
  else openButton.focus();
});
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
let seen = false;
try { seen = localStorage.getItem(seenKey) === 'seen'; } catch {}
if (!seen) openIntro(true);
