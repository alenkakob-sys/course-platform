import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/courses` },
    });
    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
      return;
    }
    setStatus('sent');
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 8 }}>Вхід на курс</h1>
      <p style={{ fontSize: 14, color: '#666', marginBottom: 24 }}>
        Введіть email — ми надішлемо посилання для входу, пароль не потрібен.
      </p>

      {status === 'sent' ? (
        <div style={{ fontSize: 14 }}>
          <p>
            Лист надіслано на <b>{email}</b>. Перейдіть за посиланням у листі, щоб увійти.
          </p>
          <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
            Якщо не бачите лист протягом кількох хвилин — перевірте теку &quot;Спам&quot;:
            лист приходить від нашого поштового сервісу, а не з особистої пошти.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: 10, fontSize: 14, border: '1px solid #ccc', borderRadius: 8, marginBottom: 12 }}
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            style={{ width: '100%', padding: 10, fontSize: 14, borderRadius: 8, background: '#111', color: '#fff', border: 'none' }}
          >
            {status === 'sending' ? 'Надсилаємо…' : 'Отримати посилання для входу'}
          </button>
          {status === 'error' && (
            <p style={{ color: 'crimson', fontSize: 13, marginTop: 8 }}>{errorMsg}</p>
          )}
        </form>
      )}
    </div>
  );
}
