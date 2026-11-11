export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ServiceError) {
    return error.message;
  }

  return fallback;
}
