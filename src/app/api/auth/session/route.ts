import { getSession } from "@/lib/server/auth";

export async function GET(request: Request) {
  return getSession(request);
}
