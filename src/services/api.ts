export interface Transaction {
  date: string;
  amount: number;
  currency: string;
  type: "Gelir" | "Gider" | "Sabit Gider" | "Yatırım";
  user: "Evşan" | "Mahmut";
  paymentMethod: "Kredi Kartı" | "Nakit";
  paymentType: "Tek Çekim" | "Taksit" | "Kredi Kartı Borç Ödemesi";
  category: string;
  description: string;
  bank?: string;
}

export interface ExchangeRates {
  [key: string]: any;
  lastUpdated?: string;
  error?: string;
}

export interface Filter {
  name: string;
  user: string;
  category: string;
  value: number;
  description: string;
}

export interface ApiResponse {
  entries: Transaction[];
  filters: Filter[];
  configMissing: boolean;
  message?: string;
}

export async function fetchEntries(refresh = false): Promise<ApiResponse> {
  const url = refresh ? `/api/entries?t=${Date.now()}` : "/api/entries";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Google Sheets bağlantısı başarısız oldu.");
  return res.json();
}

export async function saveEntry(entry: Transaction): Promise<void> {
  const res = await fetch("/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error("Failed to save entry");
}

export async function fetchRates(): Promise<ExchangeRates> {
  const res = await fetch("/api/exchange-rates");
  if (!res.ok) throw new Error("Failed to fetch rates");
  return res.json();
}
