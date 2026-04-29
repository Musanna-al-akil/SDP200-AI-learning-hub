const DICEBEAR_ADVENTURER_BASE_URL = "https://api.dicebear.com/9.x/adventurer/svg";

export function buildUserAvatarUrl(name: string | null | undefined): string {
  const seed = name?.trim() ? encodeURIComponent(name.trim()) : "user";
  return `${DICEBEAR_ADVENTURER_BASE_URL}?seed=${seed}`;
}

export function getInitials(name: string | null | undefined): string {
  const words = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "U";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
