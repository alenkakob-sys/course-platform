// Єдине місце з публічними налаштуваннями сайту.
// SUPABASE_URL і SUPABASE_ANON_KEY — це ті самі значення, що раніше
// були в Netlify (Project URL і anon public key з Supabase).
// Це не секрети — anon-ключ призначений бути публічним, увесь
// реальний захист даних забезпечує Row Level Security в базі.
export const SUPABASE_URL = 'https://uzoyjlnzezswoxxizoha.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6b3lqbG56ZXpzd294eGl6b2hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NDYyNDAsImV4cCI6MjEwMTQyMjI0MH0.pqUqeN1qg7AuL-vnDxYBNBJpQjG1NScmGdLNJJ51mU8';

// Адреса, де реально живе сайт (для посилань у Telegram-сповіщеннях).
export const SITE_URL = 'https://alenkakob-sys.github.io/course-platform'; 

// Адреса окремого міні-проєкту на Netlify, який обробляє Telegram
export const FUNCTIONS_URL = 'https://course-platform-functions.netlify.app/.netlify/functions';
