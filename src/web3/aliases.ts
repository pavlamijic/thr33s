// Alias service for storing player nicknames
// Stored in localStorage, keyed by address

const ALIASES_STORAGE_KEY = 'thr33s_aliases';

export interface AliasMap {
  [address: string]: string;
}

// Load all aliases from localStorage
function loadAliases(): AliasMap {
  try {
    const stored = localStorage.getItem(ALIASES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

// Save aliases to localStorage
function saveAliases(aliases: AliasMap): void {
  localStorage.setItem(ALIASES_STORAGE_KEY, JSON.stringify(aliases));
}

// Get alias for an address
export function getAlias(address: string): string | null {
  const aliases = loadAliases();
  // Check both original and lowercase versions
  return aliases[address] || aliases[address.toLowerCase()] || null;
}

// Set alias for an address
export function setAlias(address: string, alias: string): void {
  const aliases = loadAliases();
  const normalizedAddress = address.toLowerCase();

  if (alias.trim() === '') {
    // Remove alias if empty
    delete aliases[normalizedAddress];
  } else {
    // Store with trimmed alias (max 20 chars)
    aliases[normalizedAddress] = alias.trim().slice(0, 20);
  }

  saveAliases(aliases);
}

// Get display name for an address (alias or truncated address)
export function getDisplayName(address: string): string {
  const alias = getAlias(address);
  if (alias) {
    return alias;
  }
  // Truncate address
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Check if an address has an alias
export function hasAlias(address: string): boolean {
  return getAlias(address) !== null;
}
