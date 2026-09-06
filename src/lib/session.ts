import { auth } from "@/auth";

/** Returns the authenticated user id, or throws a 401 error. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) {
    throw new SessionError("Unauthorized");
  }
  return id;
}

export class SessionError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "SessionError";
    this.status = status;
  }
}
