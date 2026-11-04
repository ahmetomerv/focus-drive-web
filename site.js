'use strict';

const year = document.getElementById('current-year');
if (year) year.textContent = new Date().getFullYear();

for (const button of document.querySelectorAll('.faq-question')) {
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    document.getElementById(button.getAttribute('aria-controls')).hidden = expanded;
  });
}

const preview = document.getElementById('phoneModal');
if (preview) {
  const image = document.getElementById('modalImage');
  let trigger;
  let previousOverflow;

  for (const button of document.querySelectorAll('[data-preview]')) {
    button.addEventListener('click', () => {
      trigger = button;
      image.src = button.dataset.preview;
      image.alt = button.dataset.previewAlt;
      previousOverflow = document.body.style.overflow;
      preview.showModal();
      document.body.style.overflow = 'hidden';
    });
  }

  preview.querySelector('.close-modal').addEventListener('click', () => preview.close());
  // Keep both Tab directions on the dialog's only interactive control.
  preview.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      preview.querySelector('.close-modal').focus();
    }
  });
  preview.addEventListener('click', (event) => {
    if (event.target === preview) {
      const bounds = preview.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) preview.close();
    }
  });
  // Native dialog supplies Escape dismissal and makes the background inert.
  preview.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    trigger?.focus();
  });
}
