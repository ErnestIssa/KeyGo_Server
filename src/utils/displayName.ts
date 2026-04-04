/**
 * Short label for chat: given name(s) + first letter of family name, e.g. "Maria Jose G."
 */
export function formatChatDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  fullName?: string | null
): string {
  const fn = firstName?.trim();
  const ln = lastName?.trim();
  if (fn && ln) {
    return `${fn} ${ln.charAt(0).toUpperCase()}.`;
  }
  const full = fullName?.trim() ?? '';
  if (!full) return 'User';
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'User';
  if (parts.length === 1) return parts[0];
  const given = parts.slice(0, -1).join(' ');
  const last = parts[parts.length - 1];
  return `${given} ${last.charAt(0).toUpperCase()}.`;
}
