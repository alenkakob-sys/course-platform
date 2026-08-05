import { getSessionAndProfile } from '../auth.js';

const result = await getSessionAndProfile();
if (!result) {
  window.location.href = 'login.html';
} else {
  window.location.href = result.profile?.role === 'admin' ? 'admin.html' : 'courses.html';
}
