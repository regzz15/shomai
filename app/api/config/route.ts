import { get } from "@vercel/edge-config";

export const runtime = "nodejs";

const defaultPiecesPerStock = 30;

export async function GET() {
  let piecesPerStock = defaultPiecesPerStock;

  if (process.env.EDGE_CONFIG) {
    const edgeValue = await get("piecesPerStock");
    const numericValue = Number(edgeValue);

    if (Number.isFinite(numericValue) && numericValue > 0) {
      piecesPerStock = numericValue;
    }
  }

  return Response.json({ piecesPerStock });
}
