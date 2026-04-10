/**
 * Convert Bot API channel/supergroup ID to MTProto channel ID.
 * Bot API adds -100 prefix to channel IDs: -100{channelId}
 */
export function toMtprotoChannelId(botApiId: number): number {
  const s = String(botApiId);
  if (s.startsWith("-100")) {
    return Number(s.slice(4));
  }
  // Already a positive MTProto ID or a regular group ID
  return Math.abs(botApiId);
}
