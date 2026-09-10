import { NextResponse } from "next/server";
import { getSavedEstimates } from "@/lib/estimates";

export async function GET() {
  return NextResponse.json(await getSavedEstimates());
}
