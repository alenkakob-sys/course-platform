import { getSessionAndProfile } from '../auth.js?v=20260827-3';

const result = await getSessionAndProfile();
if (!result) {
  window.location.href = 'login.html';
} else {
  window.location.href = result.profile?.role === 'admin' ? 'admin-manage.html' : 'courses.html';
}
