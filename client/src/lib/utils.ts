import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getAvatarUrl = (url: string | null | undefined) => {
  if (!url) return undefined;
  // If it's an absolute URL (starts with http:// or https://) or a data URL, use it as is
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  // Otherwise, it's a relative path, ensure it starts with /
  return url.startsWith('/') ? url : `/${url}`;
};
