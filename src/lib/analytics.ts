const CR_OFFSET_HOURS = 6; // CR is UTC-6, midnight CR = 06:00 UTC

function getCRNow(): Date {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = f.formatToParts(new Date());
  const y = parseInt(p.find(x => x.type === 'year')!.value);
  const m = parseInt(p.find(x => x.type === 'month')!.value) - 1;
  const d = parseInt(p.find(x => x.type === 'day')!.value);
  const h = parseInt(p.find(x => x.type === 'hour')!.value);
  const min = parseInt(p.find(x => x.type === 'minute')!.value);
  const s = parseInt(p.find(x => x.type === 'second')!.value);
  return new Date(Date.UTC(y, m, d, h + CR_OFFSET_HOURS, min, s));
}

function getCRStart(periodo: string): Date {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p = f.formatToParts(new Date());
  const y = parseInt(p.find(x => x.type === 'year')!.value);
  const m = parseInt(p.find(x => x.type === 'month')!.value) - 1;
  const d = parseInt(p.find(x => x.type === 'day')!.value);
  const crMidnight = new Date(Date.UTC(y, m, d, CR_OFFSET_HOURS, 0, 0));

  switch (periodo) {
    case 'hoy':
      return crMidnight;
    case 'semana': {
      const start = new Date(crMidnight);
      const crNow = getCRNow();
      start.setUTCDate(start.getUTCDate() - crNow.getUTCDay());
      return start;
    }
    case 'mes':
      return new Date(Date.UTC(y, m, 1, CR_OFFSET_HOURS, 0, 0));
    case 'anio':
    case 'año':
      return new Date(Date.UTC(y, 0, 1, CR_OFFSET_HOURS, 0, 0));
    default:
      return new Date('2000-01-01T00:00:00.000Z');
  }
}

function getCRDateOnly(): { y: number; m: number; d: number } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p = f.formatToParts(new Date());
  return {
    y: parseInt(p.find(x => x.type === 'year')!.value),
    m: parseInt(p.find(x => x.type === 'month')!.value),
    d: parseInt(p.find(x => x.type === 'day')!.value),
  };
}

export function getPeriodRange(periodo: string): { start: string; end: string } {
  const start = getCRStart(periodo);
  const end = new Date();
  return { start: start.toISOString(), end: end.toISOString() };
}

export function getPrevPeriodRange(periodo: string): { start: string; end: string } {
  const { y, m, d } = getCRDateOnly();
  const crMidnight = new Date(Date.UTC(y, m - 1, d, CR_OFFSET_HOURS, 0, 0));
  const crNow = getCRNow();

  switch (periodo) {
    case 'hoy': {
      const start = new Date(crMidnight);
      start.setUTCDate(start.getUTCDate() - 1);
      const end = new Date(start);
      end.setUTCHours(23, 59, 59, 999);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'semana': {
      const dow = crNow.getUTCDay();
      const start = new Date(crMidnight);
      start.setUTCDate(start.getUTCDate() - dow - 7);
      const end = new Date(crMidnight);
      end.setUTCDate(end.getUTCDate() - dow - 1);
      end.setUTCHours(23, 59, 59, 999);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'mes': {
      const start = new Date(Date.UTC(y, m - 2, 1, CR_OFFSET_HOURS, 0, 0));
      const end = new Date(Date.UTC(y, m - 1, 0, 23 + CR_OFFSET_HOURS, 59, 59, 999));
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'anio':
    case 'año': {
      const start = new Date(Date.UTC(y - 1, 0, 1, CR_OFFSET_HOURS, 0, 0));
      const end = new Date(Date.UTC(y - 1, 11, 31, 23 + CR_OFFSET_HOURS, 59, 59, 999));
      return { start: start.toISOString(), end: end.toISOString() };
    }
    default:
      return { start: '2000-01-01T00:00:00.000Z', end: '2000-01-01T00:00:00.000Z' };
  }
}
