import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility helper die clsx en tailwind-merge combineert om dynamische en conditionele
 * Tailwind CSS classes conflictloos en overzichtelijk samen te voegen.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
