export function formatDuration(milliseconds: number): string {
  const safeMilliseconds = Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0);
  const totalSeconds = safeMilliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds % 1) * 10);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
}
