import { getSessionAndProfile } from '../auth.js?v=20261113-1';

const result = await getSessionAndProfile();
if (!result) {
  window.location.href = 'login.html';
} else {
  window.location.href = result.profile?.role === 'admin' ? 'admin-manage-students.html' : 'courses.html';
}
