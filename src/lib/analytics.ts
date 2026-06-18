export function getPeriodRange(periodo: string): { start: string; end: string } {
  const now = new Date();
  const crNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Costa_Rica' }));
  const start = new Date(crNow);

  switch (periodo) {
    case 'hoy':
      start.setHours(0, 0, 0, 0);
      break;
    case 'semana':
      start.setDate(crNow.getDate() - crNow.getDay());
      start.setHours(0, 0, 0, 0);
      break;
    case 'mes':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'anio':
    case 'año':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'todo':
    default:
      return { start: '2000-01-01T00:00:00.000Z', end: crNow.toISOString() };
  }

  const end = new Date(crNow);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function getPrevPeriodRange(periodo: string): { start: string; end: string } {
  const now = new Date();
  const crNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Costa_Rica' }));
  const end = new Date(crNow);
  const start = new Date(crNow);

  switch (periodo) {
    case 'hoy': {
      start.setDate(crNow.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(crNow.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'semana': {
      const dow = crNow.getDay();
      start.setDate(crNow.getDate() - dow - 7);
      start.setHours(0, 0, 0, 0);
      end.setDate(crNow.getDate() - dow - 1);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'mes': {
      start.setMonth(crNow.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(crNow.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'anio':
    case 'año': {
      start.setFullYear(crNow.getFullYear() - 1, 0, 1);
      start.setHours(0, 0, 0, 0);
      end.setFullYear(crNow.getFullYear() - 1, 11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    }
    default:
      return { start: '2000-01-01T00:00:00.000Z', end: '2000-01-01T00:00:00.000Z' };
  }

  return { start: start.toISOString(), end: end.toISOString() };
}
