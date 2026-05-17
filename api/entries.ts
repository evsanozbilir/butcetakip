import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

// Google Sheets Config
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const auth = new google.auth.JWT({
  email: GOOGLE_CLIENT_EMAIL,
  key: GOOGLE_PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

export default async function handler(req: any, res: any) {
  if (req.method === "GET") {
    try {
      if (!SPREADSHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        console.warn("Google Sheets configuration is incomplete.");
        return res.status(200).json({ 
          entries: [], 
          filters: [],
          configMissing: true 
        });
      }
      
      const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: SPREADSHEET_ID,
        ranges: ["Filters!A2:E", "Dataset!A2:I"],
      });

      const filterRows = response.data.valueRanges?.[0]?.values || [];
      const entryRows = response.data.valueRanges?.[1]?.values || [];

      const filters = filterRows.map(row => ({
        name: row[0] || "",
        user: row[1] || "",
        category: row[2] || "",
        value: parseFloat(row[3]) || 0,
        description: row[4] || ""
      }));

      const entries = entryRows.map((row) => ({
        date: row[0] || "",
        amount: parseFloat(row[1]) || 0,
        currency: row[2] || "TRY",
        type: row[3] || "Gider",
        user: row[4] || "Mahmut",
        paymentMethod: row[5] || "Nakit",
        paymentType: row[6] || "Tek Çekim",
        category: row[7] || "Diğer",
        description: row[8] || "",
        bank: row[9] || "",
      }));

      res.status(200).json({ entries, filters, configMissing: false });
    } catch (error: any) {
      console.error("Critical error in /api/entries:", error);
      res.status(500).json({ error: "Failed to connect to Google Sheets", details: error.message });
    }
  } else if (req.method === "POST") {
    try {
      if (!SPREADSHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        return res.status(400).json({ error: "Google Sheets ayarları eksik." });
      }
      
      const { 
        date, amount, currency, type, user, 
        paymentMethod, paymentType, category, description, bank,
        installments = 1
      } = req.body;

      const valuesToAppend: any[][] = [];

      if (type === "Gider" && paymentType === "Taksit" && installments > 1) {
        const amountPerInstallment = Math.round((amount / installments) * 100) / 100;
        
        // Expected input date: YYYY-MM-DD
        let baseDate: Date;
        if (date.includes("-")) {
          const [y, m, d] = date.split("-").map(Number);
          baseDate = new Date(y, m - 1, d);
        } else {
          // Fallback for old DD/MM/YYYY
          const [d, m, y] = date.split("/").map(Number);
          baseDate = new Date(y, m - 1, d);
        }
        
        for (let i = 0; i < installments; i++) {
          const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
          const formattedDate = d.toISOString().split('T')[0]; // Strictly YYYY-MM-DD
          
          valuesToAppend.push([
            formattedDate, amountPerInstallment, currency, type, user, 
            paymentMethod, paymentType, category, 
            `${description} (${i + 1}/${installments})`, bank || ""
          ]);
        }
      } else {
        // Ensure the single entry date is also formatted strictly
        let finalDate = date;
        if (date.includes("/")) {
          const [d, m, y] = date.split("/").map(Number);
          const dObj = new Date(y, m - 1, d);
          if (!isNaN(dObj.getTime())) {
            finalDate = dObj.toISOString().split('T')[0];
          }
        }

        valuesToAppend.push([
          finalDate, amount, currency, type, user, 
          paymentMethod, paymentType, category, description, bank || ""
        ]);
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "Dataset!A2:J",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: valuesToAppend,
        },
      });

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("Error saving entry:", error);
      res.status(500).json({ error: "Veri kaydedilemedi: " + error.message });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
