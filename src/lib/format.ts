export function formatColones(amount: number): string {
  const rounded = Math.round(amount).toString();
  return "\u20A1" + rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
