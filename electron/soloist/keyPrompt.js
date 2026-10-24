'use strict';
// electron/soloist/keyPrompt.js
// A single password input; never stores or logs the secret in the renderer.
document.getElementById('form').addEventListener('submit', async event => {
  event.preventDefault();
  const field = document.getElementById('key');
  const button = document.querySelector('button');
  const error = document.getElementById('error');
  button.disabled = true;
  error.textContent = '';
  const value = field.value;
  field.value = '';
  try {
    const reply = await window.soloistSetup.saveKey(value);
    if (!reply?.ok) error.textContent = reply?.message || 'Could not save the API key.';
  } catch { error.textContent = 'Could not contact Folia. Try again.'; }
  button.disabled = false;
});
