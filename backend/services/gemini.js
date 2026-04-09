require('dotenv').config();
const { GoogleGenAI } = require("@google/genai");
console.log("Checking API Key:", process.env.GEMINI_API_KEY ? "Key Found!" : "Key NOT Found");
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function parseInvoicePDF(pdfBuffer, glList = []) {

  console.log("------ INVOICE PARSE START ------");

  if (!process.env.GEMINI_API_KEY) {
    return emptyResponse();
  }

  try {

    const base64PDF = pdfBuffer.toString("base64");

    const glOptions = glList
      .map(gl => `${gl.code} - ${gl.name}`)
      .join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: "application/pdf",
            data: base64PDF,
          },
        },
        {
          text: `
You are a finance invoice parser.

Read the invoice carefully.

Return JSON with:

vendorName
invoiceNumber
date
dueDate
amount
tax

lineItems: array with
- description
- amount
- glCode

GL Codes allowed:

${glOptions}

Rules:
• Split invoice into logical cost components
• Each line item must have a GL code
• GL must be from the list
• If unsure leave glCode empty
• Sum of line items must match amount
• Return valid JSON only
`,
        },
      ],
    });

    const raw = response.text;

    console.log("RAW GEMINI RESPONSE:", raw);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (!jsonMatch) throw new Error("No JSON returned");

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      vendorName: parsed.vendorName || "",
      invoiceNumber: parsed.invoiceNumber || "",
      amount: Number(parsed.amount) || 0,
      tax: Number(parsed.tax) || 0,
      date: parsed.date || "",
      dueDate: parsed.dueDate || "",
      lineItems: parsed.lineItems || [],
    };

  } catch (err) {

    console.error("GEMINI ERROR:", err);

    return emptyResponse();

  }
}

function emptyResponse() {

  return {
    vendorName: "",
    invoiceNumber: "",
    amount: 0,
    tax: 0,
    date: "",
    dueDate: "",
    lineItems: []
  };

}

module.exports = {
  parseInvoicePDF
};