// Shared utilities for foundrydata packages

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const formatErrorMessage = (error: Error): string => {
  return `[FoundryData] ${error.message}`;
};
