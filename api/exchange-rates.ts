import dotenv from "dotenv";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

dotenv.config();

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. Fetch Fiat Rates (USD/TRY, USD/EUR)
    const frankLink = "https://api.frankfurter.app/latest?from=USD&to=TRY,EUR";
    const frankRes = await fetch(frankLink);
    const frankData: any = await frankRes.json();
    
    const usdTry = frankData.rates.TRY;
    const usdEur = frankData.rates.EUR;
    const eurTry = usdTry / usdEur;

    // 2. Fetch Commodity Prices (XAU/USD, XAG/USD) - Using a fallback strategy
    let xauUsdPrice = 2350; // Fallback Ounce Gold Price
    let xagUsdPrice = 28;   // Fallback Ounce Silver Price
    const usdTryPrice = usdTry;
    
    try {
      const metalApiKey = process.env.METAL_API_KEY;
      if (metalApiKey) {
        // Fetch Gold Data
        const goldRes = await fetch("https://www.goldapi.io/api/XAU/USD", {
          headers: { "x-access-token": metalApiKey }
        });
        if (goldRes.ok) {
          const goldData: any = await goldRes.json();
          if (goldData && (goldData.price || goldData.rates?.XAU)) {
            xauUsdPrice = goldData.price || goldData.rates.XAU;
          }
        }

        // Fetch Silver Data (Ensuring separate fetching and parsing)
        const silverRes = await fetch("https://www.goldapi.io/api/XAG/USD", {
          headers: { "x-access-token": metalApiKey }
        });
        if (silverRes.ok) {
          const silverData: any = await silverRes.json();
          if (silverData && (silverData.price || silverData.rates?.XAG)) {
            xagUsdPrice = silverData.price || silverData.rates.XAG;
          }
        }
      }
    } catch (e) {
      console.warn("Metal API fetch failed, using fallback ounce prices.");
    }

    // 3. Math: Gram Calculation (Following user formula)
    // Gram = (OuncePrice / 31.1035) * USD_TRY
    const gramGoldTry = (xauUsdPrice / 31.1035) * usdTryPrice;
    const gramSilverTry = (xagUsdPrice / 31.1035) * usdTryPrice;

    res.status(200).json({
      USD: usdTry,
      EUR: eurTry,
      XAU: gramGoldTry, 
      XAG: gramSilverTry,
      TRY: 1,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error("Exchange rate fetch error:", error);
    res.status(200).json({
      USD: 33.5,
      EUR: 36.5,
      XAU: 2500, // Reasonable Gram Gold price in TL
      XAG: 32,   // Reasonable Gram Silver price in TL
      TRY: 1,
      error: "Kurlar güncellenemedi, lütfen internet bağlantınızı kontrol edin.",
      lastUpdated: new Date().toISOString()
    });
  }
}
