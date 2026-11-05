import { googleLogin } from "@/lib/server/auth";

export async function POST(request: Request) {
  return googleLogin(request);
}
