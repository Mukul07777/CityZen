// Server-only route — this is the ONLY place GROQ_API_KEY is used.
// It never reaches the browser because this file runs on the server
// (Next.js Route Handler), unlike the NEXT_PUBLIC_ Supabase keys.
import { NextResponse } from "next/server";

const CATEGORIES = ["Garbage", "Telephone Wires", "Electricity", "Road", "Others"];

export async function POST(request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const { imageBase64, mimeType } = await request.json();
  if (!imageBase64) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }

  const model = process.env.GROQ_VISION_MODEL || "llama-3.2-11b-vision-preview";

  const prompt = `You are looking at a photo of a civic/municipal issue (garbage, damaged road, broken electricity pole, downed telephone wires, or similar). Respond with ONLY a JSON object, no other text, in this exact shape:
{"title": "short 5-8 word title", "description": "1-2 sentence description of what's visibly wrong", "category": "one of: ${CATEGORIES.join(", ")}", "severity": "Low, Medium, or High based on visible safety/urgency risk"}`;

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}` },
              },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq API error:", groqRes.status, errText);
      return NextResponse.json(
        { error: `Groq API error (${groqRes.status}). Check GROQ_VISION_MODEL is a valid current model.` },
        { status: 502 }
      );
    }

    const data = await groqRes.json();
    const raw = data.choices?.[0]?.message?.content || "";

    // Model may wrap JSON in ```json fences despite instructions — strip those.
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Couldn't parse AI response as JSON.", raw },
        { status: 502 }
      );
    }

    if (!CATEGORIES.includes(parsed.category)) {
      parsed.category = "Others";
    }
    if (!["Low", "Medium", "High"].includes(parsed.severity)) {
      parsed.severity = "Medium";
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Error calling Groq:", err);
    return NextResponse.json({ error: "Failed to analyze photo." }, { status: 500 });
  }
}
