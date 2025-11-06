import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Merge Tailwind classes while keeping conditional ergonomics from clsx
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
