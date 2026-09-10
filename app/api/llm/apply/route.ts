import { NextResponse } from "next/server";
import { LlmApplySchema } from "@/lib/validation";
import { applyLlmSelection, LlmParametersMissingError } from "@/lib/llm/apply";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = LlmApplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json(await applyLlmSelection(parsed.data));
  } catch (error) {
    if (error instanceof LlmParametersMissingError) {
      return NextResponse.json({ error: error.message, keys: error.keys }, { status: 409 });
    }
    throw error;
  }
}
