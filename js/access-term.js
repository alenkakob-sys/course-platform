// ЄДИНЕ джерело правила строку доступу. Його читають і адмінка (коли відкриває
// доступ), і попередження учениці — щоб дата в обох місцях була та сама.
//
// Купила 12-го → доступ працює весь день 12-го наступного місяця, а 13-го вже
// закритий. Тому повертаємо ПОЧАТОК 13-го.
// 31 січня підтягуємо до останнього дня лютого: інакше браузер сам перекинув
// би дату на 3 березня.
export function monthAccessExpiry(from = new Date(), months = 1) {
  const day = from.getDate();
  const end = new Date(from.getFullYear(), from.getMonth() + months, 1);
  const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  end.setDate(Math.min(day, lastDay));
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  return end;
}

// Скільки повних днів лишилось. У expires_at лежить початок дня, коли доступ
// уже закритий, тому останній робочий день — попередній.
export function accessDaysLeft(expiresAt, now = new Date()) {
  const end = new Date(expiresAt);
  return Math.ceil((end.getTime() - now.getTime()) / 86400000) - 1;
}

// В expires_at лежить момент, коли доступу ВЖЕ немає. Людині треба показувати
// останній день, коли курс ще працює, інакше дата читається на добу пізніше.
export function accessLastDay(expiresAt) {
  const day = new Date(expiresAt);
  day.setDate(day.getDate() - 1);
  return day;
}
