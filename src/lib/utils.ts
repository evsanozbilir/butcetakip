import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency === "XAU" || currency === "XAG" ? "TRY" : currency,
    minimumFractionDigits: 2,
  }).format(amount) + (currency === "XAU" ? " (Gold)" : currency === "XAG" ? " (Silver)" : "");
}
