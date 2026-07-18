// Server-only route — computes a perceptual "average hash" (aHash) of an
// uploaded photo. This is a free, local alternative to an external image
// API: shrink to 8x8 grayscale, compare each pixel to the mean brightness,
// and encode that as a 64-bit fingerprint. Visually similar photos produce
// hashes with a small Hamming distance; see submit_report() in
// supabase/migration_5_photo_dedup.sql for how that's used to catch
// duplicates the location+category check misses.
import { NextResponse } from "next/server";
import sharp from "sharp";

export async function POST(request) {
  const { imageBase64 } = await request.json();
  if (!imageBase64) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(imageBase64, "base64");
    const { data } = await sharp(buffer)
      .resize(8, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = Array.from(data);
    const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;

    let bits = "";
    for (const p of pixels) bits += p >= mean ? "1" : "0";

    // Pack the 64-bit binary string into 16 hex characters.
    let hex = "";
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }

    return NextResponse.json({ hash: hex });
  } catch (err) {
    console.error("Error hashing image:", err);
    return NextResponse.json({ error: "Failed to process image." }, { status: 500 });
  }
}
