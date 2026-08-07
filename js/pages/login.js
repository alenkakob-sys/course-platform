import { supabase } from '../supabaseClient.js';
import { SITE_URL } from '../config.js';

document.getElementById('google-btn').addEventListener('click', async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${SITE_URL}/index.html` },
  });
});

document.getElementById('email-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email-input').value;
  const errorEl = document.getElementById('error-text');
  errorEl.style.display = 'none';

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${SITE_URL}/index.html` },
  });

  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  document.getElementById('email-form').style.display = 'none';
  document.getElementById('sent-email').textContent = email;
  document.getElementById('sent-block').style.display = 'block';
});
