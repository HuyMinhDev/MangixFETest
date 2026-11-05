import { facebookLogin } from "@/lib/server/auth";

export async function POST(request: Request) {
  return facebookLogin(request);
}
