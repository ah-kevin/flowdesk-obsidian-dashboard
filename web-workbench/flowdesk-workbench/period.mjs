const shanghaiDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

function day(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value || '')) return null;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function periodRange(from, to, now = new Date()) {
  const today = shanghaiDate.format(now);
  if (from === null && to === null) {
    const monday = day(today);
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    const start = monday.toISOString().slice(0, 10);
    monday.setUTCDate(monday.getUTCDate() + 6);
    return { from: start, to: monday.toISOString().slice(0, 10), today };
  }
  return day(from) && day(to) && from <= to ? { from, to, today } : null;
}
