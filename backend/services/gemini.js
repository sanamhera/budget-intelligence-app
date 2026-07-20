/**
 * Gemini via Vertex AI (GCP project billing / ADC on Cloud Run).
 * Does not use AI Studio API keys.
 */
const { GoogleGenAI } = require("@google/genai");

let _ai = null;

function getAI() {
  if (_ai) return _ai;

  const project =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.GCLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "asia-south1";

  if (!project) {
    console.error("Vertex AI: GOOGLE_CLOUD_PROJECT is not set");
    return null;
  }

  _ai = new GoogleGenAI({
    vertexai: true,
    project,
    location,
  });
  console.log(`Vertex AI Gemini client ready (project=${project}, location=${location})`);
  return _ai;
}

async function parseInvoicePDF(pdfBuffer, glList = []) {
  const ai = getAI();
  if (!ai) return emptyResponse();

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

async function parseNFAPDF(pdfBuffer) {
  const ai = getAI();
  if (!ai) return emptyNFAResponse();

  try {
    const base64PDF = pdfBuffer.toString("base64");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: { mimeType: "application/pdf", data: base64PDF },
        },
        {
          text: `You are a finance document parser specialising in NFA (Note for Approval) documents.

Read the document carefully and extract the following fields from the exact sections specified.

Return ONLY valid JSON with these fields:
- nfaNumber: taken from the "Request No" field at the top of the document (string)
- title: taken from the "Subject" field (string)
- description: taken from the "Description" field (string, preserve the full text)
- amount: taken from the "Financial Impact" field — extract the numeric value only, no currency symbols (number)
- vendorName: vendor or supplier name if mentioned anywhere in the document (string, empty string if not found)
- date: document date in YYYY-MM-DD format (string, empty string if not found)

Rules:
• Return valid JSON only — no markdown, no explanation
• Map fields strictly to the sections named above — do not infer from other sections
• If a field is not found leave it as empty string or 0
• amount must be a number (not a string)`,
        },
      ],
    });

    const raw = response.text;
    console.log("RAW GEMINI NFA RESPONSE:", raw);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON returned");

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      nfaNumber:   parsed.nfaNumber   || "",
      title:       parsed.title       || "",
      description: parsed.description || "",
      amount:      Number(parsed.amount) || 0,
      vendorName:  parsed.vendorName  || "",
      date:        parsed.date        || "",
    };
  } catch (err) {
    console.error("GEMINI NFA ERROR:", err);
    return emptyNFAResponse();
  }
}

async function parsePOPDF(pdfBuffer) {
  const ai = getAI();
  if (!ai) return emptyPOResponse();

  try {
    const base64PDF = pdfBuffer.toString("base64");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: { mimeType: "application/pdf", data: base64PDF },
        },
        {
          text: `You are a finance document parser specialising in Purchase Order (PO) documents.

Read the document carefully and extract the following fields.

Return ONLY valid JSON with these fields:
- poNumber: the PO number or reference number (string)
- vendorName: vendor or supplier name (string)
- amount: total PO value in numbers only, no currency symbols (number)
- description: scope of work or goods/services description (string, max 3 sentences)
- date: PO date in YYYY-MM-DD format (string, empty string if not found)
- lineItems: array of line items, each with:
    - description (string)
    - quantity (number, 0 if not stated)
    - unitPrice (number, 0 if not stated)
    - amount (number)

Rules:
• Return valid JSON only — no markdown, no explanation
• If a field is not found leave it as empty string or 0
• amount fields must be numbers (not strings)
• lineItems may be an empty array if no line items are found`,
        },
      ],
    });

    const raw = response.text;
    console.log("RAW GEMINI PO RESPONSE:", raw);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON returned");

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      poNumber:    parsed.poNumber    || "",
      vendorName:  parsed.vendorName  || "",
      amount:      Number(parsed.amount) || 0,
      description: parsed.description || "",
      date:        parsed.date        || "",
      lineItems:   Array.isArray(parsed.lineItems) ? parsed.lineItems : [],
    };
  } catch (err) {
    console.error("GEMINI PO ERROR:", err);
    return emptyPOResponse();
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

function emptyNFAResponse() {
  return { nfaNumber: "", title: "", description: "", amount: 0, vendorName: "", date: "" };
}

function emptyPOResponse() {
  return { poNumber: "", vendorName: "", amount: 0, description: "", date: "", lineItems: [] };
}

module.exports = {
  getAI,
  parseInvoicePDF,
  parseNFAPDF,
  parsePOPDF,
};
