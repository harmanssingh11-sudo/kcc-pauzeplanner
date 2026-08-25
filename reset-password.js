(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  function escapeHtml(str) { return String(str).replace(/[&<>\"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;' }[c])); }
  function msg(text, kind) { $('rpMsg').innerHTML = `<div class="alert ${kind}">${escapeHtml(text)}</div>`; }
  function parseHash() { const hash = location.hash.replace(/^#/, ''); const params = new URLSearchParams(hash); return { access_token: params.get('access_token'), refresh_token: params.get('refresh_token'), type: params.get('type'), error_description: params.get('error_description') }; }
  const hashData = parseHash();
  if (hashData.error_description) { msg('Deze link is niet (meer) geldig: ' + decodeURIComponent(hashData.error_description) + '. Vraag opnieuw een reset-link aan via de inlogpagina.', 'error'); $('rpForm').style.display = 'none'; }
  else if (!hashData.access_token) { msg('Geen geldige reset-link gevonden. Open de link uit je e-mail opnieuw, of vraag een nieuwe aan via de inlogpagina.', 'error'); $('rpForm').style.display = 'none'; }
  $('rpForm').addEventListener('submit', async (ev) => { ev.preventDefault(); if ($('rpPassword').value !== $('rpPassword2').value) return msg('De wachtwoorden komen niet overeen.', 'error'); const btn = ev.target.querySelector('button'); btn.disabled = true; try { await window.KccAuth.updatePassword(hashData.access_token, $('rpPassword').value); msg('Wachtwoord opgeslagen! Je wordt doorgestuurd naar het inloggen...', 'ok'); setTimeout(() => { location.href = 'login.html'; }, 1500); } catch (e) { msg('Opslaan is mislukt: ' + e.message, 'error'); } finally { btn.disabled = false; } });
})();